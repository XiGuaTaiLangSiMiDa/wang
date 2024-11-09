const DataFetcher = require('./fetcher');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Calculate Bollinger Bands
function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const closes = data.map(candle => candle.close);
    
    // Calculate SMA
    const sma = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += closes[i - j];
        }
        sma.push(sum / period);
    }
    
    // Calculate Standard Deviation and Bands
    const bands = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            bands.push({
                middle: null,
                upper: null,
                lower: null
            });
            continue;
        }
        
        let sumSquaredDiff = 0;
        for (let j = 0; j < period; j++) {
            sumSquaredDiff += Math.pow(closes[i - j] - sma[i], 2);
        }
        const standardDeviation = Math.sqrt(sumSquaredDiff / period);
        
        bands.push({
            middle: sma[i],
            upper: sma[i] + (multiplier * standardDeviation),
            lower: sma[i] - (multiplier * standardDeviation)
        });
    }
    
    return bands;
}

// Backtest strategy with different stop loss levels
function backtest(candleData, bbands, initialCapital, stopLossPercent) {
    const leverage = 100;
    const takeProfitPercent = 1.0; // 100% of position size
    
    let capital = initialCapital;
    let position = null;
    const trades = [];
    let tradeCount = 0;
    let lastProfitableCapital = initialCapital;
    
    for (let i = 0; i < candleData.length; i++) {
        const candle = candleData[i];
        const bb = bbands[i];
        
        // Skip if no BB data
        if (!bb.lower) continue;
        
        // Check for stop loss or take profit if in position
        if (position) {
            const pnlPercent = (candle.close - position.entryPrice) / position.entryPrice;
            const positionSize = position.positionSize;
            
            // Check stop loss
            if (pnlPercent <= -stopLossPercent/leverage) {
                const loss = positionSize * leverage * pnlPercent;
                capital += loss;
                trades.push({
                    entry: position,
                    exit: {
                        price: candle.close,
                        time: candle.timestamp,
                        reason: 'Stop Loss'
                    },
                    profit: loss,
                    capitalAfter: capital,
                    tradeNumber: tradeCount
                });
                position = null;
                continue;
            }
            
            // Check take profit
            if (pnlPercent >= takeProfitPercent/leverage) {
                const profit = positionSize * leverage * pnlPercent;
                capital += profit;
                lastProfitableCapital = capital;
                trades.push({
                    entry: position,
                    exit: {
                        price: candle.close,
                        time: candle.timestamp,
                        reason: 'Take Profit'
                    },
                    profit: profit,
                    capitalAfter: capital,
                    tradeNumber: tradeCount
                });
                position = null;
                continue;
            }
        }
        
        // Check for entry if no position
        if (!position && candle.low < bb.lower) {
            // Calculate position size (100% of current capital)
            const positionSize = capital;
            tradeCount++;
            
            position = {
                price: candle.close,
                time: candle.timestamp,
                bbLower: bb.lower,
                entryPrice: candle.close,
                lowPrice: candle.low,
                positionSize: positionSize
            };
        }
        
        // Check if capital is depleted
        if (capital <= 0) {
            break;
        }
    }
    
    // Calculate statistics
    let totalProfit = 0;
    let winCount = 0;
    
    trades.forEach(trade => {
        totalProfit += trade.profit;
        if (trade.profit > 0) winCount++;
    });
    
    return {
        trades,
        metrics: {
            initialCapital,
            finalCapital: capital,
            lastProfitableCapital,
            totalTrades: trades.length,
            winRate: trades.length > 0 ? (winCount / trades.length) * 100 : 0,
            totalProfit,
            profitPercent: (totalProfit / initialCapital) * 100,
            maxTradeNumber: tradeCount,
            survivedTrades: trades.length
        }
    };
}

async function main() {
    try {
        const fetcher = new DataFetcher();
        const startTime = moment().subtract(30, 'days').valueOf();
        const symbol = 'SOL/USDT:USDT';
        const initialCapital = 2000; // 2000 USDT

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        const candleData = rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));

        console.log('计算布林带指标...');
        const bbands = calculateBollingerBands(candleData);

        // Test both stop loss levels
        console.log('\n=== 0.5% 止损测试 ===');
        const results05 = backtest(candleData, bbands, initialCapital, 0.5);
        console.log(`初始资金: ${initialCapital} USDT`);
        console.log(`最终资金: ${results05.metrics.finalCapital.toFixed(2)} USDT`);
        console.log(`最后盈利时资金: ${results05.metrics.lastProfitableCapital.toFixed(2)} USDT`);
        console.log(`总开单次数: ${results05.metrics.maxTradeNumber}`);
        console.log(`完整交易次数: ${results05.metrics.survivedTrades}`);
        console.log(`胜率: ${results05.metrics.winRate.toFixed(2)}%`);

        console.log('\n=== 0.3% 止损测试 ===');
        const results03 = backtest(candleData, bbands, initialCapital, 0.3);
        console.log(`初始资金: ${initialCapital} USDT`);
        console.log(`最终资金: ${results03.metrics.finalCapital.toFixed(2)} USDT`);
        console.log(`最后盈利时资金: ${results03.metrics.lastProfitableCapital.toFixed(2)} USDT`);
        console.log(`总开单次数: ${results03.metrics.maxTradeNumber}`);
        console.log(`完整交易次数: ${results03.metrics.survivedTrades}`);
        console.log(`胜率: ${results03.metrics.winRate.toFixed(2)}%`);

        // Save visualization data (using 0.5% stop loss for visualization)
        const visualizationData = {
            candleData: {
                '15m': candleData.map((candle, i) => ({
                    ...candle,
                    bb: bbands[i]
                }))
            },
            trades: results05.trades.map(trade => ({
                entry: {
                    timestamp: trade.entry.time,
                    price: trade.entry.price,
                    bbLower: trade.entry.bbLower,
                    lowPrice: trade.entry.lowPrice,
                    positionSize: trade.entry.positionSize
                },
                exit: {
                    timestamp: trade.exit.time,
                    price: trade.exit.price,
                    reason: trade.exit.reason
                },
                profit: trade.profit,
                capitalAfter: trade.capitalAfter,
                tradeNumber: trade.tradeNumber
            })),
            metrics: results05.metrics
        };

        const visualizationPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(visualizationPath, JSON.stringify(visualizationData, null, 2));

        console.log(`\n数据已保存至: ${visualizationPath}`);

    } catch (error) {
        console.error('数据获取错误:', error);
    }
}

main();
