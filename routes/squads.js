const express = require('express');
const pool = require('../db');
const router = express.Router();

// Create squad
router.post('/', async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !Array.isArray(memberIds)) return res.status(400).json({ error: 'Name and memberIds required' });
  const [squadRes] = await pool.query('INSERT INTO squads (name) VALUES (?)', [name]);
  const squadId = squadRes.insertId;
  for (const candidateId of memberIds) {
    await pool.query('INSERT INTO squad_members (squad_id, candidate_id) VALUES (?, ?)', [squadId, candidateId]);
  }
  res.json({ message: 'Squad created', squad: { id: squadId, name, memberIds } });
});
router.get('/available-candidates', async (req, res) => {
  console.log("first")
  try {
    // Step 1: Get candidate IDs with 'present' attendance
    const [presentRows] = await pool.query(
      "SELECT DISTINCT candidate_id FROM attendance WHERE status = 'present'"
    );
    const presentIds = presentRows.map((row) => row.candidate_id);

    if (presentIds.length === 0) {
      return res.json([]); // no present candidates
    }

    // Step 2: Get candidate IDs already assigned to squads
    const [assignedRows] = await pool.query(
      "SELECT DISTINCT candidate_id FROM squad_members"
    );
   
    const assignedIds = assignedRows.map((row) => row.candidate_id);

    // Step 3: Filter out assigned candidates
    const availableIds = presentIds.filter(id => !assignedIds.includes(id));
 
    if (availableIds.length === 0) {
      return res.json([]); // no available candidates
    }

    // Step 4: Fetch candidate details
    const [candidates] = await pool.query(
      `SELECT * FROM candidates WHERE id IN (${availableIds.map(() => '?').join(',')}) ORDER BY name ASC`,
      availableIds
    );

    res.json(candidates);
  } catch (error) {
    console.error("Error fetching available candidates:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get squads (with members)
router.get('/list', async (req, res) => {
  try {
    const [squads] = await pool.query('SELECT * FROM squads ORDER BY created_at DESC');

    for (const squad of squads) {
      // Get members
      const [members] = await pool.query(
        `SELECT c.*, i.data AS imageData 
         FROM squad_members sm 
         JOIN candidates c ON sm.candidate_id = c.id 
         LEFT JOIN images i ON i.candidate_id = c.id 
         WHERE sm.squad_id = ?`,
        [squad.id]
      );

      // Convert image binary to base64
     const membersWithImages = members.map((member) => ({

  id: member.id,

  name: member.name,

  email: member.email,

imageBase64: member.imageData
  ? `data:image/jpeg;base64,${Buffer.from(member.imageData).toString('base64')}`
  : null,


}));

squad.members = membersWithImages;


    res.json(squads);
}
  } catch (error) {
    console.error('Error fetching squads with images:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get squad by ID
router.get('/:id', async (req, res) => {
  const [[squad]] = await pool.query('SELECT * FROM squads WHERE id = ?', [req.params.id]);
  if (!squad) return res.status(404).json({ error: 'Squad not found' });
  const [members] = await pool.query(
    'SELECT c.* FROM squad_members sm JOIN candidates c ON sm.candidate_id = c.id WHERE sm.squad_id = ?', [req.params.id]
  );
  squad.members = members;
  res.json(squad);
});

// Update squad
router.put('/:id', async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  await pool.query('UPDATE squads SET name = ? WHERE id = ?', [name, req.params.id]);
  if (Array.isArray(memberIds)) {
    await pool.query('DELETE FROM squad_members WHERE squad_id = ?', [req.params.id]);
    for (const candidateId of memberIds) {
      await pool.query('INSERT INTO squad_members (squad_id, candidate_id) VALUES (?, ?)', [req.params.id, candidateId]);
    }
  }
  res.json({ message: 'Squad updated' });
});

// Delete squad
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM squad_members WHERE squad_id = ?', [req.params.id]);
  const [result] = await pool.query('DELETE FROM squads WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Squad not found' });
  res.json({ message: 'Squad deleted' });
});



module.exports = router;