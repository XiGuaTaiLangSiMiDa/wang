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
            lower: sma[i] - (multiplier * standardDeviation),
            standardDeviation
        });
    }
    
    return bands;
}

// Calculate RSI
function calculateRSI(data, period = 14) {
    const closes = data.map(candle => candle.close);
    const gains = [];
    const losses = [];
    
    // Calculate price changes
    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }
    
    // Calculate average gains and losses
    const avgGains = [];
    const avgLosses = [];
    let gainSum = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0);
    let lossSum = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0);
    
    avgGains.push(gainSum / period);
    avgLosses.push(lossSum / period);
    
    for (let i = period; i < gains.length; i++) {
        gainSum = (avgGains[avgGains.length - 1] * (period - 1) + gains[i]);
        lossSum = (avgLosses[avgLosses.length - 1] * (period - 1) + losses[i]);
        avgGains.push(gainSum / period);
        avgLosses.push(lossSum / period);
    }
    
    // Calculate RSI
    const rsi = avgGains.map((gain, i) => {
        const rs = gain / (avgLosses[i] || 0.00001);
        return 100 - (100 / (1 + rs));
    });
    
    // Pad the beginning with nulls
    return [...new Array(data.length - rsi.length).fill(null), ...rsi];
}

// Calculate MACD
function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const closes = data.map(candle => candle.close);
    
    function calculateEMA(prices, period) {
        const k = 2 / (period + 1);
        const ema = [prices[0]];
        
        for (let i = 1; i < prices.length; i++) {
            ema.push(prices[i] * k + ema[i - 1] * (1 - k));
        }
        
        return ema;
    }
    
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);
    const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
    const signalLine = calculateEMA(macdLine, signalPeriod);
    const histogram = macdLine.map((macd, i) => macd - signalLine[i]);
    
    return macdLine.map((macd, i) => ({
        macd,
        signal: signalLine[i],
        histogram
    }));
}

// Calculate Volume Profile
function calculateVolumeProfile(data, periods = 20) {
    return data.map((candle, i) => {
        if (i < periods) return null;
        
        const volumeSum = data.slice(i - periods, i).reduce((sum, c) => sum + c.volume, 0);
        const avgVolume = volumeSum / periods;
        
        return {
            volumeRatio: candle.volume / avgVolume,
            avgVolume
        };
    });
}

// Calculate all indicators
function calculateIndicators(candleData) {
    const bb = calculateBollingerBands(candleData);
    const rsi = calculateRSI(candleData);
    const macd = calculateMACD(candleData);
    const volume = calculateVolumeProfile(candleData);

    return candleData.map((candle, i) => ({
        ...candle,
        indicators: {
            bb: bb[i],
            rsi: rsi[i],
            macd: macd[i],
            volume: volume[i],
            pricePosition: bb[i]?.middle ? (candle.close - bb[i].middle) / bb[i].standardDeviation : null,
            volatility: bb[i]?.standardDeviation ? (bb[i].standardDeviation / bb[i].middle) * 100 : null
        }
    }));
}

// Backtest strategy
function backtest(candleData, bbands) {
    const initialCapital = 2000; // 2000 USDT
    const leverage = 100;
    const stopLossPercent = 0.5; // 50% of position size
    const takeProfitPercent = 1.0; // 100% of position size
    
    let capital = initialCapital;
    let position = null;
    const trades = [];
    let tradeCount = 0;
    
    for (let i = 0; i < candleData.length; i++) {
        const candle = candleData[i];
        const bb = bbands[i];
        
        // Skip if no BB data
        if (!bb || !bb.lower) continue;
        
        // Check for stop loss or take profit if in position
        if (position) {
            const pnlPercent = (candle.close - position.entryPrice) / position.entryPrice;
            const positionSize = position.positionSize;
            
            // Check stop loss (-50% of position = -0.5% price move at 100x leverage)
            if (pnlPercent <= -stopLossPercent/leverage) {
                const loss = positionSize * leverage * pnlPercent;
                capital += loss;
                tradeCount++;
                trades.push({
                    entry: {
                        ...position,
                        indicators: candle.indicators
                    },
                    exit: {
                        price: candle.close,
                        timestamp: candle.timestamp,
                        reason: 'Stop Loss',
                        indicators: candle.indicators
                    },
                    profit: loss,
                    remainingCapital: capital,
                    tradeNumber: tradeCount
                });
                position = null;
                continue;
            }
            
            // Check take profit (100% of position = 1% price move at 100x leverage)
            if (pnlPercent >= takeProfitPercent/leverage) {
                const profit = positionSize * leverage * pnlPercent;
                capital += profit;
                tradeCount++;
                trades.push({
                    entry: {
                        ...position,
                        indicators: candle.indicators
                    },
                    exit: {
                        price: candle.close,
                        timestamp: candle.timestamp,
                        reason: 'Take Profit',
                        indicators: candle.indicators
                    },
                    profit: profit,
                    remainingCapital: capital,
                    tradeNumber: tradeCount
                });
                position = null;
                continue;
            }
        }
        
        // Check for entry if no position
        if (!position && candle.low < bb.lower) {
            // Use all available capital for position
            const positionSize = capital;
            
            position = {
                price: candle.close,
                timestamp: candle.timestamp,
                bbLower: bb.lower,
                entryPrice: candle.close,
                lowPrice: candle.low,
                positionSize: positionSize,
                indicators: candle.indicators
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
            totalTrades: trades.length,
            winRate: trades.length > 0 ? (winCount / trades.length) * 100 : 0,
            totalProfit,
            profitPercent: (totalProfit / initialCapital) * 100
        }
    };
}

async function main() {
    try {
        const fetcher = new DataFetcher();
        const startTime = moment().subtract(30, 'days').valueOf();
        const symbol = 'SOL/USDT:USDT';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // Process and calculate indicators
        console.log('计算技术指标...');
        const candleData = calculateIndicators(rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
        })));

        // Run backtest
        console.log('执行回测...');
        const bbands = candleData.map(candle => candle.indicators.bb);
        const results = backtest(candleData, bbands);

        // Save results
        const resultsData = {
            candleData: {
                '15m': candleData
            },
            trades: results.trades,
            metrics: results.metrics
        };

        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));

        console.log('\n=== 回测结果 ===');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT`);
        console.log(`收益率: ${results.metrics.profitPercent.toFixed(2)}%`);
        console.log(`\n数据已保存至: ${resultsPath}`);

    } catch (error) {
        console.error('执行错误:', error);
    }
}

main();
