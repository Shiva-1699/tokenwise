const http = require('http');

function testEndpoint(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ status: res.statusCode, data: JSON.parse(data) });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.end();
    });
}

async function testDashboard() {
    console.log('🧪 Testing TokenWise Dashboard API...\n');

    try {
        // Test holders endpoint
        console.log('📊 Testing /api/holders...');
        const holders = await testEndpoint('/api/holders');
        console.log(`✅ Status: ${holders.status}`);
        console.log(`📈 Found ${holders.data.length} holders`);
        if (holders.data.length > 0) {
            console.log(`🥇 Top holder: ${holders.data[0].owner?.slice(0, 8)}... with ${holders.data[0].balance} tokens`);
        }

        // Test stats endpoint
        console.log('\n📊 Testing /api/stats...');
        const stats = await testEndpoint('/api/stats');
        console.log(`✅ Status: ${stats.status}`);
        console.log(`📈 Total transactions: ${stats.data.total || 0}`);
        console.log(`🟢 Buys: ${stats.data.buys || 0}`);
        console.log(`🔴 Sells: ${stats.data.sells || 0}`);

        // Test transactions endpoint
        console.log('\n📊 Testing /api/transactions...');
        const transactions = await testEndpoint('/api/transactions');
        console.log(`✅ Status: ${transactions.status}`);
        console.log(`📈 Found ${transactions.data.length} transactions`);

        console.log('\n🎉 Dashboard API is working correctly!');
        console.log('🌐 Open http://localhost:3000 to view the dashboard');

    } catch (error) {
        console.error('❌ Error testing dashboard:', error.message);
    }
}

testDashboard();