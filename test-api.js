const http = require('http');

function testAPI(endpoint) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:3000/api/${endpoint}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function testAllEndpoints() {
    console.log('🧪 Testing TokenWise API endpoints...\n');
    
    try {
        // Test stats
        console.log('📊 Testing /api/stats...');
        const stats = await testAPI('stats');
        console.log(`✅ Total: ${stats.total}, Buys: ${stats.buys}, Sells: ${stats.sells}\n`);
        
        // Test transactions
        console.log('📋 Testing /api/transactions...');
        const transactions = await testAPI('transactions');
        console.log(`✅ Found ${transactions.length} transactions`);
        if (transactions.length > 0) {
            console.log(`📝 Sample transaction:`, transactions[0]);
        }
        console.log('');
        
        // Test holders
        console.log('👥 Testing /api/holders...');
        const holders = await testAPI('holders');
        console.log(`✅ Found ${holders.length} holders`);
        if (holders.length > 0) {
            console.log(`🥇 Top holder: ${holders[0].owner?.slice(0, 8)}... with ${holders[0].balance} tokens`);
        }
        
        console.log('\n🎉 All API endpoints are working!');
        console.log('🌐 Dashboard should now show protocols in the transactions table');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testAllEndpoints();