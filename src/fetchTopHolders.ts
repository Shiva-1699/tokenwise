import { Connection, PublicKey, ParsedAccountData, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import 'dotenv/config';
import fs from 'fs'; // ✅ Added for file writing

console.log("🚀 Starting fetchTokenInfo script...");

// ✅ Load RPC from .env or use default fallback
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// 🎯 Replace this with your token mint address
const TOKEN_MINT = new PublicKey('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');

async function fetchTokenInfo() {
  try {
    console.log(`🔍 Fetching token accounts for mint: ${TOKEN_MINT.toBase58()}`);

    const accounts = await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          {
            dataSize: 165, // size of account (bytes)
          },
          {
            memcmp: {
              offset: 0, // location of our query in the account (bytes)
              bytes: TOKEN_MINT.toBase58(), // our search criteria, a base58 encoded string
            },
          },
        ],
      }
    );

    console.log(`✅ Found ${accounts.length} token accounts.`);

    const accountsData = accounts.map((account) => {
      const parsedAccountInfo = account.account.data as ParsedAccountData;
      const tokenAccountInfo = parsedAccountInfo.parsed.info;
      return {
        address: account.pubkey.toBase58(),
        balance: tokenAccountInfo.tokenAmount.uiAmount,
        owner: tokenAccountInfo.owner,
      };
    });

    // Sort accounts by balance in descending order
    accountsData.sort((a, b) => b.balance - a.balance);

    // Take top 60 holders or all if less than 60
    const topHolders = accountsData.slice(0, 60);

    // Write to file (for reference)
    fs.writeFileSync('topHolders.json', JSON.stringify(topHolders, null, 2));
    console.log(`✅ Top 60 holders data written to topHolders.json`);

    // --- Store in SQLite ---
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database('tokenwise.db');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS holders (
        address TEXT PRIMARY KEY,
        owner TEXT,
        balance REAL
      )`);
      const stmt = db.prepare(`INSERT OR REPLACE INTO holders (address, owner, balance) VALUES (?, ?, ?)`);
      topHolders.forEach(holder => {
        stmt.run(holder.address, holder.owner, holder.balance);
      });
      stmt.finalize();
    });
    db.close();
    console.log('✅ Top holders data written to SQLite (tokenwise.db)');
  } catch (error) {
    console.error('❌ Error fetching token info:', error);
    console.error('💡 This may happen if your RPC provider does not support `getParsedProgramAccounts`. Try using Helius, QuickNode, or Alchemy.');
  }
}

fetchTokenInfo();
