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

// Backtest strategy
function backtest(candleData, bbands) {
    const initialCapital = 100; // 100 USDT
    const leverage = 100;
    const stopLossPercent = 0.5; // 50% of capital
    const takeProfitPercent = 1.0; // 100% of capital (100 USDT)
    
    let position = null;
    const trades = [];
    
    for (let i = 0; i < candleData.length; i++) {
        const candle = candleData[i];
        const bb = bbands[i];
        
        // Skip if no BB data
        if (!bb.upper) continue;
        
        // Check for stop loss or take profit if in position
        if (position) {
            // For short positions, PnL is reversed: we profit when price goes down
            const pnlPercent = (position.entryPrice - candle.close) / position.entryPrice;
            
            // Check stop loss (-50% of capital = 0.5% price move against us at 100x leverage)
            if (pnlPercent <= -stopLossPercent/leverage) {
                trades.push({
                    entry: position,
                    exit: {
                        price: candle.close,
                        time: candle.timestamp,
                        reason: 'Stop Loss'
                    },
                    profit: initialCapital * leverage * pnlPercent
                });
                position = null;
                continue;
            }
            
            // Check take profit (100% of capital = 1% price move in our favor at 100x leverage)
            if (pnlPercent >= takeProfitPercent/leverage) {
                trades.push({
                    entry: position,
                    exit: {
                        price: candle.close,
                        time: candle.timestamp,
                        reason: 'Take Profit'
                    },
                    profit: initialCapital * leverage * pnlPercent
                });
                position = null;
                continue;
            }
        }
        
        // Check for entry if no position
        // Changed condition: high price above upper band (opposite of long strategy)
        if (!position && candle.high > bb.upper) {
            position = {
                price: candle.close, // Still using close price for entry to avoid slippage
                time: candle.timestamp,
                bbUpper: bb.upper,
                entryPrice: candle.close,
                highPrice: candle.high // Store high price for reference
            };
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
            totalTrades: trades.length,
            winRate: trades.length > 0 ? (winCount / trades.length) * 100 : 0,
            totalProfit,
            profitPercent: (totalProfit / initialCapital) * 100
        }
    };
}

async function main() {
    try {
        // Initialize fetcher
        const fetcher = new DataFetcher();

        // Calculate start time (180 days ago)
        const startTime = moment().subtract(180, 'days').valueOf();
        const symbol = 'SOL-USDT-SWAP';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // Process 15m data
        const candleData = rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));

        // Calculate Bollinger Bands
        console.log('计算布林带指标...');
        const bbands = calculateBollingerBands(candleData);

        // Run backtest
        console.log('执行做空回测...');
        const results = backtest(candleData, bbands);

        // Display results
        console.log('\n=== 做空回测结果 ===');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT`);
        console.log(`收益率: ${results.metrics.profitPercent.toFixed(2)}%`);

        // Save visualization data
        const visualizationData = {
            candleData: {
                '15m': candleData.map((candle, i) => ({
                    ...candle,
                    bb: bbands[i]
                }))
            },
            trades: results.trades.map(trade => ({
                entry: {
                    timestamp: trade.entry.time,
                    price: trade.entry.price,
                    bbUpper: trade.entry.bbUpper,
                    highPrice: trade.entry.highPrice
                },
                exit: {
                    timestamp: trade.exit.time,
                    price: trade.exit.price,
                    reason: trade.exit.reason
                },
                profit: trade.profit
            })),
            metrics: results.metrics
        };

        // Save latest results for visualization
        const visualizationPath = path.join(__dirname, 'visualization/latest_results_short.json');
        fs.writeFileSync(visualizationPath, JSON.stringify(visualizationData, null, 2));

        console.log(`\n数据已保存至: ${visualizationPath}`);
        console.log('使用浏览器打开 visualization/index.html 查看交易信号');

    } catch (error) {
        console.error('数据获取错误:', error);
    }
}

main();
