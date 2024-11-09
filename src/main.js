const DataFetcher = require('./fetcher');
const BollingerCalculator = require('./calculator');
const TradingStrategy = require('./strategy');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Initialize components
        const fetcher = new DataFetcher();
        const calculator = new BollingerCalculator();
        const strategy = new TradingStrategy();

        // Calculate start time (6 months ago)
        const startTime = moment().subtract(6, 'months').valueOf();
        const symbol = 'BTC/USDT';

        console.log('正在获取历史数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        console.log('计算布林带指标...');
        const bbData = {
            '15m': calculator.calculateBollingerBands(rawData['15m']),
            '1h': calculator.calculateBollingerBands(rawData['1h']),
            '4h': calculator.calculateBollingerBands(rawData['4h'])
        };

        console.log('对齐时间周期...');
        const alignedData = calculator.alignTimeframes(bbData['15m'], bbData['1h'], bbData['4h']);

        console.log('执行回测...');
        const results = strategy.executeBacktest(alignedData);

        // Display results in Chinese
        console.log('\n=== 回测结果 ===');
        console.log('\n整体表现:');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT (${results.metrics.totalProfitPercent.toFixed(2)}%)`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        
        console.log('\n交易退出分析:');
        console.log(`止损交易: ${results.metrics.stopLossTrades} (${((results.metrics.stopLossTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);
        console.log(`止盈交易: ${results.metrics.takeProfitTrades} (${((results.metrics.takeProfitTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);
        console.log(`阻力位退出: ${results.metrics.resistanceExitTrades} (${((results.metrics.resistanceExitTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);

        console.log('\n收益指标:');
        console.log(`平均每笔收益: ${results.metrics.averageProfit.toFixed(2)} USDT`);
        console.log(`最大收益: ${results.metrics.maxProfit.toFixed(2)} USDT`);
        console.log(`最大亏损: ${results.metrics.maxLoss.toFixed(2)} USDT`);
        console.log(`平均持仓时间: ${moment.duration(results.metrics.averageDuration).humanize()}`);

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

        console.log('\n各类型平均收益:');
        if (profitBuckets.stopLoss.count > 0) {
            console.log(`止损平均收益: ${(profitBuckets.stopLoss.totalProfit / profitBuckets.stopLoss.count).toFixed(2)} USDT`);
        }
        if (profitBuckets.takeProfit.count > 0) {
            console.log(`止盈平均收益: ${(profitBuckets.takeProfit.totalProfit / profitBuckets.takeProfit.count).toFixed(2)} USDT`);
        }
        if (profitBuckets.resistance.count > 0) {
            console.log(`阻力位退出平均收益: ${(profitBuckets.resistance.totalProfit / profitBuckets.resistance.count).toFixed(2)} USDT`);
        }

        // Save detailed trade history
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
                exitReason: trade.exit.reason === 'Stop Loss' ? '止损' :
                           trade.exit.reason === 'Take Profit' ? '止盈' : '阻力位退出'
            }))
        };

        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '../results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        // Save results
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const resultsPath = path.join(resultsDir, `backtest_results_${timestamp}.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(detailedResults, null, 2));
        
        // Create/update symlink to latest results for visualization
        const latestResultsPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(latestResultsPath, JSON.stringify(detailedResults, null, 2));

        console.log(`\n详细结果已保存至: ${resultsPath}`);
        console.log(`可视化结果可通过打开 src/visualization/index.html 查看`);

    } catch (error) {
        console.error('回测执行错误:', error);
    }
}

main();
