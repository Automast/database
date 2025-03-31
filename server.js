/**
 * Production Ready Node.js App with SQLite for Data Collection
 *
 * Requirements:
 *   - Node.js installed.
 *   - Dependencies: express, sqlite3, cors, dotenv
 *
 * Installation:
 *   npm install express sqlite3 cors dotenv
 *
 * Environment:
 *   Create a .env file in the same directory with:
 *     PORT=3000          // (or any port you prefer)
 *     DB_PATH=./data.db  // (optional; defaults to ./data.db)
 *
 * Running:
 *   node server.js
 *
 * API Documentation:
 *
 * 1. POST /api/collect
 *    - Accepts a JSON payload (any valid JSON) and saves it to the database as a single text cell.
 *
 *    Example (using curl):
 *      curl -X POST -H "Content-Type: application/json" \
 *      -d '{"originalEmail": "example@domain.com", "newEmail": "examp1e@other.com", "fullName": "John Doe", "phone": "1234567890", "amount": 100}' \
 *      http://localhost:3000/api/collect
 *
 * 2. GET /access
 *    - Serves a webpage that lists all stored submissions and provides a “Download CSV” button.
 *
 * 3. GET /download
 *    - Downloads all submissions as a CSV file.
 *
 * 4. GET /api/submissions
 *    - Returns all submissions as JSON.
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const sqlite3    = require('sqlite3').verbose();
const path       = require('path');
const fs         = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

// ============= Middlewares =============
// Open CORS for all domains and methods
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============= Initialize SQLite Database =============
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  } else {
    console.log(`Connected to SQLite database at ${DB_PATH}`);
  }
});

db.run(`CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) {
    console.error('Error creating table:', err);
    process.exit(1);
  }
});

// ============= API Endpoints =============

/**
 * POST /api/collect
 *  - Accepts any JSON payload and saves it to the database.
 */
app.post('/api/collect', (req, res) => {
  try {
    const payload = req.body;
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }
    const jsonString = JSON.stringify(payload);
    db.run("INSERT INTO submissions (payload) VALUES (?)", [jsonString], function(err) {
      if (err) {
        console.error('Error inserting data:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      return res.json({ message: "Data saved", id: this.lastID });
    });
  } catch (error) {
    console.error('Unexpected error in /api/collect:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/submissions
 *  - Returns all submissions as JSON.
 */
app.get('/api/submissions', (req, res) => {
  try {
    db.all("SELECT * FROM submissions ORDER BY created_at DESC", (err, rows) => {
      if (err) {
        console.error('Error fetching data:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });
  } catch (error) {
    console.error('Unexpected error in /api/submissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /download
 *  - Downloads all submissions as a CSV file.
 */
app.get('/download', (req, res) => {
  try {
    db.all("SELECT * FROM submissions ORDER BY created_at DESC", (err, rows) => {
      if (err) {
        console.error('Error fetching data for download:', err);
        return res.status(500).send('Database error');
      }
      let csv = 'ID,Payload,Created At\n';
      rows.forEach(row => {
        // Escape any double quotes in the payload.
        const payloadEscaped = row.payload.replace(/"/g, '""');
        csv += `${row.id},"${payloadEscaped}",${row.created_at}\n`;
      });
      res.setHeader('Content-disposition', 'attachment; filename=submissions.csv');
      res.set('Content-Type', 'text/csv');
      res.status(200).send(csv);
    });
  } catch (error) {
    console.error('Unexpected error in /download:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * GET /access
 *  - Serves a webpage to view all submissions and download the CSV.
 */
app.get('/access', (req, res) => {
  try {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Data Access</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
        #download { margin-bottom: 20px; }
        pre { margin: 0; }
      </style>
    </head>
    <body>
      <h1>Submissions</h1>
      <button id="download" onclick="window.location.href='/download'">Download CSV</button>
      <table id="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Payload</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <script>
        async function fetchData() {
          try {
            const response = await fetch('/api/submissions');
            const data = await response.json();
            const tbody = document.querySelector('#data-table tbody');
            tbody.innerHTML = '';
            data.forEach(row => {
              const tr = document.createElement('tr');
              tr.innerHTML = '<td>' + row.id + '</td>' +
                             '<td><pre style="white-space: pre-wrap;">' + row.payload + '</pre></td>' +
                             '<td>' + row.created_at + '</td>';
              tbody.appendChild(tr);
            });
          } catch (err) {
            console.error('Error fetching data:', err);
          }
        }
        window.onload = fetchData;
      </script>
    </body>
    </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Unexpected error in /access:', error);
    res.status(500).send('Internal server error');
  }
});

// ============= Global Error & 404 Handlers =============
app.use((req, res) => {
  res.status(404).send('Endpoint not found');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal server error');
});

// ============= Process-Level Error Handling =============
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Graceful shutdown on SIGTERM/SIGINT
function shutdown() {
  console.log('Shutting down gracefully...');
  db.close(err => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============= Start Server =============
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
