# RPC Endpoint Setup

## Current Configuration
Your `.env` file is configured with a Helius RPC endpoint, which is good for avoiding rate limits.

## Recommended RPC Providers (in order of preference):

### 1. **Helius** (Currently configured)
- Higher rate limits
- Better reliability
- Free tier available
- Your current endpoint: `https://mainnet.helius-rpc.com/?api-key=f8324181-4838-4fab-b104-23bd2c59c9cb`

### 2. **QuickNode**
- Professional grade
- Good rate limits
- Example: `https://your-endpoint.solana-mainnet.quiknode.pro/your-token/`

### 3. **Alchemy**
- Reliable service
- Good documentation
- Example: `https://solana-mainnet.g.alchemy.com/v2/your-api-key`

### 4. **Public RPC (Fallback only)**
- `https://api.mainnet-beta.solana.com`
- Very limited rate limits
- Should only be used for testing

## Rate Limiting Configuration

The monitoring script now includes:
- **1 second delay** between requests
- **Exponential backoff** for 429 errors
- **Request queue** to manage concurrent requests
- **Automatic retries** with increasing delays

## If you still get rate limited:

1. **Increase delays** in `monitorTransactions.ts`:
   ```typescript
   const RATE_LIMIT_DELAY = 2000; // Increase to 2 seconds
   ```

2. **Use a better RPC provider** (upgrade your Helius plan or switch providers)

3. **Monitor fewer wallets** (reduce the number of wallets in topHolders.json)