const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/admin', require('./routes/admin'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/squads', require('./routes/squads'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/hackathon', require('./routes/hackathon'));
app.use('/api/image', require('./routes/image'));

app.get('/', (req, res) => res.json({ message: 'Hackathon server running!' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Hackathon server listening on port ${PORT}`);
});