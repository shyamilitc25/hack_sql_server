const express = require("express");
const pool = require("../db");
const OpenAI = require("openai");
const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Database query functions that the AI can call
const chatbotFunctions = {
  async getRecentHackathons({ limit = 4 } = {}) {
    try {
      const [rows] = await pool.query(
        `SELECT id, title, client_name, execution_date, executed_by, description, 
         skills_focused, status FROM hackathons 
         ORDER BY execution_date DESC LIMIT ?`,
        [parseInt(limit)]
      );
      return rows;
    } catch (error) {
      console.error("Error fetching recent hackathons:", error);
      return [];
    }
  },

  async getAttendanceStats({ date = null } = {}) {
    try {
      let filterSql = "";
      let filterParams = [];
      
      if (date) {
        filterSql = "WHERE DATE(check_in_time) = ?";
        filterParams.push(date);
      }

      // Total attendance
      const [[{ total_attendance }]] = await pool.query(
        `SELECT COUNT(*) as total_attendance FROM attendance ${filterSql}`,
        filterParams
      );

      // Currently present (not checked out)
      const [[{ currently_present }]] = await pool.query(
        `SELECT COUNT(*) as currently_present FROM attendance
         ${filterSql ? filterSql + " AND " : "WHERE "} check_out_time IS NULL`,
        filterParams
      );

      // Checked out
      const [[{ checked_out }]] = await pool.query(
        `SELECT COUNT(*) as checked_out FROM attendance
         ${
           filterSql ? filterSql + " AND " : "WHERE "
         } check_out_time IS NOT NULL`,
        filterParams
      );

      // Total registered candidates
      const [[{ total_candidates }]] = await pool.query(
        "SELECT COUNT(*) as total_candidates FROM candidates"
      );

      const attendance_rate = total_candidates > 0 ? 
        ((total_attendance / total_candidates) * 100).toFixed(2) : 0;

      return { 
        total_attendance, 
        currently_present, 
        checked_out, 
        total_candidates,
        attendance_rate: `${attendance_rate}%`,
        date: date || "all time"
      };
    } catch (error) {
      console.error("Error fetching attendance stats:", error);
      return null;
    }
  },

  async getHackathonsByStatus({ status } = {}) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM hackathons WHERE status = ? ORDER BY execution_date DESC",
        [status]
      );
      return rows;
    } catch (error) {
      console.error("Error fetching hackathons by status:", error);
      return [];
    }
  },

  async getCandidateCount({ hackathon_id = null } = {}) {
    try {
      let query = "SELECT COUNT(*) as count FROM candidates";
      let params = [];
      
      if (hackathon_id) {
        query += " WHERE hackathon_id = ?";
        params.push(hackathon_id);
      }
      
      const [[{ count }]] = await pool.query(query, params);
      return { count, hackathon_id };
    } catch (error) {
      console.error("Error fetching candidate count:", error);
      return { count: 0 };
    }
  },

  async getSquadInfo({ hackathon_id = null } = {}) {
    try {
      let query = `
        SELECT DISTINCT s.id AS squad_id, s.name AS squad_name,
        COUNT(sm.candidate_id) as member_count
        FROM squads s
        LEFT JOIN squad_members sm ON sm.squad_id = s.id
      `;
      let params = [];
      
      if (hackathon_id) {
        query += `
          LEFT JOIN candidates c ON c.id = sm.candidate_id
          WHERE c.hackathon_id = ?
        `;
        params.push(hackathon_id);
      }
      
      query += " GROUP BY s.id, s.name ORDER BY s.name";
      
      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error("Error fetching squad info:", error);
      return [];
    }
  },

  async getAttendanceByDate({ start_date, end_date } = {}) {
    try {
      let query = `
        SELECT DATE(a.check_in_time) as date, 
        COUNT(*) as daily_attendance,
        COUNT(CASE WHEN a.check_out_time IS NOT NULL THEN 1 END) as checked_out_count
        FROM attendance a
      `;
      let params = [];
      
      if (start_date && end_date) {
        query += " WHERE DATE(a.check_in_time) BETWEEN ? AND ?";
        params.push(start_date, end_date);
      } else if (start_date) {
        query += " WHERE DATE(a.check_in_time) >= ?";
        params.push(start_date);
      }
      
      query += " GROUP BY DATE(a.check_in_time) ORDER BY date DESC";
      
      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error("Error fetching attendance by date:", error);
      return [];
    }
  }
};

