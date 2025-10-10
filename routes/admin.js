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

// All other endpoints should use async/await and pool.query for MySQL
// (dashboard, recent-activity, update, delete, etc.)
// See previous SQLite code, just swap out db.run/db.get/db.all for pool.query

module.exports = router;
