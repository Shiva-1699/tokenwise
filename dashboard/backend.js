const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('.'));

const db = new sqlite3.Database('../tokenwise.db', (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
    }
});

// API endpoints
app.get('/api/stats', (req, res) => {
    db.all(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN type = 'buy' THEN 1 ELSE 0 END) as buys,
            SUM(CASE WHEN type = 'sell' THEN 1 ELSE 0 END) as sells
        FROM transactions
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows[0]);
    });
});

app.get('/api/transactions', (req, res) => {
    db.all(`
        SELECT * FROM transactions 
        ORDER BY timestamp DESC 
        LIMIT 50
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/holders', (req, res) => {
    db.all(`SELECT * FROM holders ORDER BY balance DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(3000, '127.0.0.1', () => {
    console.log('Dashboard server running on http://localhost:3000');
    console.log('✅ Server is ready to accept connections');
});

// Add error handling
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
