const express = require("express");
const pool = require("../db");
const PDFDocument = require("pdfkit");
const router = express.Router();
const fileType = require("file-type");

// Utility: Valid statuses for hackathon
const HackathonStatuses = [
  "upcoming",
  "ongoing",
  "completed",
  "deleted",
  "scheduled",
];

// Create hackathon
router.post("/create", async (req, res) => {
  try {
    const {
      title,
      clientName,
      executionDate,
      executedBy,
      description,
      registrationLink,
      skillsFocused,
    } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "Title and description are required." });
    }

    const [result] = await pool.query(
      "INSERT INTO hackathons (title, client_name, execution_date, executed_by, description, registration_link, skills_focused, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        title,
        clientName || null,
        executionDate || null,
        executedBy || null,
        description,
        registrationLink || null,
        skillsFocused || null,
        "scheduled", // Default status
      ]
    );
    // Get the created record
    const [[savedHackathon]] = await pool.query(
      "SELECT * FROM hackathons WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json(savedHackathon);
  } catch (error) {
    console.error("Error creating hackathon:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    let whereClause = "";
    let params = [];
    if (search) {
      whereClause = `WHERE title LIKE ? OR client_name LIKE ? OR executed_by LIKE ? OR description LIKE ? OR skills_focused LIKE ?`;
      for (let i = 0; i < 5; i++) params.push(`%${search}%`);
    }
    // Get total
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) as total FROM hackathons ${whereClause}`,
      params
    );
    const total = totalRows[0].total;
    // ✅ Fix: Directly inject limit & offset as safe numbers
    const sql = `
     SELECT * FROM hackathons
     ${whereClause}
     ORDER BY execution_date DESC
     LIMIT ${Number(limit)} OFFSET ${Number(skip)}
   `;
    const [hackathons] = await pool.query(sql, params);
    res.json({
      data: hackathons,
      total,
      page: Number(page),
      pageSize: Number(limit),
    });
  } catch (error) {
    console.error("Error fetching hackathons:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.get("/:hackathonId/squads/pdf", async (req, res) => {
  const { hackathonId } = req.params;

  try {
    const [squads] = await pool.query(
      `SELECT DISTINCT s.id AS squad_id, s.name AS squad_name
       FROM squads s
       JOIN squad_members sm ON sm.squad_id = s.id
       JOIN candidates c ON c.id = sm.candidate_id
    
       WHERE c.hackathon_id = ?`,
      [hackathonId]
    );

    if (squads.length === 0) {
      return res.status(404).json({ message: "No squads found for this hackathon" });
    }

    const squadsWithMembers = [];

    for (const squad of squads) {
      const [members] = await pool.query(
        `SELECT c.name, c.email, c.skills, i.data AS image_blob
         FROM squad_members sm
         JOIN candidates c ON c.id = sm.candidate_id
         LEFT JOIN images i ON i.candidate_id = c.id
         WHERE sm.squad_id = ?`,
        [squad.squad_id]
      );

      const membersWithBase64 = members.map((member) => ({
        name: member.name,
        email: member.email,
        skills: member.skills || "N/A",
        imageBase64: member.image_blob
          ? `data:image/jpeg;base64,${Buffer.from(member.image_blob).toString("base64")}`
          : null,
      }));
      //console.log({membersWithBase64})

      squadsWithMembers.push({
        squad_id: squad.squad_id,
        squad_name: squad.squad_name,
        members: membersWithBase64,
      });

    }
    

    res.json(squadsWithMembers);
  } catch (error) {
    console.error("Error fetching squads:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// List hackathons (with pagination & search)

// Get hackathon by ID
router.get("/:id", async (req, res) => {
  try {
    const [[hackathon]] = await pool.query(
      "SELECT * FROM hackathons WHERE id = ?",
      [req.params.id]
    );
    if (!hackathon)
      return res.status(404).json({ error: "Hackathon not found" });
    res.json(hackathon);
  } catch (error) {
    console.error("Error fetching hackathon by ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update hackathon (PATCH-like, partial update)
router.put("/:id", async (req, res) => {
  try {
    const {
      title,
      clientName,
      executionDate,
      executedBy,
      description,
      registrationLink,
      skillsFocused,
      status,
    } = req.body;
    let fields = [],
      values = [];
    if (title) {
      fields.push("title = ?");
      values.push(title);
    }
    if (clientName) {
      fields.push("client_name = ?");
      values.push(clientName);
    }
    if (executionDate) {
      fields.push("execution_date = ?");
      values.push(executionDate);
    }
    if (executedBy) {
      fields.push("executed_by = ?");
      values.push(executedBy);
    }
    if (description) {
      fields.push("description = ?");
      values.push(description);
    }
    if (registrationLink) {
      fields.push("registration_link = ?");
      values.push(registrationLink);
    }
    if (skillsFocused) {
      fields.push("skills_focused = ?");
      values.push(skillsFocused);
    }
    if (status && HackathonStatuses.includes(status)) {
      fields.push("status = ?");
      values.push(status);
    }

    if (!fields.length)
      return res.status(400).json({ error: "No fields to update" });

    values.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE hackathons SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: "Hackathon not found" });

    // Return updated hackathon
    const [[updatedHackathon]] = await pool.query(
      "SELECT * FROM hackathons WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: "Hackathon updated", data: updatedHackathon });
  } catch (error) {
    console.error("Error updating hackathon:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Mark hackathon as deleted (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    // Mark as deleted instead of hard delete
    const [result] = await pool.query(
      "UPDATE hackathons SET status = ? WHERE id = ?",
      ["deleted", req.params.id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: "Hackathon not found" });
    res.json({ message: "Hackathon marked as deleted successfully" });
  } catch (error) {
    console.error("Error deleting hackathon:", error);
    res.status(500).json({ error: "Server error while deleting hackathon" });
  }
});

// List hackathons by status (with pagination)
router.get("/status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    // Validate status
    if (!HackathonStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    console.log({ status });
    const limit = Math.max(0, parseInt(req.query.limit) || 10);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const [rows] = await pool.query(
      "SELECT * FROM hackathons WHERE status = ? ORDER BY execution_date DESC LIMIT ? OFFSET ?",
      [status, limit, offset]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching hackathons by status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
