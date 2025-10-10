const express = require("express");
const pool = require("../db");
const router = express.Router();

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

    const [result] = await pool.execute(
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
    const [[savedHackathon]] = await pool.execute(
      "SELECT * FROM hackathons WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json(savedHackathon);
  } catch (error) {
    console.error("Error creating hackathon:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
app.get("/hackathon/:hackathonId/squads/pdf", async (req, res) => {
  const { hackathonId } = req.params;

  try {
    // Fetch squads and members
    const [squads] = await db.query(
      `SELECT s.id as squad_id, s.name as squad_name
       FROM squads s
       JOIN hackathons h ON h.id = ?`,
      [hackathonId]
    );

    if (squads.length === 0) {
      return res.status(404).json({ message: "No squads found" });
    }

    // Create PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=hackathon_${hackathonId}_squads.pdf`
    );

    doc.pipe(res);

    for (const squad of squads) {
      doc.fontSize(18).text(`Squad: ${squad.squad_name}`, { underline: true });
      doc.moveDown();

      // Fetch members for squad
      const [members] = await db.query(
        `SELECT c.name, c.skills, i.data
         FROM squad_members sm
         JOIN candidates c ON c.id = sm.candidate_id
         LEFT JOIN images i ON i.candidate_id = c.id
         WHERE sm.squad_id = ?`,
        [squad.squad_id]
      );

      for (const member of members) {
        doc.fontSize(12).text(`Name: ${member.name}`);
        doc.text(`Skills: ${member.skills || "N/A"}`);

        if (member.data) {
          const imgBuffer = Buffer.from(member.data);
          doc.image(imgBuffer, { width: 80, height: 80 });
        }

        doc.moveDown();
      }

      doc.addPage(); // Next squad in a new page
    }

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// List hackathons (with pagination & search)

// Get hackathon by ID
router.get("/:id", async (req, res) => {
  try {
    const [[hackathon]] = await pool.execute(
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
    const [result] = await pool.execute(
      `UPDATE hackathons SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: "Hackathon not found" });

    // Return updated hackathon
    const [[updatedHackathon]] = await pool.execute(
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
    const [result] = await pool.execute(
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

    const limit = Math.max(0, parseInt(req.query.limit) || 10);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const [rows] = await pool.execute(
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
import React from "react";
import axios from "axios";

const SquadPrintButton = ({ hackathonId }) => {
  const handlePrint = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/hackathon/${hackathonId}/squads/pdf`,
        { responseType: "blob" } // Important for PDF
      );

      // Create blob and download
      const blob = new Blob([response.data], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `hackathon_${hackathonId}_squads.pdf`;
      link.click();
    } catch (error) {
      console.error(error);
      alert("Error generating PDF");
    }
  };

  return (
    <button
      onClick={handlePrint}
      className="bg-blue-500 text-white px-4 py-2 rounded"
    >
      Print Squads
    </button>
  );
};

export default SquadPrintButton;
