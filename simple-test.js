const http = require('http');

const req = http.get('http://localhost:3000/api/holders', (res) => {
    console.log(`Status: ${res.statusCode}`);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            console.log(`Found ${parsed.length} holders`);
            console.log('✅ Dashboard API is working!');
        } catch (e) {
            console.log('Raw response:', data);
        }
    });
});

req.on('error', (err) => {
    console.log('❌ Connection error:', err.message);
});

req.setTimeout(5000, () => {
    console.log('❌ Request timeout');
    req.destroy();
});