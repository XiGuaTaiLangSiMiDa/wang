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
        console.log('\nOverall Performance:');
        console.log(`Total Trades: ${results.metrics.totalTrades}`);
        console.log(`Total Profit: ${results.metrics.totalProfit.toFixed(2)} USDT (${results.metrics.totalProfitPercent.toFixed(2)}%)`);
        console.log(`Win Rate: ${results.metrics.winRate.toFixed(2)}%`);
        
        console.log('\nTrade Exit Analysis:');
        console.log(`Stop Loss Trades: ${results.metrics.stopLossTrades} (${((results.metrics.stopLossTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);
        console.log(`Take Profit Trades: ${results.metrics.takeProfitTrades} (${((results.metrics.takeProfitTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);
        console.log(`Resistance Exit Trades: ${results.metrics.resistanceExitTrades} (${((results.metrics.resistanceExitTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);

        console.log('\nProfit Metrics:');
        console.log(`Average Profit per Trade: ${results.metrics.averageProfit.toFixed(2)} USDT`);
        console.log(`Max Profit: ${results.metrics.maxProfit.toFixed(2)} USDT`);
        console.log(`Max Loss: ${results.metrics.maxLoss.toFixed(2)} USDT`);
        console.log(`Average Trade Duration: ${moment.duration(results.metrics.averageDuration).humanize()}`);

        // Calculate profit distribution
        const profitBuckets = {
            stopLoss: { count: 0, totalProfit: 0 },
            takeProfit: { count: 0, totalProfit: 0 },
            resistance: { count: 0, totalProfit: 0 }
        };

        results.trades.forEach(trade => {
            switch (trade.exit.reason) {
                case 'Stop Loss':
                    profitBuckets.stopLoss.count++;
                    profitBuckets.stopLoss.totalProfit += trade.profit;
                    break;
                case 'Take Profit':
                    profitBuckets.takeProfit.count++;
                    profitBuckets.takeProfit.totalProfit += trade.profit;
                    break;
                case 'Resistance':
                    profitBuckets.resistance.count++;
                    profitBuckets.resistance.totalProfit += trade.profit;
                    break;
            }
        });

        console.log('\nProfit Distribution by Exit Type:');
        if (profitBuckets.stopLoss.count > 0) {
            console.log(`Stop Loss Avg Profit: ${(profitBuckets.stopLoss.totalProfit / profitBuckets.stopLoss.count).toFixed(2)} USDT`);
        }
        if (profitBuckets.takeProfit.count > 0) {
            console.log(`Take Profit Avg Profit: ${(profitBuckets.takeProfit.totalProfit / profitBuckets.takeProfit.count).toFixed(2)} USDT`);
        }
        if (profitBuckets.resistance.count > 0) {
            console.log(`Resistance Exit Avg Profit: ${(profitBuckets.resistance.totalProfit / profitBuckets.resistance.count).toFixed(2)} USDT`);
        }

        // Save detailed trade history
        const fs = require('fs');
        const path = require('path');
        const detailedResults = {
            metrics: results.metrics,
            profitDistribution: profitBuckets,
            trades: results.trades.map(trade => ({
                ...trade,
                entryTime: moment(trade.entry.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                exitTime: moment(trade.exit.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                durationHuman: moment.duration(trade.duration).humanize(),
                entryWeight: trade.entry.weight,
                exitWeight: trade.exit.weight,
                exitReason: trade.exit.reason
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
