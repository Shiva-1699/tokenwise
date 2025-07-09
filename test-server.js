const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Test server working!' }));
});

server.listen(3001, '127.0.0.1', () => {
    console.log('Test server running on http://localhost:3001');
});

// Test the server
setTimeout(() => {
    const req = http.get('http://localhost:3001', (res) => {
        console.log(`Status: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Response:', data);
            process.exit(0);
        });
    });
    
    req.on('error', (err) => {
        console.log('Error:', err.message);
        process.exit(1);
    });
}, 1000);