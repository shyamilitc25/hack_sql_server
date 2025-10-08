const express = require('express');
const multer = require('multer');
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
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Upload candidate image
router.post('/upload', upload.single('image'), async (req, res) => {
  const { candidateId } = req.body;
  if (!candidateId || !req.file) return res.status(400).json({ error: 'Candidate ID and image required' });
  await pool.execute('UPDATE candidates SET photo_url = ? WHERE id = ?', [req.file.filename, candidateId]);
  res.json({ message: 'Image uploaded', file: req.file.filename });
});

// Get candidate image
router.get('/:candidateId', async (req, res) => {
  const [[candidate]] = await pool.execute('SELECT photo_url FROM candidates WHERE id = ?', [req.params.candidateId]);
  if (!candidate?.photo_url) return res.status(404).json({ error: 'Image not found' });
  const imagePath = path.join(__dirname, '../uploads', candidate.photo_url);
  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(imagePath);
});

module.exports = router;