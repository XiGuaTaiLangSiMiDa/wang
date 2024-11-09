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

        // Display results
        console.log('\n=== 回测结果 ===');
        console.log(`\n分析周期: ${analysisPeriod}天 (${moment(analysisStartTime).format('YYYY-MM-DD')} 至 ${moment().format('YYYY-MM-DD')})`);
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT (${results.metrics.totalProfitPercent.toFixed(2)}%)`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);

        // Format trades for visualization
        const formattedTrades = results.trades.map(trade => ({
            entry: {
                timestamp: trade.entry.timestamp,
                price: trade.entry.entryPrice,
                timeframes: trade.entry.timeframes
            },
            exit: {
                timestamp: trade.exit.timestamp,
                price: trade.exit.price,
                reason: trade.exit.reason,
                exitTriggers: trade.exit.exitTriggers
            },
            profit: trade.profit,
            profitPercent: (trade.profit / strategy.initialCapital) * 100
        }));

        // Save visualization data
        const visualizationData = {
            candleData: analysisData,
            indicators: {
                bollinger: bbData
            },
            trades: formattedTrades
        };

        // Save latest results for visualization
        const visualizationPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(visualizationPath, JSON.stringify(visualizationData, null, 2));

        console.log(`\n可视化数据已保存至: ${visualizationPath}`);
        console.log('使用浏览器打开 visualization/index.html 查看交易信号');

    } catch (error) {
        console.error('回测执行错误:', error);
    }
}

main();
