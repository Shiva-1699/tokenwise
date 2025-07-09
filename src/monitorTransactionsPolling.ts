import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import dotenv from 'dotenv';

dotenv.config();

// Solana RPC endpoint
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Token mint address
const TOKEN_MINT = new PublicKey('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');

// Polling configuration - Much slower but reliable
const POLLING_INTERVAL = 60000; // Check every 60 seconds
const REQUEST_DELAY = 5000; // 5 seconds between individual requests
const MAX_SIGNATURES_PER_POLL = 10; // Limit signatures to check per poll

// Setup SQLite database
async function setupDatabase(): Promise<Database> {
  const db = await open({
    filename: './tokenwise.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      signature TEXT PRIMARY KEY,
      timestamp INTEGER,
      wallet TEXT,
      amount REAL,
      type TEXT,
      protocol TEXT
    )
  `);

  return db;
}

// Sleep function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safe RPC call with retry
async function safeRpcCall<T>(fn: () => Promise<T>, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      await sleep(REQUEST_DELAY); // Always wait before making request
      const result = await fn();
      return result;
    } catch (error: any) {
      console.log(`⚠️ RPC call failed (attempt ${i + 1}/${retries}):`, error.message);
      if (error.message?.includes('429')) {
        const backoffTime = (i + 1) * 30000; // 30s, 60s, 90s
        console.log(`⏳ Rate limited, waiting ${backoffTime / 1000}s before retry...`);
        await sleep(backoffTime);
      } else {
        await sleep(5000); // Wait 5s for other errors
      }
    }
  }
  console.log(`❌ RPC call failed after ${retries} attempts`);
  return null;
}

// Get recent signatures for token accounts
async function getRecentSignatures(walletAddresses: string[]): Promise<string[]> {
  const signatures = new Set<string>();
  
  console.log(`🔍 Checking signatures for ${walletAddresses.length} wallets...`);
  
  for (let i = 0; i < walletAddresses.length; i++) {
    const wallet = walletAddresses[i];
    console.log(`📝 Checking wallet ${i + 1}/${walletAddresses.length}: ${wallet.slice(0, 8)}...`);
    
    const walletSignatures = await safeRpcCall(() => 
      connection.getSignaturesForAddress(new PublicKey(wallet), { limit: 5 })
    );
    
    if (walletSignatures) {
      walletSignatures.forEach(sig => signatures.add(sig.signature));
      console.log(`  ✅ Found ${walletSignatures.length} recent signatures`);
    } else {
      console.log(`  ❌ Failed to get signatures for wallet`);
    }
  }
  
  return Array.from(signatures).slice(0, MAX_SIGNATURES_PER_POLL);
}

// Process a single transaction
async function processTransaction(signature: string, db: Database, walletAddresses: Set<string>): Promise<boolean> {
  const txInfo = await safeRpcCall(() => 
    connection.getParsedTransaction(signature, 'confirmed')
  );
  
  if (!txInfo) return false;

  // Find token transfers for our mint and relevant wallets
  const tokenTransfers = (txInfo.meta?.postTokenBalances || []).filter(
    (ptb: any) =>
      ptb.mint === TOKEN_MINT.toBase58() &&
      ptb.owner &&
      walletAddresses.has(ptb.owner)
  );

  if (tokenTransfers.length === 0) return false;

  let processed = false;
  for (const post of tokenTransfers) {
    const owner = post.owner;
    if (!owner || typeof owner !== 'string') continue;

    const pre = (txInfo.meta?.preTokenBalances || []).find(
      (ptb: any) => ptb.owner === owner && ptb.mint === TOKEN_MINT.toBase58()
    );
    
    let type = 'unknown';
    let amountDiff = 0;
    
    if (pre && post) {
      const preAmount = Number(pre.uiTokenAmount.uiAmount) || 0;
      const postAmount = Number(post.uiTokenAmount.uiAmount) || 0;
      amountDiff = Math.abs(postAmount - preAmount);
      
      if (postAmount > preAmount) {
        type = 'buy';
      } else if (postAmount < preAmount) {
        type = 'sell';
      }
    }

    if (amountDiff === 0) continue;

    const timestamp = txInfo.blockTime ? txInfo.blockTime * 1000 : Date.now();

    try {
      await db.run(
        `INSERT OR IGNORE INTO transactions (signature, timestamp, wallet, amount, type, protocol)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [signature, timestamp, owner, amountDiff, type, 'Unknown']
      );

      const ownerShort = owner.length > 8 ? `${owner.slice(0, 8)}...` : owner;
      console.log(`✅ ${type.toUpperCase()} ${amountDiff.toFixed(6)} tokens by ${ownerShort}`);
      processed = true;
    } catch (error) {
      console.error('Database error:', error);
    }
  }

  return processed;
}

// Main polling function
async function startPolling() {
  const db = await setupDatabase();
  
  // Load top holders
  let topHolders: any[];
  try {
    topHolders = JSON.parse(fs.readFileSync('topHolders.json', 'utf-8'));
  } catch (err) {
    console.error('❌ Failed to read topHolders.json:', err);
    process.exit(1);
  }
  
  const walletAddresses = topHolders.map((holder: any) => holder.owner);
  const walletAddressSet = new Set(walletAddresses);
  
  console.log(`🚀 Starting polling monitor for ${walletAddresses.length} wallets`);
  console.log(`⏱️ Polling every ${POLLING_INTERVAL / 1000}s with ${REQUEST_DELAY / 1000}s between requests`);
  console.log(`📊 Processing max ${MAX_SIGNATURES_PER_POLL} signatures per poll\n`);

  let totalProcessed = 0;
  let pollCount = 0;

  // Polling loop
  setInterval(async () => {
    pollCount++;
    console.log(`\n🔄 Poll #${pollCount} - ${new Date().toLocaleTimeString()}`);
    
    try {
      // Get recent signatures
      const signatures = await getRecentSignatures(walletAddresses);
      console.log(`📋 Found ${signatures.length} unique signatures to check`);
      
      if (signatures.length === 0) {
        console.log('💤 No new signatures found');
        return;
      }

      // Process each signature
      let processedThisPoll = 0;
      for (let i = 0; i < signatures.length; i++) {
        const signature = signatures[i];
        console.log(`🔍 Processing signature ${i + 1}/${signatures.length}: ${signature.slice(0, 8)}...`);
        
        const processed = await processTransaction(signature, db, walletAddressSet);
        if (processed) {
          processedThisPoll++;
          totalProcessed++;
        }
      }
      
      console.log(`✅ Poll complete: ${processedThisPoll} new transactions found`);
      console.log(`📈 Total processed: ${totalProcessed} transactions`);
      
    } catch (error) {
      console.error('❌ Error in polling cycle:', error);
    }
  }, POLLING_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down polling monitor...');
    console.log(`📊 Final stats: ${totalProcessed} transactions processed in ${pollCount} polls`);
    await db.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
}

startPolling().catch(console.error);