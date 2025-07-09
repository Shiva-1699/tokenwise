import { Connection, PublicKey, ParsedTransactionWithMeta, Logs } from '@solana/web3.js';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

// Solana RPC endpoint with rate limiting configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: undefined, // Disable websocket to reduce connections
});

// Rate limiting configuration - VERY aggressive settings to avoid 429 errors
const RATE_LIMIT_DELAY = 10000; // 10 seconds between requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 15000; // 15 seconds initial retry delay
const MAX_CONCURRENT_REQUESTS = 1; // Only 1 request at a time

// Queue for managing requests
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      
      // Rate limiting: ensure minimum delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        await this.sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
      }
      
      try {
        await request();
      } catch (error) {
        console.error('Request failed:', error);
      }
      
      this.lastRequestTime = Date.now();
    }
    
    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const requestQueue = new RequestQueue();

// Retry mechanism with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) {
      throw error;
    }

    // Check if it's a rate limit error
    if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
      const backoffDelay = Math.min(delay * 2, 60000); // Cap at 60 seconds
      console.log(`⏳ Rate limited. Retrying in ${backoffDelay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return retryWithBackoff(fn, retries - 1, backoffDelay); // Exponential backoff
    }

    // For other errors, retry with shorter delay
    if (retries > 1) {
      console.log(`⚠️ Request failed, retrying in ${delay / 2}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay / 2));
      return retryWithBackoff(fn, retries - 1, delay);
    }

    throw error;
  }
}

// Token mint address
const TOKEN_MINT = new PublicKey('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Program IDs for different protocols
const JUPITER_PROGRAM_ID = 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB';
const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const ORCA_PROGRAM_ID = 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1';

// Setup SQLite database and ensure table exists
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

// Determine which protocol was used in the transaction
function determineProtocol(transaction: ParsedTransactionWithMeta): string {
  const instructions = transaction.transaction.message.instructions;
  for (const ix of instructions) {
    if ('programId' in ix) {
      const programId = ix.programId.toString();
      if (programId === JUPITER_PROGRAM_ID) {
        return 'Jupiter';
      } else if (programId === RAYDIUM_PROGRAM_ID) {
        return 'Raydium';
      } else if (programId === ORCA_PROGRAM_ID) {
        return 'Orca';
      }
    }
  }
  return 'Unknown';
}

// Track processed transactions to avoid duplicates
const processedTransactions = new Set<string>();

// Circuit breaker for rate limiting
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 3;
  private readonly recoveryTime = 30000; // 30 seconds

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open - too many rate limit errors');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: any) {
      if (error.message?.includes('429')) {
        this.onFailure();
      }
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.failureCount >= this.failureThreshold) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.recoveryTime) {
        return true;
      } else {
        // Reset after recovery time
        this.failureCount = 0;
      }
    }
    return false;
  }

  private onSuccess() {
    this.failureCount = 0;
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      console.log(`🔴 Circuit breaker opened - pausing for ${this.recoveryTime / 1000}s due to rate limits`);
    }
  }
}

const circuitBreaker = new CircuitBreaker();

// Main monitoring function
async function monitorTransactions() {
  const db = await setupDatabase();

  // Load top holders from file
  let topHolders: any[];
  try {
    topHolders = JSON.parse(fs.readFileSync('topHolders.json', 'utf-8'));
  } catch (err) {
    console.error('❌ Failed to read topHolders.json:', err);
    process.exit(1);
  }
  const walletAddresses: Set<string> = new Set(topHolders.map((holder: any) => holder.owner));

  console.log(`🔍 Monitoring SPL Token Program logs for ${walletAddresses.size} wallets...`);
  console.log(`⚙️ Rate limiting: ${RATE_LIMIT_DELAY}ms between requests, max ${MAX_RETRIES} retries`);
  console.log(`🔄 Circuit breaker: pauses after 3 consecutive rate limit errors for 30s`);

  // Statistics tracking
  let processedCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  // Subscribe to SPL Token Program logs (single subscription)
  connection.onLogs(
    TOKEN_PROGRAM_ID,
    async (logs: Logs, ctx) => {
      try {
        const signature = (logs as any).signature || (logs as any).transactionSignature;
        if (!signature) return;

        // Skip if already processed
        if (processedTransactions.has(signature)) {
          return;
        }
        processedTransactions.add(signature);

        // Clean up old processed transactions (keep last 10000)
        if (processedTransactions.size > 10000) {
          const toDelete = Array.from(processedTransactions).slice(0, 5000);
          toDelete.forEach(sig => processedTransactions.delete(sig));
        }
        
        // Use rate-limited request queue with circuit breaker for getting transaction info
        const txInfo = await requestQueue.add(() => 
          circuitBreaker.execute(() => 
            retryWithBackoff(() => connection.getParsedTransaction(signature, 'confirmed'))
          )
        );
        if (!txInfo) return;

        // Find token transfer for our mint and relevant wallets
        const tokenTransfers = (txInfo.meta?.postTokenBalances || []).filter(
          (ptb: any) =>
            ptb.mint === TOKEN_MINT.toBase58() &&
            ptb.owner &&
            walletAddresses.has(ptb.owner)
        );

        if (tokenTransfers.length === 0) return; // No relevant transfers

        for (const post of tokenTransfers) {
          const owner = post.owner;
          const amount = post.uiTokenAmount.uiAmount;
          
          // Skip if owner is invalid
          if (!owner || typeof owner !== 'string') {
            console.warn('⚠️ Skipping transaction with invalid owner:', owner);
            continue;
          }
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

          // Skip if no meaningful change
          if (amountDiff === 0) continue;

          const protocol = determineProtocol(txInfo);
          const timestamp = txInfo.blockTime ? txInfo.blockTime * 1000 : Date.now();

          await db.run(
            `INSERT OR IGNORE INTO transactions (signature, timestamp, wallet, amount, type, protocol)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [signature, timestamp, owner, amountDiff, type, protocol]
          );

          processedCount++;
          const ownerShort = owner.length > 8 ? `${owner.slice(0, 8)}...` : owner;
          console.log(
            `✅ [${processedCount}] ${type.toUpperCase()} ${amountDiff.toFixed(6)} tokens by ${ownerShort} via ${protocol}`
          );
        }
      } catch (error: any) {
        errorCount++;
        if (error.message?.includes('429')) {
          console.log(`⏳ Rate limited (${errorCount} errors so far) - backing off...`);
        } else if (error.message?.includes('Circuit breaker is open')) {
          console.log(`🔴 Circuit breaker active - pausing requests to recover from rate limits`);
        } else {
          console.error(`❌ Error processing transaction (${errorCount} errors so far):`, error.message);
        }
      }
    },
    'confirmed'
  );

  // Periodic statistics reporting
  setInterval(() => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const rate = processedCount > 0 ? (processedCount / uptime * 60).toFixed(2) : '0';
    console.log(`📊 Stats: ${processedCount} transactions processed, ${errorCount} errors, ${rate} tx/min, uptime: ${uptime}s`);
  }, 60000); // Every minute

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    console.log(`📊 Final stats: ${processedCount} transactions processed, ${errorCount} errors`);
    console.log('💾 Closing database...');
    await db.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
}

monitorTransactions().catch(console.error);