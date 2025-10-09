const express = require("express");
const multer = require("multer");
const QRCode = require("qrcode");
const XLSX = require("xlsx");
const csv = require("csv-parser");
const path = require("path");
const fs = require("fs");
const pool = require("../db");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage });

// Generate QR code string for candidate
const generateQRCode = async (candidateId) => {
  const qrData = `HACKATHON_${candidateId}_${Date.now()}`;
  const qrCodePath = path.join(
    __dirname,
    "../uploads",
    `qr_${candidateId}.png`
  );
  await QRCode.toFile(qrCodePath, qrData, {
    color: { dark: "#000", light: "#fff" },
  });
  return qrData;
};

// List candidates (pagination/search)
router.get("/", async (req, res) => {
  try {
    let { page = "1", limit = "10", search = "" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = "";
    let searchParams = [];
    if (search && search.trim() !== "") {
      whereClause = `
        WHERE name LIKE ? OR email LIKE ? OR university LIKE ? OR degree LIKE ? OR skills LIKE ?
      `;
      searchParams = Array(5).fill(`%${search}%`);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM candidates ${whereClause}`;
    const [[{ total }]] = await pool.execute(countQuery, searchParams);

    // Get paginated candidates
    const dataQuery = `SELECT * FROM candidates ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [candidates] = await pool.execute(dataQuery, [
      ...searchParams,
      limitNum,
      offset,
    ]);

    res.json({
      data: candidates,
      total,
      page: pageNum,
      pageSize: limitNum,
    });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Import candidates from Excel/CSV (with hackathonId)
router.post("/import-excel", upload.single("excelFile"), async (req, res) => {
  try {
    const hackathonId = req.body.hackathonId;
    // Check hackathon exists
    const [[hackathon]] = await pool.execute(
      "SELECT id FROM hackathons WHERE id = ?",
      [hackathonId]
    );
    if (!hackathon)
      return res.status(400).json({ error: "Invalid hackathon ID" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let data = [];
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === ".csv") {
      data = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on("data", (row) => results.push(row))
          .on("end", () => resolve(results))
          .on("error", (err) => reject(err));
      });
    } else {
      const workbook = XLSX.readFile(req.file.path);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(worksheet);
    }

    let importedCandidates = [];
    for (const row of data) {
      const candidate = {
        name: row.Name || row.name,
        email: row.Email || row.email,
        age: parseInt(row.Age || row.age) || null,
        degree: row.Degree || row.degree,
        university: row.University || row.university,
        batch: row.Batch || row.batch,
        phone: row.Phone || row.phone,
        skills: row.Skills || row.skills,
        photo_url: row.Photo || row.photo_url || null,
        hackathon_id: hackathonId,
      };
      if (!candidate.name || !candidate.email) continue;
      const [[existing]] = await pool.execute(
        "SELECT id FROM candidates WHERE email = ?",
        [candidate.email]
      );
      if (!existing) {
        const [result] = await pool.execute(
          "INSERT INTO candidates (name, age, degree, university, batch, phone, email, skills, photo_url, hackathon_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            candidate.name,
            candidate.age,
            candidate.degree,
            candidate.university,
            candidate.batch,
            candidate.phone,
            candidate.email,
            candidate.skills,
            candidate.photo_url,
            candidate.hackathon_id,
          ]
        );
        const qrCode = await generateQRCode(result.insertId);
        await pool.execute("UPDATE candidates SET qr_code = ? WHERE id = ?", [
          qrCode,
          result.insertId,
        ]);
        candidate.id = result.insertId;
        candidate.qr_code = qrCode;
        importedCandidates.push(candidate);
      }
    }
    fs.unlinkSync(req.file.path);
    res.json({
      message: `${
        ext === ".csv" ? "CSV" : "Excel"
      } file processed successfully`,
      importedCount: importedCandidates.length,
      candidates: importedCandidates,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error processing file" });
  }
});

// Get candidate by ID
router.get("/:id", async (req, res) => {
  try {
    const [[candidate]] = await pool.execute(
      "SELECT * FROM candidates WHERE id = ?",
      [req.params.id]
    );
    if (!candidate)
      return res.status(404).json({ error: "Candidate not found" });
    res.json(candidate);
  } catch (error) {
    console.error("Error fetching candidate:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update candidate
router.put(
  "/:id",
  upload.fields([{ name: "resume" }, { name: "selfie" }]),
  async (req, res) => {
    try {
      const { name, age, degree, university, batch, phone, email, skills } =
        req.body;
      let fields = [],
        values = [];
      if (name) {
        fields.push("name = ?");
        values.push(name);
      }
      if (age) {
        fields.push("age = ?");
        values.push(age);
      }
      if (degree) {
        fields.push("degree = ?");
        values.push(degree);
      }
      if (university) {
        fields.push("university = ?");
        values.push(university);
      }
      if (batch) {
        fields.push("batch = ?");
        values.push(batch);
      }
      if (phone) {
        fields.push("phone = ?");
        values.push(phone);
      }
      if (email) {
        fields.push("email = ?");
        values.push(email);
      }
      if (skills) {
        fields.push("skills = ?");
        values.push(skills);
      }
      if (req.files?.resume) {
        fields.push("resume_path = ?");
        values.push(req.files.resume[0].filename);
      }
      if (req.files?.selfie) {
        fields.push("selfie_path = ?");
        values.push(req.files.selfie[0].filename);
      }
      if (!fields.length)
        return res.status(400).json({ error: "No fields to update" });
      values.push(req.params.id);
      const [result] = await pool.execute(
        `UPDATE candidates SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
      if (!result.affectedRows)
        return res.status(404).json({ error: "Candidate not found" });
      res.json({ message: "Candidate updated successfully" });
    } catch (error) {
      console.error("Error updating candidate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get QR code string for candidate
router.get("/:id/qr-code", async (req, res) => {
  try {
    const [[candidate]] = await pool.execute(
      "SELECT qr_code FROM candidates WHERE id = ?",
      [req.params.id]
    );
    if (!candidate?.qr_code)
      return res.status(404).json({ error: "QR code not found" });
    res.json({ qrCode: candidate.qr_code });
  } catch (error) {
    console.error("Error fetching QR code:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get QR code image as Data URL
router.get("/:id/qr-image", async (req, res) => {
  try {
    const [[candidate]] = await pool.execute(
      "SELECT qr_code FROM candidates WHERE id = ?",
      [req.params.id]
    );
    if (!candidate?.qr_code)
      return res.status(404).json({ error: "QR code not found" });
    const qrCodeDataURL = await QRCode.toDataURL(candidate.qr_code, {
      color: { dark: "#000000", light: "#FFFFFF" },
      width: 300,
      margin: 2,
    });
    res.json({ qrCodeImage: qrCodeDataURL, qrCode: candidate.qr_code });
  } catch (error) {
    console.error("Error generating QR code image:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Generate new QR code for candidate
router.post("/:id/generate-qr", async (req, res) => {
  try {
    const qrCode = await generateQRCode(req.params.id);
    await pool.execute("UPDATE candidates SET qr_code = ? WHERE id = ?", [
      qrCode,
      req.params.id,
    ]);
    res.json({ message: "QR code generated", qrCode });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).json({ error: "Error generating QR code" });
  }
});

// Delete candidate by ID
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM candidates WHERE id = ?", [
      req.params.id,
    ]);
    if (!result.affectedRows)
      return res.status(404).json({ error: "Candidate not found" });
    res.json({ message: "Candidate deleted successfully" });
  } catch (error) {
    console.error("Error deleting candidate:", error);
    res.status(500).json({ error: "Server error while deleting candidate" });
  }
});

// Clear all candidates, squads, attendance
router.delete("/clear-all", async (req, res) => {
  try {
    await pool.execute("DELETE FROM squads");
    await pool.execute("DELETE FROM attendance");
    await pool.execute("DELETE FROM candidates");
    res.json({
      message: "All data cleared successfully",
      cleared: {
        candidates: true,
        attendance: true,
        squads: true,
      },
    });
  } catch (error) {
    console.error("Error clearing data:", error);
    res.status(500).json({ error: "Server error while clearing data" });
  }
});

module.exports = router;
