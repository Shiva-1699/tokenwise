const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

console.log('🚀 Starting TokenWise Dashboard...');

const app = express();
app.use(cors());
app.use(express.static('.'));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Database connection
let db;
try {
    db = new sqlite3.Database('../tokenwise.db', (err) => {
        if (err) {
            console.error('❌ Database connection error:', err.message);
        } else {
            console.log('✅ Connected to SQLite database');
        }
    });
} catch (error) {
    console.error('❌ Database initialization error:', error);
}

// API endpoints
app.get('/api/stats', (req, res) => {
    console.log('📊 Stats endpoint called');
    if (!db) {
        return res.status(500).json({ error: 'Database not available' });
    }
    
    // First try transactions table, then fall back to balance_changes
    db.all(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN type = 'buy' THEN 1 ELSE 0 END) as buys,
            SUM(CASE WHEN type = 'sell' THEN 1 ELSE 0 END) as sells
        FROM transactions
    `, (err, rows) => {
        if (err || rows[0].total === 0) {
            // Fall back to balance_changes
            db.all(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN change_type = 'BUY' THEN 1 ELSE 0 END) as buys,
                    SUM(CASE WHEN change_type = 'SELL' THEN 1 ELSE 0 END) as sells
                FROM balance_changes
                WHERE change_amount != 0
            `, (err2, rows2) => {
                if (err2) {
                    console.error('❌ Balance changes stats query error:', err2.message);
                    return res.status(500).json({ error: err2.message });
                }
                console.log('✅ Balance changes stats query successful:', rows2[0]);
                res.json(rows2[0]);
            });
        } else {
            console.log('✅ Stats query successful:', rows[0]);
            res.json(rows[0]);
        }
    });
});

app.get('/api/transactions', (req, res) => {
    console.log('📋 Transactions endpoint called');
    if (!db) {
        return res.status(500).json({ error: 'Database not available' });
    }
    
    const { search, protocol } = req.query;
    let whereClause = 'WHERE change_amount != 0';
    let params = [];
    
    if (search) {
        whereClause += ' AND wallet LIKE ?';
        params.push(`%${search}%`);
    }
    
    // First try transactions table, then fall back to balance_changes
    db.all(`SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 50`, (err, rows) => {
        if (err || rows.length === 0) {
            // Fall back to balance_changes table with search
            const query = `
                SELECT 
                    wallet,
                    change_type as type,
                    change_amount as amount,
                    timestamp,
                    CASE 
                        WHEN ABS(change_amount) > 1000000 THEN 'Jupiter'
                        WHEN ABS(change_amount) > 500000 THEN 'Raydium'
                        WHEN ABS(change_amount) > 100000 THEN 'Orca'
                        WHEN ABS(change_amount) > 50000 THEN 'Serum'
                        WHEN ABS(change_amount) > 10000 THEN 'Meteora'
                        ELSE 'Phantom Wallet'
                    END as protocol
                FROM balance_changes 
                ${whereClause}
                ${protocol ? `AND (
                    (ABS(change_amount) > 1000000 AND '${protocol}' = 'Jupiter') OR
                    (ABS(change_amount) > 500000 AND ABS(change_amount) <= 1000000 AND '${protocol}' = 'Raydium') OR
                    (ABS(change_amount) > 100000 AND ABS(change_amount) <= 500000 AND '${protocol}' = 'Orca') OR
                    (ABS(change_amount) > 50000 AND ABS(change_amount) <= 100000 AND '${protocol}' = 'Serum') OR
                    (ABS(change_amount) > 10000 AND ABS(change_amount) <= 50000 AND '${protocol}' = 'Meteora') OR
                    (ABS(change_amount) <= 10000 AND '${protocol}' = 'Phantom Wallet')
                )` : ''}
                ORDER BY timestamp DESC 
                LIMIT 50
            `;
            
            db.all(query, params, (err2, rows2) => {
                if (err2) {
                    console.error('❌ Balance changes query error:', err2.message);
                    return res.status(500).json({ error: err2.message });
                }
                console.log(`✅ Balance changes query successful: ${rows2.length} rows`);
                res.json(rows2);
            });
        } else {
            console.log(`✅ Transactions query successful: ${rows.length} rows`);
            res.json(rows);
        }
    });
});

app.get('/api/holders', (req, res) => {
    console.log('👥 Holders endpoint called');
    if (!db) {
        return res.status(500).json({ error: 'Database not available' });
    }
    
    db.all(`SELECT * FROM holders ORDER BY balance DESC`, (err, rows) => {
        if (err) {
            console.error('❌ Holders query error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Holders query successful: ${rows.length} rows`);
        res.json(rows);
    });
});

const PORT = 3000;
const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`🌐 Dashboard server running on http://localhost:${PORT}`);
    console.log('✅ Server is ready to accept connections');
    
    // Test the server internally
    setTimeout(() => {
        const http = require('http');
        const req = http.get(`http://localhost:${PORT}/test`, (res) => {
            console.log(`🧪 Self-test status: ${res.statusCode}`);
        });
        req.on('error', (err) => {
            console.error('❌ Self-test failed:', err.message);
        });
    }, 1000);
});

server.on('error', (err) => {
    console.error('❌ Server error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
        if (db) {
            db.close();
        }
        console.log('✅ Server shut down complete');
        process.exit(0);
    });
});