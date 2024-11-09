const DataFetcher = require('./fetcher');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Initialize fetcher
        const fetcher = new DataFetcher();

        // Calculate start time (30 days ago for better pivot point analysis)
        const startTime = moment().subtract(30, 'days').valueOf();
        const symbol = 'BTC/USDT';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // Only save 15m data for pivot point analysis
        const visualizationData = {
            candleData: {
                '15m': rawData['15m'].map(candle => ({
                    timestamp: candle.timestamp,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close
                }))
            }
        };

        // Save latest results for visualization
        const visualizationPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(visualizationPath, JSON.stringify(visualizationData, null, 2));

        console.log(`\n数据已保存至: ${visualizationPath}`);
        console.log('使用浏览器打开 visualization/index.html 查看K线拐点分析');

    } catch (error) {
        console.error('数据获取错误:', error);
    }
}

main();
