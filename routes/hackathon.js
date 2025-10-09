const express = require('express');
const pool = require('../db');
const router = express.Router();

// Create hackathon
router.post('/create', async (req, res) => {
  const { title, clientName, executionDate, executedBy, description, registrationLink, skillsFocused, status } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
  const [result] = await pool.execute(
    'INSERT INTO hackathons (title, client_name, execution_date, executed_by, description, registration_link, skills_focused, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, clientName, executionDate, executedBy, description, registrationLink, skillsFocused, status || 'scheduled']
  );
  res.json({ message: 'Hackathon created', id: result.insertId });
});

// List hackathons
router.get('/', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM hackathons ORDER BY execution_date DESC');
  res.json(rows);
});

// Get by ID
router.get('/:id', async (req, res) => {
  const [[hackathon]] = await pool.execute('SELECT * FROM hackathons WHERE id = ?', [req.params.id]);
  if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });
  res.json(hackathon);
});

// Update hackathon
router.put('/:id', async (req, res) => {
  const { title, clientName, executionDate, executedBy, description, registrationLink, skillsFocused, status } = req.body;
  let fields = [], values = [];
  if (title) { fields.push('title = ?'); values.push(title); }
  if (clientName) { fields.push('client_name = ?'); values.push(clientName); }
  if (executionDate) { fields.push('execution_date = ?'); values.push(executionDate); }
  if (executedBy) { fields.push('executed_by = ?'); values.push(executedBy); }
  if (description) { fields.push('description = ?'); values.push(description); }
  if (registrationLink) { fields.push('registration_link = ?'); values.push(registrationLink); }
  if (skillsFocused) { fields.push('skills_focused = ?'); values.push(skillsFocused); }
  if (status) { fields.push('status = ?'); values.push(status); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const [result] = await pool.execute(`UPDATE hackathons SET ${fields.join(', ')} WHERE id = ?`, values);
  if (!result.affectedRows) return res.status(404).json({ error: 'Hackathon not found' });
  res.json({ message: 'Hackathon updated' });
});

// Delete hackathon
router.delete('/:id', async (req, res) => {
  const [result] = await pool.execute('DELETE FROM hackathons WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Hackathon not found' });
  res.json({ message: 'Hackathon deleted' });
});

router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;

    // Validate status
    const validStatuses = ['upcoming', 'ongoing', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const limit = Math.max(0, parseInt(req.query.limit ) || 10);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    console.log({ limit, offset });

    const [rows] = await pool.promise().execute(
      'SELECT * FROM candidates WHERE status = ? ORDER BY created_at DESC',
      [status, limit, offset]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching candidates by status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;