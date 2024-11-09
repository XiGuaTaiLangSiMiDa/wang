const DataFetcher = require('./fetcher');
const BollingerCalculator = require('./calculator');
const TradingStrategy = require('./strategy');
const moment = require('moment');

async function main() {
    try {
        // Initialize components
        const fetcher = new DataFetcher();
        const calculator = new BollingerCalculator();
        const strategy = new TradingStrategy();

        // Calculate start time (6 months ago)
        const startTime = moment().subtract(6, 'months').valueOf();
        const symbol = 'BTC/USDT';

        console.log('Fetching historical data...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        console.log('Calculating Bollinger Bands...');
        const bbData = {
            '15m': calculator.calculateBollingerBands(rawData['15m']),
            '1h': calculator.calculateBollingerBands(rawData['1h']),
            '4h': calculator.calculateBollingerBands(rawData['4h'])
        };

        console.log('Aligning timeframes...');
        const alignedData = calculator.alignTimeframes(bbData['15m'], bbData['1h'], bbData['4h']);

        console.log('Running backtest...');
        const results = strategy.executeBacktest(alignedData);

        // Display results
        console.log('\n=== Backtest Results ===');
        console.log(`Total Trades: ${results.metrics.totalTrades}`);
        console.log(`Profitable Trades: ${results.metrics.profitableTrades}`);
        console.log(`Win Rate: ${results.metrics.winRate.toFixed(2)}%`);
        console.log(`Total Profit: ${results.metrics.totalProfit.toFixed(2)} USDT (${results.metrics.totalProfitPercent.toFixed(2)}%)`);
        console.log(`Average Profit per Trade: ${results.metrics.averageProfit.toFixed(2)} USDT`);
        console.log(`Average Trade Duration: ${moment.duration(results.metrics.averageDuration).humanize()}`);
        console.log(`Max Profit: ${results.metrics.maxProfit.toFixed(2)} USDT`);
        console.log(`Max Loss: ${results.metrics.maxLoss.toFixed(2)} USDT`);

        // Save detailed trade history
        const fs = require('fs');
        const path = require('path');
        const detailedResults = {
            metrics: results.metrics,
            trades: results.trades.map(trade => ({
                ...trade,
                entryTime: moment(trade.entry.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                exitTime: moment(trade.exit.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                durationHuman: moment.duration(trade.duration).humanize(),
                entryWeight: trade.entry.weight,
                exitWeight: trade.exit.weight
            }))
        };

        const resultsDir = path.join(__dirname, '../results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const resultsPath = path.join(resultsDir, `backtest_results_${moment().format('YYYYMMDD_HHmmss')}.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(detailedResults, null, 2));
        console.log(`\nDetailed results saved to: ${resultsPath}`);

    } catch (error) {
        console.error('Error running backtest:', error);
    }
}

main();