// Function definitions for OpenAI
const functionDefinitions = [
  {
    name: "getRecentHackathons",
    description: "Get the most recent hackathons from the database",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent hackathons to fetch (default: 4)",
          default: 4
        }
      }
    }
  },
  {
    name: "getAttendanceStats",
    description: "Get attendance statistics including total attendance, currently present, checked out, and attendance rate",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Optional date in YYYY-MM-DD format to filter attendance for a specific day"
        }
      }
    }
  },
  {
    name: "getHackathonsByStatus",
    description: "Get hackathons filtered by their status",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["upcoming", "ongoing", "completed", "deleted", "scheduled"],
          description: "Status of hackathons to filter by"
        }
      },
      required: ["status"]
    }
  },
  {
    name: "getCandidateCount",
    description: "Get the total number of candidates, optionally filtered by hackathon",
    parameters: {
      type: "object",
      properties: {
        hackathon_id: {
          type: "number",
          description: "Optional hackathon ID to filter candidates"
        }
      }
    }
  },
  {
    name: "getSquadInfo",
    description: "Get information about squads and their member counts",
    parameters: {
      type: "object",
      properties: {
        hackathon_id: {
          type: "number",
          description: "Optional hackathon ID to filter squads"
        }
      }
    }
  },
  {
    name: "getAttendanceByDate",
    description: "Get attendance data grouped by date within a date range",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format"
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format"
        }
      }
    }
  }
];

// Main chatbot endpoint
router.post("/chat", async (req, res) => {
  try {
    const { message, conversation_history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Prepare messages for OpenAI
    const messages = [
      {
        role: "system",
        content: `You are a helpful AI assistant for a hackathon management system. You can help users get information about:
        - Recent hackathons and their details
        - Attendance statistics and rates
        - Candidate information and counts
        - Squad information and member counts
        - Hackathon status updates
        
        Always provide helpful, accurate information based on the database queries. When presenting data, format it in a clear, readable way. If you need to call a function to get current data, do so. Be conversational and helpful.
        
        Current date: ${new Date().toISOString().split('T')[0]}`
      },
      ...conversation_history,
      {
        role: "user",
        content: message
      }
    ];

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      messages: messages,
      functions: functionDefinitions,
      function_call: "auto",
      temperature: 0.7,
      max_tokens: 1000
    });

    let response = completion.choices[0].message;

    // If OpenAI wants to call a function
    if (response.function_call) {
      const functionName = response.function_call.name;
      const functionArgs = JSON.parse(response.function_call.arguments);

      // Call the appropriate function
      if (chatbotFunctions[functionName]) {
        const functionResult = await chatbotFunctions[functionName](functionArgs);
        
        // Send the function result back to OpenAI
        const followUpMessages = [
          ...messages,
          response,
          {
            role: "function",
            name: functionName,
            content: JSON.stringify(functionResult)
          }
        ];

        const finalCompletion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo-1106",
          messages: followUpMessages,
          temperature: 0.7,
          max_tokens: 1000
        });

        response = finalCompletion.choices[0].message;
      }
    }

    res.json({
      response: response.content,
      conversation_id: Date.now().toString(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Chatbot error:", error);
    
    if (error.code === 'invalid_api_key') {
      return res.status(401).json({ 
        error: "Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable." 
      });
    }
    
    res.status(500).json({ 
      error: "An error occurred while processing your request. Please try again." 
    });
  }
});

// Endpoint to get available functions/capabilities
router.get("/capabilities", (req, res) => {
  const capabilities = functionDefinitions.map(func => ({
    name: func.name,
    description: func.description
  }));
  
  res.json({ capabilities });
});

module.exports = router;