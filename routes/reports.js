const express = require('express');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const router = express.Router();

// Comprehensive report
router.get('/comprehensive', async (req, res) => {
  try {
    const [candidates] = await pool.query(`
      SELECT c.*, COUNT(a.id) as total_attendance_days, MAX(a.check_in_time) as last_attendance
      FROM candidates c
      LEFT JOIN attendance a ON c.id = a.candidate_id
      GROUP BY c.id
      ORDER BY c.name
    `);

    const [squads] = await pool.query(`
      SELECT s.*, GROUP_CONCAT(c.name) as member_names, GROUP_CONCAT(c.skills) as member_skills
      FROM squads s
      LEFT JOIN squad_members sm ON s.id = sm.squad_id
      LEFT JOIN candidates c ON sm.candidate_id = c.id
      GROUP BY s.id
      ORDER BY s.name
    `);

    const [attendanceStats] = await pool.query(`
      SELECT DATE(check_in_time) as date,
             COUNT(*) as attendance_count,
             COUNT(CASE WHEN check_out_time IS NOT NULL THEN 1 END) as checked_out_count
      FROM attendance
      GROUP BY DATE(check_in_time)
      ORDER BY date DESC
    `);

    const [skillsDistribution] = await pool.query(`
      SELECT skills, COUNT(*) as count
      FROM candidates
      WHERE skills IS NOT NULL AND skills != ''
      GROUP BY skills
      ORDER BY count DESC
    `);

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalCandidates: candidates.length,
        totalSquads: squads.length,
        totalAttendanceDays: attendanceStats.reduce((sum, stat) => sum + stat.attendance_count, 0),
        averageAttendancePerDay: attendanceStats.length > 0 ?
          (attendanceStats.reduce((sum, stat) => sum + stat.attendance_count, 0) / attendanceStats.length).toFixed(2) : 0
      },
      candidates: candidates.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        university: c.university,
        skills: c.skills,
        totalAttendanceDays: c.total_attendance_days,
        lastAttendance: c.last_attendance,
        selfiePath: c.selfie_path,
        resumePath: c.resume_path
      })),
      squads: squads.map(s => ({
        id: s.id,
        name: s.name,
        memberNames: s.member_names ? s.member_names.split(',') : [],
        memberSkills: s.member_skills ? s.member_skills.split(',') : [],
        createdAt: s.created_at
      })),
      attendanceStats,
      skillsDistribution
    };
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generating report' });
  }
});

// Download Excel report
router.get('/download-excel', async (req, res) => {
  try {
    const [candidates] = await pool.query(`
      SELECT c.*, COUNT(a.id) as total_attendance_days, MAX(a.check_in_time) as last_attendance
      FROM candidates c
      LEFT JOIN attendance a ON c.id = a.candidate_id
      GROUP BY c.id
      ORDER BY c.name
    `);
    const [squads] = await pool.query(`
      SELECT s.*, GROUP_CONCAT(c.name) as member_names
      FROM squads s
      LEFT JOIN squad_members sm ON s.id = sm.squad_id
      LEFT JOIN candidates c ON sm.candidate_id = c.id
      GROUP BY s.id
      ORDER BY s.name
    `);
    const [attendance] = await pool.query(`
      SELECT a.id, c.name as candidate_name, c.email, a.check_in_time, a.check_out_time, a.status
      FROM attendance a
      JOIN candidates c ON a.candidate_id = c.id
      ORDER BY a.check_in_time DESC
    `);

    const workbook = XLSX.utils.book_new();
    const candidatesSheet = XLSX.utils.json_to_sheet(candidates.map(c => ({
      'ID': c.id, 'Name': c.name, 'Age': c.age, 'Degree': c.degree, 'University': c.university,
      'Batch': c.batch, 'Phone': c.phone, 'Email': c.email, 'Skills': c.skills,
      'Total Attendance Days': c.total_attendance_days, 'Last Attendance': c.last_attendance,
      'Registration Date': c.created_at
    })));
    XLSX.utils.book_append_sheet(workbook, candidatesSheet, 'Candidates');

    const squadsSheet = XLSX.utils.json_to_sheet(squads.map(s => ({
      'Squad ID': s.id, 'Squad Name': s.name, 'Members': s.member_names || '', 'Created Date': s.created_at
    })));
    XLSX.utils.book_append_sheet(workbook, squadsSheet, 'Squads');

    const attendanceSheet = XLSX.utils.json_to_sheet(attendance.map(a => ({
      'Attendance ID': a.id, 'Candidate Name': a.candidate_name, 'Email': a.email,
      'Check In Time': a.check_in_time, 'Check Out Time': a.check_out_time, 'Status': a.status
    })));
    XLSX.utils.book_append_sheet(workbook, attendanceSheet, 'Attendance');

    const fileName = `hackathon_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(__dirname, '../uploads', fileName);
    XLSX.writeFile(workbook, filePath);
    res.download(filePath, fileName, err => {
      if (err) console.error('Send file error:', err);
      setTimeout(() => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }, 5000);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generating Excel report' });
  }
});

module.exports = router;