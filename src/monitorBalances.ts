import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
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

// Configuration - Very conservative
const CHECK_INTERVAL = 120000; // Check every 2 minutes
const REQUEST_DELAY = 8000; // 8 seconds between requests

interface WalletBalance {
  wallet: string;
  balance: number;
  lastUpdated: number;
}

// Setup database
async function setupDatabase(): Promise<Database> {
  const db = await open({
    filename: './tokenwise.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_balances (
      wallet TEXT PRIMARY KEY,
      balance REAL,
      last_updated INTEGER
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS balance_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT,
      old_balance REAL,
      new_balance REAL,
      change_amount REAL,
      change_type TEXT,
      timestamp INTEGER
    )
  `);

  return db;
}

// Sleep function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safe RPC call with aggressive retry
async function safeRpcCall<T>(fn: () => Promise<T>, description: string): Promise<T | null> {
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔄 ${description} (attempt ${i + 1}/${maxRetries})`);
      await sleep(REQUEST_DELAY);
      const result = await fn();
      console.log(`✅ ${description} - Success`);
      return result;
    } catch (error: any) {
      console.log(`❌ ${description} - Failed:`, error.message);
      
      if (error.message?.includes('429')) {
        const backoffTime = (i + 1) * 20000; // 20s, 40s, 60s
        console.log(`⏳ Rate limited, waiting ${backoffTime / 1000}s...`);
        await sleep(backoffTime);
      } else {
        await sleep(10000); // Wait 10s for other errors
      }
    }
  }
  
  console.log(`💀 ${description} - Failed after ${maxRetries} attempts`);
  return null;
}

// Get token balance for a wallet
async function getTokenBalance(walletAddress: string): Promise<number | null> {
  const tokenAccounts = await safeRpcCall(
    () => connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { mint: TOKEN_MINT }
    ),
    `Getting token accounts for ${walletAddress.slice(0, 8)}...`
  );

  if (!tokenAccounts) return null;

  let totalBalance = 0;
  for (const account of tokenAccounts.value) {
    const balance = account.account.data.parsed.info.tokenAmount.uiAmount || 0;
    totalBalance += balance;
  }

  return totalBalance;
}

// Check all wallet balances
async function checkAllBalances(wallets: string[], db: Database): Promise<void> {
  console.log(`\n🔍 Checking balances for ${wallets.length} wallets...`);
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    console.log(`\n📊 Wallet ${i + 1}/${wallets.length}: ${wallet.slice(0, 8)}...`);
    
    // Get current balance
    const currentBalance = await getTokenBalance(wallet);
    if (currentBalance === null) {
      console.log(`⚠️ Failed to get balance for ${wallet.slice(0, 8)}...`);
      continue;
    }

    // Get previous balance from database
    const previousRecord = await db.get(
      'SELECT balance, last_updated FROM wallet_balances WHERE wallet = ?',
      [wallet]
    );

    const previousBalance = previousRecord?.balance || 0;
    const balanceChange = currentBalance - previousBalance;

    // Update balance in database
    await db.run(
      `INSERT OR REPLACE INTO wallet_balances (wallet, balance, last_updated)
       VALUES (?, ?, ?)`,
      [wallet, currentBalance, Date.now()]
    );

    // Log significant changes
    if (Math.abs(balanceChange) > 0.001) { // Only log changes > 0.001 tokens
      const changeType = balanceChange > 0 ? 'BUY' : 'SELL';
      const changeAmount = Math.abs(balanceChange);
      
      // Record the change
      await db.run(
        `INSERT INTO balance_changes (wallet, old_balance, new_balance, change_amount, change_type, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [wallet, previousBalance, currentBalance, changeAmount, changeType, Date.now()]
      );

      console.log(`🎯 ${changeType}: ${changeAmount.toFixed(6)} tokens (${previousBalance.toFixed(6)} → ${currentBalance.toFixed(6)})`);
    } else {
      console.log(`💤 No significant change (${currentBalance.toFixed(6)} tokens)`);
    }
  }
}

// Main monitoring function
async function startBalanceMonitoring() {
  const db = await setupDatabase();
  
  // Load top holders
  let topHolders: any[];
  try {
    topHolders = JSON.parse(fs.readFileSync('topHolders.json', 'utf-8'));
  } catch (err) {
    console.error('❌ Failed to read topHolders.json:', err);
    process.exit(1);
  }
  
  const wallets = topHolders.map((holder: any) => holder.owner);
  
  console.log(`🚀 Starting balance monitoring for ${wallets.length} wallets`);
  console.log(`⏱️ Checking every ${CHECK_INTERVAL / 1000}s with ${REQUEST_DELAY / 1000}s between requests`);
  console.log(`🎯 This approach avoids real-time transaction monitoring to prevent 429 errors\n`);

  let checkCount = 0;
  let totalChanges = 0;

  // Initial check
  await checkAllBalances(wallets, db);
  checkCount++;

  // Set up periodic checks
  setInterval(async () => {
    checkCount++;
    console.log(`\n🔄 Balance Check #${checkCount} - ${new Date().toLocaleTimeString()}`);
    
    try {
      await checkAllBalances(wallets, db);
      
      // Get recent changes count
      const recentChanges = await db.get(
        'SELECT COUNT(*) as count FROM balance_changes WHERE timestamp > ?',
        [Date.now() - CHECK_INTERVAL]
      );
      
      const changesThisRound = recentChanges?.count || 0;
      totalChanges += changesThisRound;
      
      console.log(`\n📈 Check complete: ${changesThisRound} changes detected`);
      console.log(`📊 Total changes detected: ${totalChanges}`);
      
    } catch (error) {
      console.error('❌ Error in balance check:', error);
    }
  }, CHECK_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down balance monitor...');
    console.log(`📊 Final stats: ${totalChanges} balance changes detected in ${checkCount} checks`);
    await db.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
}

startBalanceMonitoring().catch(console.error);