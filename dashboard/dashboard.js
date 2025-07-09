// Dashboard functionality
class TokenWiseDashboard {
    constructor() {
        this.initCharts();
        this.loadData();
        setInterval(() => this.loadData(), 30000); // Refresh every 30s
    }

    initCharts() {
        // Buy/Sell Pie Chart
        const ctx1 = document.getElementById('buySellChart').getContext('2d');
        this.buySellChart = new Chart(ctx1, {
            type: 'pie',
            data: {
                labels: ['Buys', 'Sells'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#4CAF50', '#F44336']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Buy vs Sell Distribution'
                    }
                }
            }
        });

        // Volume Over Time Chart
        const ctx2 = document.getElementById('volumeChart').getContext('2d');
        this.volumeChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Transaction Volume',
                    data: [],
                    borderColor: '#2196F3',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Transaction Volume Over Time'
                    }
                }
            }
        });
    }

    async loadData() {
        try {
            // Load real data from API
            const [stats, transactions, holders] = await Promise.all([
                fetch('/api/stats').then(r => r.json()).catch(() => ({ total: 0, buys: 0, sells: 0 })),
                fetch('/api/transactions').then(r => r.json()).catch(() => []),
                fetch('/api/holders').then(r => r.json()).catch(() => [])
            ]);
            
            this.updateStats(stats, holders);
            this.updateCharts(stats, transactions);
            this.updateHoldersTable(holders);
            this.updateTransactionTable(transactions);
            
            // Store data for export
            this.currentData = { stats, transactions, holders };
        } catch (error) {
            console.error('Error loading data:', error);
            // Fallback to sample data
            this.updateStats();
            this.updateCharts();
            this.updateHoldersTable();
            this.updateTransactionTable();
        }
    }

    async searchTransactions() {
        const search = document.getElementById('searchInput').value;
        const protocol = document.getElementById('protocolFilter').value;
        
        try {
            let url = '/api/transactions?';
            const params = new URLSearchParams();
            
            if (search) params.append('search', search);
            if (protocol) params.append('protocol', protocol);
            
            const response = await fetch('/api/transactions?' + params.toString());
            const transactions = await response.json();
            
            this.updateTransactionTable(transactions);
            
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('protocolFilter').value = '';
        this.loadData(); // Reload all data
    }

    updateStats(stats = { total: 0, buys: 0, sells: 0 }, holders = []) {
        // Update with real data from database
        const total = stats.total || 0;
        const buys = stats.buys || 0;
        const sells = stats.sells || 0;
        
        document.getElementById('totalTx').textContent = total.toString();
        
        if (total > 0) {
            const buyPercent = Math.round((buys / total) * 100);
            const sellPercent = Math.round((sells / total) * 100);
            document.getElementById('buySellRatio').textContent = `${buyPercent}% Buy / ${sellPercent}% Sell`;
        } else {
            document.getElementById('buySellRatio').textContent = 'No data yet';
        }
        
        // Show top holder or most active wallet
        if (holders.length > 0) {
            const topHolder = holders[0];
            const shortAddress = topHolder.owner ? topHolder.owner.slice(0, 8) + '...' : 'Loading...';
            document.getElementById('activeWallet').textContent = shortAddress;
        } else {
            document.getElementById('activeWallet').textContent = 'Loading...';
        }
    }

    updateCharts(stats = { total: 0, buys: 0, sells: 0 }, transactions = []) {
        // Update buy/sell chart with real data
        const buys = stats.buys || 0;
        const sells = stats.sells || 0;
        
        if (buys > 0 || sells > 0) {
            this.buySellChart.data.datasets[0].data = [buys, sells];
        } else {
            this.buySellChart.data.datasets[0].data = [1, 1]; // Show equal split when no data
        }
        this.buySellChart.update();

        // Update volume chart with transaction data
        const now = new Date();
        const labels = [];
        const data = [];
        
        // Group transactions by hour for the last 24 hours
        const hourlyData = {};
        for (let i = 23; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60 * 60 * 1000);
            const hour = time.getHours();
            const label = hour + ':00';
            labels.push(label);
            hourlyData[hour] = 0;
        }
        
        // Count transactions per hour
        transactions.forEach(tx => {
            if (tx.timestamp) {
                const txDate = new Date(tx.timestamp);
                const hour = txDate.getHours();
                if (hourlyData.hasOwnProperty(hour)) {
                    hourlyData[hour]++;
                }
            }
        });
        
        // Convert to array
        for (let i = 23; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60 * 60 * 1000);
            const hour = time.getHours();
            data.push(hourlyData[hour] || 0);
        }
        
        this.volumeChart.data.labels = labels;
        this.volumeChart.data.datasets[0].data = data;
        this.volumeChart.update();
    }

    updateTransactionTable(transactions = []) {
        const tbody = document.getElementById('transactionBody');
        
        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No transactions yet. Start monitoring to see data.</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.slice(0, 20).map(tx => {
            const date = new Date(tx.timestamp);
            const time = date.toLocaleTimeString();
            const wallet = tx.wallet ? tx.wallet.slice(0, 12) : 'Unknown';
            const type = (tx.type || 'unknown').toUpperCase();
            const amount = tx.amount ? parseFloat(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
            const protocol = tx.protocol || 'Unknown';
            
            return `
                <tr>
                    <td>${time}</td>
                    <td>${wallet}</td>
                    <td style="color: ${type === 'BUY' ? 'green' : type === 'SELL' ? 'red' : 'gray'}">${type}</td>
                    <td>${amount}</td>
                    <td>${protocol}</td>
                </tr>
            `;
        }).join('');
    }

    updateHoldersTable(holders = []) {
        const tbody = document.getElementById('holdersBody');
        
        if (holders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading holder data...</td></tr>';
            return;
        }

        // Calculate total supply for percentage calculation
        const totalSupply = holders.reduce((sum, holder) => sum + (holder.balance || 0), 0);

        tbody.innerHTML = holders.map((holder, index) => {
            const balance = holder.balance ? parseFloat(holder.balance) : 0;
            const formattedBalance = balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
            const percentage = totalSupply > 0 ? ((balance / totalSupply) * 100).toFixed(2) : '0.00';
            const address = holder.address ? holder.address.slice(0, 16) : 'Unknown';
            const owner = holder.owner ? holder.owner.slice(0, 16) : 'Unknown';
            
            return `
                <tr>
                    <td style="font-weight: bold; color: #2196F3;">#${index + 1}</td>
                    <td style="font-family: monospace; font-size: 12px;">${address}</td>
                    <td style="font-family: monospace; font-size: 12px;">${owner}</td>
                    <td style="font-weight: bold;">${formattedBalance}</td>
                    <td style="color: #4CAF50;">${percentage}%</td>
                </tr>
            `;
        }).join('');
    }

    updateHolders(holders = []) {
        const container = document.getElementById('holdersContainer');
        
        if (holders.length === 0) {
            container.innerHTML = '<p>No holder data available.</p>';
            return;
        }

        container.innerHTML = holders.slice(0, 10).map((holder, index) => {
            const balance = holder.balance ? parseFloat(holder.balance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
            const owner = holder.owner ? holder.owner.slice(0, 12) + '...' : 'Unknown';
            
            return `
                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 4px solid #2196F3;">
                    <div style="font-weight: bold; color: #333;">#${index + 1} Holder</div>
                    <div style="font-size: 12px; color: #666; margin: 5px 0;">${owner}</div>
                    <div style="font-size: 18px; color: #2196F3; font-weight: bold;">${balance} tokens</div>
                </div>
            `;
        }).join('');
    }

    exportData(format) {
        if (!this.currentData) {
            alert('No data to export. Please wait for data to load.');
            return;
        }

        const { transactions, holders, stats } = this.currentData;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

        if (format === 'csv') {
            // Export transactions as CSV
            const csvContent = [
                'Timestamp,Wallet,Type,Amount,Protocol',
                ...transactions.map(tx => [
                    new Date(tx.timestamp).toISOString(),
                    tx.wallet || '',
                    tx.type || '',
                    tx.amount || '',
                    tx.protocol || ''
                ].join(','))
            ].join('\n');

            this.downloadFile(`tokenwise-transactions-${timestamp}.csv`, csvContent, 'text/csv');
        } else if (format === 'json') {
            // Export all data as JSON
            const jsonContent = JSON.stringify({
                exportTime: new Date().toISOString(),
                stats,
                transactions,
                holders: holders.slice(0, 60)
            }, null, 2);

            this.downloadFile(`tokenwise-data-${timestamp}.json`, jsonContent, 'application/json');
        }
    }

    downloadFile(filename, content, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new TokenWiseDashboard();
});
