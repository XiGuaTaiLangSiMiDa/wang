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

        // Get analysis period from command line argument or default to 180 days
        const analysisPeriod = parseInt(process.argv[2]) || 180;
        const analysisStartTime = moment().subtract(analysisPeriod, 'days').valueOf();

        // Filter data for analysis period
        const analysisData = {
            '15m': rawData['15m'].filter(d => d.timestamp >= analysisStartTime),
            '1h': rawData['1h'].filter(d => d.timestamp >= analysisStartTime),
            '4h': rawData['4h'].filter(d => d.timestamp >= analysisStartTime)
        };

        console.log(`计算布林带指标 (分析周期: ${analysisPeriod}天)...`);
        const bbData = {
            '15m': calculator.calculateBollingerBands(analysisData['15m']),
            '1h': calculator.calculateBollingerBands(analysisData['1h']),
            '4h': calculator.calculateBollingerBands(analysisData['4h'])
        };

        console.log('对齐时间周期...');
        const alignedData = calculator.alignTimeframes(bbData['15m'], bbData['1h'], bbData['4h']);

        console.log('执行回测...');
        const results = strategy.executeBacktest(alignedData);

        // Display results in Chinese
        console.log('\n=== 回测结果 ===');
        console.log(`\n分析周期: ${analysisPeriod}天 (${moment(analysisStartTime).format('YYYY-MM-DD')} 至 ${moment().format('YYYY-MM-DD')})`);
        console.log('\n整体表现:');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT (${results.metrics.totalProfitPercent.toFixed(2)}%)`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        
        console.log('\n交易退出分析:');
        console.log(`止损交易: ${results.metrics.stopLossTrades} (${((results.metrics.stopLossTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);
        console.log(`止盈交易: ${results.metrics.takeProfitTrades} (${((results.metrics.takeProfitTrades / results.metrics.totalTrades) * 100).toFixed(2)}%)`);
        console.log(`阻力位退出: ${results.metrics.resistanceExitTrades.total} (${((results.metrics.resistanceExitTrades.total / results.metrics.totalTrades) * 100).toFixed(2)}%)`);

        // Calculate profit distribution
        const profitBuckets = {
            stopLoss: { count: 0, totalProfit: 0 },
            takeProfit: { count: 0, totalProfit: 0 },
            resistance: {
                total: { count: 0, totalProfit: 0 },
                byTimeframe: {
                    '15m': { upper: { count: 0, profit: 0 }, middle: { count: 0, profit: 0 } },
                    '1h': { upper: { count: 0, profit: 0 }, middle: { count: 0, profit: 0 } },
                    '4h': { upper: { count: 0, profit: 0 }, middle: { count: 0, profit: 0 } }
                }
            }
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
                    profitBuckets.resistance.total.count++;
                    profitBuckets.resistance.total.totalProfit += trade.profit;
                    if (trade.exit.exitTriggers && trade.exit.exitTriggers.length > 0) {
                        const primaryTrigger = trade.exit.exitTriggers[0];
                        profitBuckets.resistance.byTimeframe[primaryTrigger.timeframe][primaryTrigger.band].count++;
                        profitBuckets.resistance.byTimeframe[primaryTrigger.timeframe][primaryTrigger.band].profit += trade.profit;
                    }
                    break;
            }
        });

        // Save detailed results for visualization
        const detailedResults = {
            period: analysisPeriod,
            startDate: moment(analysisStartTime).format('YYYY-MM-DD'),
            endDate: moment().format('YYYY-MM-DD'),
            metrics: results.metrics,
            profitDistribution: profitBuckets,
            trades: results.trades.map(trade => ({
                ...trade,
                entryTime: moment(trade.entry.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                exitTime: moment(trade.exit.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                durationHuman: moment.duration(trade.duration).humanize(),
                entryWeight: trade.entry.weight,
                exitWeight: trade.exit.weight,
                exitReason: trade.exit.details || (
                    trade.exit.reason === 'Stop Loss' ? '止损' :
                    trade.exit.reason === 'Take Profit' ? '止盈' : '阻力位退出'
                )
            })),
            candleData: analysisData,
            indicators: {
                bollinger: bbData
            }
        };

        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '../results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        // Save results with timestamp
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const resultsPath = path.join(resultsDir, `backtest_results_${analysisPeriod}d_${timestamp}.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(detailedResults, null, 2));

        // Save latest results for visualization
        const visualizationPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(visualizationPath, JSON.stringify(detailedResults, null, 2));

        console.log(`\n详细结果已保存至: ${resultsPath}`);
        console.log(`可视化结果已保存至: ${visualizationPath}`);

    } catch (error) {
        console.error('回测执行错误:', error);
    }
}

main();
