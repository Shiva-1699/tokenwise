# 🧠 TokenWise - Real-Time Wallet Intelligence on Solana

TokenWise is a comprehensive real-time intelligence tool designed to monitor and analyze wallet behavior for specific tokens on the Solana blockchain. It tracks the top 60 token holders, captures their transaction activity in real time, and visualizes market trends through a clean dashboard.

## 🎯 Features

- **Top Wallet Discovery**: Identifies and tracks the top 60 token holders
- **Real-time Monitoring**: Three different monitoring approaches for different needs
- **Transaction Analysis**: Captures buy/sell activities with protocol identification
- **Interactive Dashboard**: Real-time visualization with charts and analytics
- **Data Export**: CSV and JSON export functionality
- **Historical Analysis**: SQLite database for persistent data storage

## 🚀 Quick Start

### Prerequisites
- Node.js (v20.14.0 or higher)
- npm

### Installation
```bash
# Clone and install dependencies
npm install

# Install dashboard dependencies
cd dashboard
npm install
cd ..
```

### Setup
1. **Fetch Top Holders** (Run this first):
```bash
npm run start
```

2. **Start Monitoring** (Choose one approach):
```bash
# RECOMMENDED: Balance monitoring (no rate limits)
npm run monitor-balances

# OR: Polling approach (good compromise)
npm run monitor-polling

# OR: Real-time monitoring (may hit rate limits)
npm run monitor
```

3. **Launch Dashboard** (In a new terminal):
```bash
npm run dashboard
```

4. **Open Dashboard**: Visit http://localhost:3000

## 📊 Dashboard Features

### Real-time Analytics
- **Transaction Statistics**: Total transactions, buy/sell ratios
- **Interactive Charts**: Buy vs Sell distribution, Volume over time
- **Live Transaction Feed**: Recent transactions with wallet details
- **Top Holders Display**: Current top token holders with balances

### Export Functionality
- **CSV Export**: Transaction data for spreadsheet analysis
- **JSON Export**: Complete dataset including stats, transactions, and holders

## 🛠️ Technical Architecture

### Core Components

1. **Data Collection** (`src/fetchTopHolders.ts`)
   - Connects to Solana RPC
   - Fetches top 60 token holders
   - Stores data in SQLite database

2. **Monitoring Systems**
   - **Balance Monitoring** (`src/monitorBalances.ts`) - Recommended
   - **Polling Monitoring** (`src/monitorTransactionsPolling.ts`) - Compromise
   - **Real-time Monitoring** (`src/monitorTransactions.ts`) - Advanced

3. **Dashboard** (`dashboard/`)
   - Express.js backend with REST API
   - Interactive frontend with Chart.js
   - Real-time data updates

### Database Schema
- **holders**: Initial top holders data
- **wallet_balances**: Current balance tracking
- **balance_changes**: Historical balance changes
- **transactions**: Detailed transaction records

## 🔧 Configuration

### Environment Variables
Create a `.env` file:
```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-api-key
```

### Token Configuration
Update the token mint address in the source files:
```javascript
const TOKEN_MINT = new PublicKey('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');
```

## 📈 Monitoring Approaches

### 1. Balance Monitoring (Recommended)
- **Best for**: Avoiding rate limits
- **Frequency**: Every 2 minutes
- **Pros**: Reliable, no 429 errors, simple logic
- **Cons**: 2-minute delay, less protocol detail

### 2. Polling Monitoring
- **Best for**: Balanced approach
- **Frequency**: Every 60 seconds
- **Pros**: More details, controlled rate
- **Cons**: Some complexity, potential delays

### 3. Real-time Monitoring
- **Best for**: Immediate detection
- **Frequency**: Real-time
- **Pros**: Instant notifications, full details
- **Cons**: Rate limit prone, complex error handling

## 🧪 Testing

Test your RPC endpoint limits:
```bash
npm run test-rpc
```

## 📁 Project Structure

```
tokenwise/
├── src/
│   ├── fetchTopHolders.ts      # Initial data collection
│   ├── monitorBalances.ts      # Balance monitoring (recommended)
│   ├── monitorTransactions.ts  # Real-time monitoring
│   ├── monitorTransactionsPolling.ts # Polling monitoring
│   └── testRpcLimits.ts        # RPC testing utility
├── dashboard/
│   ├── index.html              # Dashboard UI
│   ├── dashboard.js            # Frontend logic
│   ├── backend.js              # API server
│   └── package.json            # Dashboard dependencies
├── topHolders.json             # Top holders data
├── tokenwise.db                # SQLite database
└── README.md                   # This file
```

## 🚨 Troubleshooting

### Common Issues

1. **Rate Limiting (429 errors)**
   - Use balance monitoring approach
   - Increase delays in monitoring scripts
   - Upgrade to paid RPC provider

2. **Module Not Found**
   - Run `npm install` in both root and dashboard directories
   - Check Node.js version compatibility

3. **Database Errors**
   - Ensure SQLite database is created by running `npm run start` first
   - Check file permissions

4. **Dashboard Not Loading**
   - Verify backend is running on port 3000
   - Check for port conflicts
   - Ensure all dependencies are installed

## 🔮 Future Enhancements

- WebSocket integration for real-time dashboard updates
- Machine learning for pattern recognition
- Multi-token support
- Advanced filtering and alerting system
- Mobile-responsive design
- Performance optimizations

## 📄 License

ISC License

## 🤝 Contributing

This project was created as part of a technical assessment. For questions or improvements, please refer to the project documentation.

---

**Built with ❤️ for the Solana ecosystem**