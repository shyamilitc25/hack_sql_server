const express = require("express");
const pool = require("../db");
const router = express.Router();

// 1. Scan QR code and mark attendance
router.post("/scan-qr", async (req, res) => {
  const { qrCode } = req.body;
  if (!qrCode) return res.status(400).json({ error: "QR code is required" });

  try {
    // Find candidate by QR code
    const [[candidate]] = await pool.execute(
      "SELECT * FROM candidates WHERE qr_code = ?",
      [qrCode]
    );
    if (!candidate) return res.status(404).json({ error: "Invalid QR code" });

    const todayStr = new Date().toISOString().split("T")[0];
    // Find today's attendance record
    const [records] = await pool.execute(
      `SELECT * FROM attendance
       WHERE candidate_id = ? AND DATE(check_in_time) = ?`,
      [candidate.id, todayStr]
    );
    const existingAttendance = records[0];

    if (existingAttendance) {
      if (!existingAttendance.check_out_time) {
        // Mark check-out
        await pool.execute(
          "UPDATE attendance SET check_out_time = ? WHERE id = ?",
          [new Date(), existingAttendance.id]
        );
        return res.json({
          message: "Check-out successful",
          candidate,
          attendance: {
            check_in_time: existingAttendance.check_in_time,
            check_out_time: new Date(),
            status: "checked_out",
          },
        });
      } else {
        return res.json({
          message: "Already checked out today",
          candidate,
          attendance: existingAttendance,
        });
      }
    } else {
      // Mark check-in
      const [result] = await pool.execute(
        "INSERT INTO attendance (candidate_id, check_in_time, status) VALUES (?, ?, ?)",
        [candidate.id, new Date(), "present"]
      );
      return res.json({
        message: "Check-in successful",
        candidate,
        attendance: {
          check_in_time: new Date(),
          status: "present",
        },
      });
    }
  } catch (error) {
    console.error("Error scanning QR code:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 1. Scan QR code from scanner with candidateId
router.post("/scan-qr-scanner", async (req, res) => {
  const { candidateId } = req.body;
  if (!candidateId)
    return res.status(400).json({ error: "Candidate ID is required" });

  try {
    const [[candidate]] = await pool.execute(
      "SELECT * FROM candidates WHERE id = ?",
      [candidateId]
    );
    if (!candidate) return res.status(404).json({ error: "Invalid candidate" });

    const todayStr = new Date().toISOString().split("T")[0];
    const [records] = await pool.execute(
      `SELECT * FROM attendance
       WHERE candidate_id = ? AND DATE(check_in_time) = ?`,
      [candidate.id, todayStr]
    );
    const existingAttendance = records[0];

    if (existingAttendance) {
      if (!existingAttendance.check_out_time) {
        // Mark check-out
        await pool.execute(
          "UPDATE attendance SET check_out_time = ? WHERE id = ?",
          [new Date(), existingAttendance.id]
        );
        return res.json({
          message: "Check-out successful",
          candidate,
          attendance: {
            check_in_time: existingAttendance.check_in_time,
            check_out_time: new Date(),
            status: "checked_out",
          },
        });
      } else {
        return res.json({
          message: "Already checked out today",
          candidate,
          attendance: existingAttendance,
        });
      }
    } else {
      // Mark check-in
      await pool.execute(
        "INSERT INTO attendance (candidate_id, check_in_time, status) VALUES (?, ?, ?)",
        [candidate.id, new Date(), "present"]
      );
      return res.json({
        message: "Check-in successful",
        candidate,
        attendance: {
          check_in_time: new Date(),
          status: "present",
        },
      });
    }
  } catch (error) {
    console.error("Error scanning QR code:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Get attendance for a specific candidate
router.get("/candidate/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [attendance] = await pool.execute(
      `SELECT a.*, c.* FROM attendance a
       INNER JOIN candidates c ON a.candidate_id = c.id
       WHERE a.candidate_id = ?
       ORDER BY a.check_in_time DESC`,
      [id]
    );
    res.json(attendance);
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. Get all attendance records with pagination (and optional date filter)
router.get("/", async (req, res) => {
  const { date, page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const offset = (pageNum - 1) * pageSize;

  try {
    let filterSql = "";
    let filterParams = [];
    if (date) {
      filterSql = "WHERE DATE(check_in_time) = ?";
      filterParams.push(date);
    }

    // Get total count
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) as total FROM attendance ${filterSql}`,
      filterParams
    );

    // Get data
    const [data] = await pool.execute(
      `SELECT a.*, c.* FROM attendance a
       INNER JOIN candidates c ON a.candidate_id = c.id
       ${filterSql}
       ORDER BY a.check_in_time DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, pageSize, offset]
    );
    res.json({ data, total, page: pageNum, pageSize });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 4. Get attendance statistics
router.get("/stats", async (req, res) => {
  const { date } = req.query;
  try {
    let filterSql = "";
    let filterParams = [];
    if (date) {
      filterSql = "WHERE DATE(check_in_time) = ?";
      filterParams.push(date);
    }

    // Total attendance
    const [[{ total_attendance }]] = await pool.execute(
      `SELECT COUNT(*) as total_attendance FROM attendance ${filterSql}`,
      filterParams
    );

    // Currently present (not checked out)
    const [[{ currently_present }]] = await pool.execute(
      `SELECT COUNT(*) as currently_present FROM attendance
       ${filterSql ? filterSql + " AND " : "WHERE "} check_out_time IS NULL`,
      filterParams
    );

    // Checked out
    const [[{ checked_out }]] = await pool.execute(
      `SELECT COUNT(*) as checked_out FROM attendance
       ${
         filterSql ? filterSql + " AND " : "WHERE "
       } check_out_time IS NOT NULL`,
      filterParams
    );

    res.json({ total_attendance, currently_present, checked_out });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 5. Manual attendance update
router.put("/:id", async (req, res) => {
  const { status, check_in_time, check_out_time } = req.body;
  let fields = [],
    values = [];
  if (status) {
    fields.push("status = ?");
    values.push(status);
  }
  if (check_in_time) {
    fields.push("check_in_time = ?");
    values.push(new Date(check_in_time));
  }
  if (check_out_time) {
    fields.push("check_out_time = ?");
    values.push(new Date(check_out_time));
  }
  if (!fields.length)
    return res.status(400).json({ error: "No fields to update" });
  values.push(req.params.id);

  try {
    const [result] = await pool.execute(
      `UPDATE attendance SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: "Attendance record not found" });

    // Return updated record
    const [[updated]] = await pool.execute(
      "SELECT * FROM attendance WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: "Attendance updated successfully", updated });
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
