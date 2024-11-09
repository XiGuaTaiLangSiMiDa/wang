const DataFetcher = require('./fetcher');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Calculate RSI
function calculateRSI(prices, period = 14) {
    let gains = 0;
    let losses = 0;
    
    // First pass to get initial averages
    for (let i = 1; i < period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    
    gains /= period;
    losses /= period;
    
    const rsi = [];
    let rs = gains / losses;
    rsi.push(100 - (100 / (1 + rs)));
    
    // Calculate remaining RSI values
    for (let i = period; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) {
            gains = (gains * (period - 1) + diff) / period;
            losses = (losses * (period - 1)) / period;
        } else {
            gains = (gains * (period - 1)) / period;
            losses = (losses * (period - 1) - diff) / period;
        }
        rs = gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
    }
    
    return rsi;
}

// Calculate MACD
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    function ema(data, period) {
        const k = 2 / (period + 1);
        let emaData = [data[0]];
        
        for (let i = 1; i < data.length; i++) {
            emaData.push(data[i] * k + emaData[i - 1] * (1 - k));
        }
        
        return emaData;
    }
    
    const fastEMA = ema(prices, fastPeriod);
    const slowEMA = ema(prices, slowPeriod);
    const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
    const signalLine = ema(macdLine, signalPeriod);
    
    return {
        macdLine,
        signalLine,
        histogram: macdLine.map((macd, i) => macd - signalLine[i])
    };
}

async function main() {
    try {
        // Initialize fetcher
        const fetcher = new DataFetcher();

        // Calculate start time (30 days ago for better pattern analysis)
        const startTime = moment().subtract(30, 'days').valueOf();
        const symbol = 'BTC/USDT';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // Process 15m data
        const candleData = rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
        }));

        // Calculate indicators
        const closePrices = candleData.map(candle => candle.close);
        const rsi = calculateRSI(closePrices);
        const macd = calculateMACD(closePrices);

        // Add indicators to candle data
        const enrichedData = candleData.map((candle, i) => ({
            ...candle,
            indicators: {
                rsi: rsi[i] || null,
                macd: macd.macdLine[i] || null,
                macdSignal: macd.signalLine[i] || null,
                macdHistogram: macd.histogram[i] || null
            }
        }));

        // Save visualization data
        const visualizationData = {
            candleData: {
                '15m': enrichedData
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
