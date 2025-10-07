const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Generate QR code
const generateQRCode = async (candidateId) => {
  const qrData = `HACKATHON_${candidateId}_${Date.now()}`;
  const qrCodePath = path.join(__dirname, '../uploads', `qr_${candidateId}.png`);
  await QRCode.toFile(qrCodePath, qrData, { color: { dark: '#000', light: '#fff' } });
  return qrData;
};

// Import candidates from Excel/CSV
router.post('/import-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let data = [];
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.csv') {
      data = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on('data', row => results.push(row))
          .on('end', () => resolve(results))
          .on('error', err => reject(err));
      });
    } else {
      const workbook = XLSX.readFile(req.file.path);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(worksheet);
    }

    let imported = 0;
    for (const row of data) {
      const candidate = {
        name: row.Name || row.name,
        email: row.Email || row.email,
        age: parseInt(row.Age || row.age) || null,
        degree: row.Degree || row.degree,
        university: row.University || row.university,
        batch: row.Batch || row.batch,
        phone: row.Phone || row.phone,
        skills: row.Skills || row.skills,
        photo_url: row.Photo || row.photo_url || null
      };
      if (!candidate.name || !candidate.email) continue;
      const [[existing]] = await pool.execute('SELECT id FROM candidates WHERE email = ?', [candidate.email]);
      if (!existing) {
        const [result] = await pool.execute(
          'INSERT INTO candidates (name, age, degree, university, batch, phone, email, skills, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [candidate.name, candidate.age, candidate.degree, candidate.university, candidate.batch, candidate.phone, candidate.email, candidate.skills, candidate.photo_url]
        );
        const qrCode = await generateQRCode(result.insertId);
        await pool.execute('UPDATE candidates SET qr_code = ? WHERE id = ?', [qrCode, result.insertId]);
        imported++;
      }
    }
    fs.unlinkSync(req.file.path);
    res.json({ message: 'File processed', importedCount: imported });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error processing file' });
  }
});

// List candidates (pagination/search)
router.get('/', async (req, res) => {
  let { page = 1, limit = 10, search = '' } = req.query;
  page = parseInt(page); limit = parseInt(limit);
  const offset = (page - 1) * limit;
  let where = '';
  let params = [];
  if (search) {
    where = 'WHERE name LIKE ? OR email LIKE ? OR university LIKE ? OR degree LIKE ? OR skills LIKE ?';
    params = Array(5).fill(`%${search}%`);
  }
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) as total FROM candidates ${where}`, params);
  const [candidates] = await pool.execute(
    `SELECT * FROM candidates ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
  );
  res.json({ data: candidates, total, page, pageSize: limit });
});

// Get candidate by ID
router.get('/:id', async (req, res) => {
  const [[candidate]] = await pool.execute('SELECT * FROM candidates WHERE id = ?', [req.params.id]);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  res.json(candidate);
});

// Update candidate
router.put('/:id', upload.fields([{ name: 'resume' }, { name: 'selfie' }]), async (req, res) => {
  const { name, age, degree, university, batch, phone, email, skills } = req.body;
  let fields = [], values = [];
  if (name) { fields.push('name = ?'); values.push(name); }
  if (age) { fields.push('age = ?'); values.push(age); }
  if (degree) { fields.push('degree = ?'); values.push(degree); }
  if (university) { fields.push('university = ?'); values.push(university); }
  if (batch) { fields.push('batch = ?'); values.push(batch); }
  if (phone) { fields.push('phone = ?'); values.push(phone); }
  if (email) { fields.push('email = ?'); values.push(email); }
  if (skills) { fields.push('skills = ?'); values.push(skills); }
  if (req.files?.resume) { fields.push('resume_path = ?'); values.push(req.files.resume[0].filename); }
  if (req.files?.selfie) { fields.push('selfie_path = ?'); values.push(req.files.selfie[0].filename); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const [result] = await pool.execute(`UPDATE candidates SET ${fields.join(', ')} WHERE id = ?`, values);
  if (!result.affectedRows) return res.status(404).json({ error: 'Candidate not found' });
  res.json({ message: 'Candidate updated successfully' });
});

// Get QR code for candidate
router.get('/:id/qr-code', async (req, res) => {
  const [[candidate]] = await pool.execute('SELECT qr_code FROM candidates WHERE id = ?', [req.params.id]);
  if (!candidate?.qr_code) return res.status(404).json({ error: 'QR code not found' });
  res.json({ qrCode: candidate.qr_code });
});

// Generate new QR code for candidate
router.post('/:id/generate-qr', async (req, res) => {
  const qrCode = await generateQRCode(req.params.id);
  await pool.execute('UPDATE candidates SET qr_code = ? WHERE id = ?', [qrCode, req.params.id]);
  res.json({ message: 'QR code generated', qrCode });
});

// Delete candidate
router.delete('/:id', async (req, res) => {
  const [result] = await pool.execute('DELETE FROM candidates WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Candidate not found' });
  res.json({ message: 'Candidate deleted' });
});

module.exports = router;