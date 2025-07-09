const http = require('http');

function testUrl(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data: data.substring(0, 500) });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function testDashboard() {
    try {
        console.log('🧪 Testing dashboard web interface...\n');
        
        const result = await testUrl('http://localhost:3000');
        console.log(`✅ Status: ${result.status}`);
        console.log(`📄 Content preview:\n${result.data}`);
        
        if (result.data.includes('<title>TokenWise Dashboard</title>')) {
            console.log('\n🎉 Dashboard is working! Open http://localhost:3000 in your browser');
        } else {
            console.log('\n⚠️  Dashboard loaded but content might be incorrect');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testDashboard();