const fs = require('fs');
const path = require('path');

// Debug function to inspect data
function debugData(trades, candleData) {
    console.log('\n=== Debug Data ===');
    
    // Check candleData
    console.log('\nCandle Data Sample:');
    if (candleData && candleData.length > 0) {
        const sampleCandle = candleData[0];
        console.log(JSON.stringify(sampleCandle, null, 2));
    } else {
        console.log('No candle data available');
    }

    // Check if we can match trades with candles
    if (trades && trades.length > 0 && candleData && candleData.length > 0) {
        const firstTrade = trades[0];
        console.log('\nTrying to match first trade with candle:');
        console.log('Trade timestamp:', firstTrade.entry.timestamp);
        const matchingCandle = candleData.find(c => c.timestamp === firstTrade.entry.timestamp);
        console.log('Found matching candle:', matchingCandle ? 'Yes' : 'No');
        if (matchingCandle) {
            console.log('Matching Candle Data:');
            console.log(JSON.stringify(matchingCandle, null, 2));
        }
    }

    // Calculate indicators for the first few candles
    console.log('\nCalculating indicators for first candle:');
    if (candleData && candleData.length > 0) {
        const firstCandle = candleData[0];
        // Calculate BB position
        if (firstCandle.bb) {
            const bbPosition = ((firstCandle.close - firstCandle.bb.middle) / 
                (firstCandle.bb.upper - firstCandle.bb.middle)) * 100;
            console.log('BB Position:', bbPosition);
        }
        
        // Log all available indicators
        console.log('\nAvailable Indicators:');
        if (firstCandle.indicators) {
            console.log(JSON.stringify(firstCandle.indicators, null, 2));
        } else {
            console.log('No indicators found in candle data');
        }
    }
}

// 读取交易数据
function loadTradeData() {
    try {
        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        console.log('Loading data from:', resultsPath);
        
        if (!fs.existsSync(resultsPath)) {
            throw new Error('交易数据文件不存在');
        }
        
        const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        // Verify data structure
        if (!data.candleData || !data.candleData['15m']) {
            throw new Error('K线数据格式错误');
        }
        if (!data.trades || !Array.isArray(data.trades)) {
            throw new Error('交易数据格式错误');
        }

        // Calculate indicators for each candle
        const candleData = data.candleData['15m'].map(candle => {
            // Calculate BB values
            const bb = candle.bb || {};
            const bbPosition = bb.middle ? ((candle.close - bb.middle) / (bb.upper - bb.lower)) * 100 : null;
            
            // Calculate volatility
            const volatility = bb.middle ? (bb.standardDeviation / bb.middle) * 100 : null;

            return {
                ...candle,
                indicators: {
                    bbPosition,
                    volatility,
                    rsi: candle.rsi,
                    macd: candle.macd,
                    volume: candle.volume
                }
            };
        });

        return {
            trades: data.trades,
            candleData
        };
    } catch (error) {
        console.error('读取数据失败:', error.message);
        process.exit(1);
    }
}

// 主函数
async function main() {
    console.log('开始分析交易模式...');
    
    // 加载数据
    const { trades, candleData } = loadTradeData();
    
    // Debug data
    debugData(trades, candleData);
    
    console.log('\n数据检查完成。请根据输出调整分析逻辑。');
}

main().catch(console.error);
