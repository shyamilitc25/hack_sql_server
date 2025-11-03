const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// JWT Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access token required" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Admin login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res
      .status(400)
      .json({ error: "Username and password are required" });

  const [[admin]] = await pool.query(
    "SELECT * FROM admins WHERE username = ?",
    [username]
  );
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, admin.password_hash);
  if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
  res.json({
    message: "Login successful",
    token,
    admin: { id: admin.id, username: admin.username },
  });
});

// Create admin
router.post("/create", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res
      .status(400)
      .json({ error: "Username and password are required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
      [username, hashedPassword]
    );
    const [[admin]] = await pool.query(
      "SELECT * FROM admins WHERE username = ?",
      [username]
    );
    res.json({
      message: "Admin created successfully",
      admin: { id: admin.id, username },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(500)
        .json({ error: "Admin with this username already exists" });
    res.status(500).json({ error: "Error creating admin" });
  }
});

// Dashboard endpoint
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    // Get total counts
    const [[hackathonCount]] = await pool.query("SELECT COUNT(*) as count FROM hackathons WHERE status != 'deleted'");
    const [[candidateCount]] = await pool.query("SELECT COUNT(*) as count FROM candidates");
    const [[squadCount]] = await pool.query("SELECT COUNT(*) as count FROM squads");
    const [[attendanceToday]] = await pool.query(
      "SELECT COUNT(*) as count FROM attendance WHERE DATE(check_in_time) = CURDATE()"
    );

    res.json({
      totalHackathons: hackathonCount.count,
      totalCandidates: candidateCount.count,
      totalSquads: squadCount.count,
      todayAttendance: attendanceToday.count
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Recent activity endpoint
router.get("/recent-activity", authenticateToken, async (req, res) => {
  try {
    const [activities] = await pool.query(`
      SELECT 
        'hackathon' as type,
        title as description,
        created_at as timestamp
      FROM hackathons 
      WHERE status != 'deleted'
      
      UNION ALL
      
      SELECT 
        'candidate' as type,
        CONCAT('New candidate: ', name) as description,
        created_at as timestamp
      FROM candidates
      
      UNION ALL
      
      SELECT 
        'attendance' as type,
        CONCAT('Attendance recorded') as description,
        check_in_time as timestamp
      FROM attendance
      
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    res.json(activities);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// University stats endpoint (for compatibility)
router.get("/university-stats", authenticateToken, async (req, res) => {
  try {
    // Since this is a hackathon system, we'll return hackathon status distribution
    // in the format expected by the Dashboard (array of objects)
    const [statusStats] = await pool.query(`
      SELECT 
        CASE 
          WHEN status = 'upcoming' THEN 'Upcoming Hackathons'
          WHEN status = 'ongoing' THEN 'Ongoing Hackathons'
          WHEN status = 'completed' THEN 'Completed Hackathons'
          WHEN status = 'scheduled' THEN 'Scheduled Hackathons'
          ELSE 'Other Status'
        END as university,
        COUNT(*) as count
      FROM hackathons 
      WHERE status != 'deleted'
      GROUP BY status
      ORDER BY count DESC
    `);

    res.json(statusStats);
  } catch (error) {
    console.error("Error fetching university stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Attendance trends endpoint
router.get("/attendance-trends", authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    
    const [trends] = await pool.query(`
      SELECT 
        DATE(check_in_time) as date,
        COUNT(*) as count
      FROM attendance 
      WHERE check_in_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(check_in_time)
      ORDER BY date DESC
    `, [days]);

    res.json(trends);
  } catch (error) {
    console.error("Error fetching attendance trends:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
