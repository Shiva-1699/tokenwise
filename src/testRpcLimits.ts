import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function testRpcLimits() {
  console.log(`🔍 Testing RPC endpoint: ${RPC_URL}`);
  console.log('📊 Running rate limit test...\n');

  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  // Test with different delays
  const delays = [100, 500, 1000, 2000, 3000];
  
  for (const delay of delays) {
    console.log(`\n⏱️ Testing with ${delay}ms delay between requests:`);
    
    successCount = 0;
    errorCount = 0;
    
    for (let i = 0; i < 10; i++) {
      try {
        const slot = await connection.getSlot();
        successCount++;
        console.log(`  ✅ Request ${i + 1}: Success (slot: ${slot})`);
      } catch (error: any) {
        errorCount++;
        if (error.message?.includes('429')) {
          console.log(`  ❌ Request ${i + 1}: Rate limited`);
        } else {
          console.log(`  ❌ Request ${i + 1}: Error - ${error.message}`);
        }
      }
      
      if (i < 9) { // Don't delay after last request
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    const successRate = (successCount / 10) * 100;
    console.log(`  📈 Success rate: ${successRate}% (${successCount}/10)`);
    
    if (successRate >= 90) {
      console.log(`  🎯 Recommended delay: ${delay}ms or higher`);
      break;
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n⏰ Total test time: ${totalTime}ms`);
  console.log('\n💡 Recommendations:');
  console.log('- Use the delay that achieved 90%+ success rate');
  console.log('- Consider upgrading to a paid RPC provider for better limits');
  console.log('- Monitor fewer wallets to reduce request volume');
}

testRpcLimits().catch(console.error);