const express = require('express');
const pool = require('../db');
const router = express.Router();

// Create squad
router.post('/', async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !Array.isArray(memberIds)) return res.status(400).json({ error: 'Name and memberIds required' });
  const [squadRes] = await pool.execute('INSERT INTO squads (name) VALUES (?)', [name]);
  const squadId = squadRes.insertId;
  for (const candidateId of memberIds) {
    await pool.execute('INSERT INTO squad_members (squad_id, candidate_id) VALUES (?, ?)', [squadId, candidateId]);
  }
  res.json({ message: 'Squad created', squad: { id: squadId, name, memberIds } });
});

// Get squads (with members)
router.get('/', async (req, res) => {
  const [squads] = await pool.execute('SELECT * FROM squads ORDER BY created_at DESC');
  for (const squad of squads) {
    const [members] = await pool.execute(
      'SELECT c.* FROM squad_members sm JOIN candidates c ON sm.candidate_id = c.id WHERE sm.squad_id = ?', [squad.id]
    );
    squad.members = members;
  }
  res.json(squads);
});

// Get squad by ID
router.get('/:id', async (req, res) => {
  const [[squad]] = await pool.execute('SELECT * FROM squads WHERE id = ?', [req.params.id]);
  if (!squad) return res.status(404).json({ error: 'Squad not found' });
  const [members] = await pool.execute(
    'SELECT c.* FROM squad_members sm JOIN candidates c ON sm.candidate_id = c.id WHERE sm.squad_id = ?', [req.params.id]
  );
  squad.members = members;
  res.json(squad);
});

// Update squad
router.put('/:id', async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  await pool.execute('UPDATE squads SET name = ? WHERE id = ?', [name, req.params.id]);
  if (Array.isArray(memberIds)) {
    await pool.execute('DELETE FROM squad_members WHERE squad_id = ?', [req.params.id]);
    for (const candidateId of memberIds) {
      await pool.execute('INSERT INTO squad_members (squad_id, candidate_id) VALUES (?, ?)', [req.params.id, candidateId]);
    }
  }
  res.json({ message: 'Squad updated' });
});

// Delete squad
router.delete('/:id', async (req, res) => {
  await pool.execute('DELETE FROM squad_members WHERE squad_id = ?', [req.params.id]);
  const [result] = await pool.execute('DELETE FROM squads WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Squad not found' });
  res.json({ message: 'Squad deleted' });
});

module.exports = router;