const express = require('express');
const pool = require('../db');
const router = express.Router();

// Mark attendance (scan QR)
router.post('/scan', async (req, res) => {
  const { qrCode } = req.body;
  if (!qrCode) return res.status(400).json({ error: 'QR code required' });
  const [[candidate]] = await pool.execute('SELECT * FROM candidates WHERE qr_code = ?', [qrCode]);
  if (!candidate) return res.status(404).json({ error: 'Invalid QR code' });

  const today = new Date().toISOString().split('T')[0];
  const [[attendance]] = await pool.execute(
    'SELECT * FROM attendance WHERE candidate_id = ? AND DATE(check_in_time) = ?', [candidate.id, today]
  );

  if (attendance) {
    if (!attendance.check_out_time) {
      await pool.execute('UPDATE attendance SET check_out_time = NOW(), status = "checked_out" WHERE id = ?', [attendance.id]);
      return res.json({
        message: 'Check-out successful',
        candidate,
        attendance: { check_in_time: attendance.check_in_time, check_out_time: new Date().toISOString(), status: 'checked_out' }
      });
    } else {
      return res.json({ message: 'Already checked out today', candidate, attendance });
    }
  } else {
    await pool.execute('INSERT INTO attendance (candidate_id, check_in_time, status) VALUES (?, NOW(), "present")', [candidate.id]);
    return res.json({ message: 'Check-in successful', candidate, attendance: { check_in_time: new Date().toISOString(), status: 'present' } });
  }
});

// Get attendance for candidate
router.get('/candidate/:id', async (req, res) => {
  const [attendance] = await pool.execute(
    `SELECT a.*, c.name, c.email, c.university, c.degree, c.skills, c.photo_url, c.selfie_path
     FROM attendance a JOIN candidates c ON a.candidate_id = c.id WHERE a.candidate_id = ? ORDER BY a.check_in_time DESC`,
    [req.params.id]
  );
  res.json(attendance);
});

// List attendance (pagination)
router.get('/', async (req, res) => {
  let { date, page = 1, limit = 10 } = req.query;
  page = parseInt(page); limit = parseInt(limit);
  const offset = (page - 1) * limit;
  let where = '', params = [];
  if (date) { where = 'WHERE DATE(a.check_in_time) = ?'; params.push(date); }
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) as total FROM attendance a JOIN candidates c ON a.candidate_id = c.id ${where}`, params
  );
  const [attendance] = await pool.execute(
    `SELECT a.*, c.name, c.email, c.university, c.degree, c.skills, c.photo_url, c.selfie_path
     FROM attendance a JOIN candidates c ON a.candidate_id = c.id ${where}
     ORDER BY a.check_in_time DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
  );
  res.json({ data: attendance, total, page, pageSize: limit });
});

// Attendance stats
router.get('/stats', async (req, res) => {
  const { date } = req.query;
  let where = '', params = [];
  if (date) { where = 'WHERE DATE(a.check_in_time) = ?'; params.push(date); }
  const [[stats]] = await pool.execute(
    `SELECT COUNT(*) as total_attendance,
            COUNT(CASE WHEN a.check_out_time IS NULL THEN 1 END) as currently_present,
            COUNT(CASE WHEN a.check_out_time IS NOT NULL THEN 1 END) as checked_out
     FROM attendance a ${where}`, params
  );
  res.json(stats);
});

// Update attendance manually
router.put('/:id', async (req, res) => {
  const { status, check_in_time, check_out_time } = req.body;
  let fields = [], values = [];
  if (status) { fields.push('status = ?'); values.push(status); }
  if (check_in_time) { fields.push('check_in_time = ?'); values.push(check_in_time); }
  if (check_out_time) { fields.push('check_out_time = ?'); values.push(check_out_time); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const [result] = await pool.execute(`UPDATE attendance SET ${fields.join(', ')} WHERE id = ?`, values);
  if (!result.affectedRows) return res.status(404).json({ error: 'Attendance not found' });
  res.json({ message: 'Attendance updated' });
});

module.exports = router;