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
    const changes = data.map((candle, i) => {
        if (i === 0) return null;
        return candle.close - data[i - 1].close;
    }).slice(1);

    let gains = changes.map(change => change > 0 ? change : 0);
    let losses = changes.map(change => change < 0 ? -change : 0);

    // Calculate average gains and losses
    const avgGains = [];
    const avgLosses = [];
    let gainSum = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0);
    let lossSum = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0);

    avgGains.push(gainSum / period);
    avgLosses.push(lossSum / period);

    for (let i = period; i < changes.length; i++) {
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
    
    // Calculate EMAs
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
    
    // Calculate MACD line
    const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
    
    // Calculate Signal line
    const signalLine = calculateEMA(macdLine, signalPeriod);
    
    // Calculate Histogram
    const histogram = macdLine.map((macd, i) => macd - signalLine[i]);
    
    return macdLine.map((macd, i) => ({
        macd,
        signal: signalLine[i],
        histogram: histogram[i]
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

// Calculate indicators for analysis
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

// Analyze indicator distributions
function analyzeIndicatorDistributions(trades, candleData) {
    const profitableTrades = trades.filter(trade => trade.profit > 0);
    const losingTrades = trades.filter(trade => trade.profit <= 0);

    function calculateStats(values) {
        const sorted = values.filter(v => v !== null && !isNaN(v)).sort((a, b) => a - b);
        const mean = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        
        // Calculate standard deviation
        const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sorted.length;
        const stdDev = Math.sqrt(variance);

        return { mean, median, min, max, stdDev };
    }

    function analyzeTradeSet(tradeSet, label) {
        const indicators = {
            rsi: [],
            macdHistogram: [],
            volumeRatio: [],
            pricePosition: [],
            volatility: []
        };

        tradeSet.forEach(trade => {
            const entryIndex = candleData.findIndex(candle => candle.timestamp === trade.entry.timestamp);
            if (entryIndex === -1) return;

            const candle = candleData[entryIndex];
            indicators.rsi.push(candle.indicators.rsi);
            indicators.macdHistogram.push(candle.indicators.macd.histogram);
            indicators.volumeRatio.push(candle.indicators.volume?.volumeRatio);
            indicators.pricePosition.push(candle.indicators.pricePosition);
            indicators.volatility.push(candle.indicators.volatility);
        });

        return {
            count: tradeSet.length,
            rsi: calculateStats(indicators.rsi),
            macdHistogram: calculateStats(indicators.macdHistogram),
            volumeRatio: calculateStats(indicators.volumeRatio),
            pricePosition: calculateStats(indicators.pricePosition),
            volatility: calculateStats(indicators.volatility)
        };
    }

    return {
        profitable: analyzeTradeSet(profitableTrades, '盈利交易'),
        losing: analyzeTradeSet(losingTrades, '亏损交易')
    };
}

// Calculate indicator weights
function calculateIndicatorWeights(analysis) {
    const weights = {};
    const indicators = ['rsi', 'macdHistogram', 'volumeRatio', 'pricePosition', 'volatility'];

    indicators.forEach(indicator => {
        const profitable = analysis.profitable[indicator];
        const losing = analysis.losing[indicator];

        // Calculate separation between profitable and losing trades
        const separation = Math.abs(profitable.mean - losing.mean) / 
            ((profitable.stdDev + losing.stdDev) / 2);

        weights[indicator] = separation;
    });

    return weights;
}

// Generate trading rules based on analysis
function generateTradingRules(analysis, weights) {
    const rules = [];
    const indicators = Object.keys(weights);

    // Sort indicators by weight
    indicators.sort((a, b) => weights[b] - weights[a]);

    indicators.forEach(indicator => {
        const profitable = analysis.profitable[indicator];
        const losing = analysis.losing[indicator];

        // Define safe ranges (avoid losing trade ranges)
        const safeMin = Math.min(profitable.mean - profitable.stdDev, losing.mean - losing.stdDev);
        const safeMax = Math.max(profitable.mean + profitable.stdDev, losing.mean + losing.stdDev);

        rules.push({
            indicator,
            weight: weights[indicator].toFixed(2),
            avoidRange: `${safeMin.toFixed(2)} - ${safeMax.toFixed(2)}`,
            profitableMean: profitable.mean.toFixed(2),
            losingMean: losing.mean.toFixed(2)
        });
    });

    return rules;
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

        // Analyze indicator distributions
        console.log('\n分析指标分布...');
        const analysis = analyzeIndicatorDistributions(results.trades, candleData);
        const weights = calculateIndicatorWeights(analysis);
        const rules = generateTradingRules(analysis, weights);

        // Display results
        console.log('\n=== 指标分析结果 ===');
        console.log('\n盈利交易指标特征:');
        Object.entries(analysis.profitable).forEach(([indicator, stats]) => {
            if (indicator !== 'count') {
                console.log(`${indicator}:`);
                console.log(`  平均值: ${stats.mean.toFixed(2)}`);
                console.log(`  中位数: ${stats.median.toFixed(2)}`);
                console.log(`  标准差: ${stats.stdDev.toFixed(2)}`);
                console.log(`  范围: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}`);
            }
        });

        console.log('\n亏损交易指标特征:');
        Object.entries(analysis.losing).forEach(([indicator, stats]) => {
            if (indicator !== 'count') {
                console.log(`${indicator}:`);
                console.log(`  平均值: ${stats.mean.toFixed(2)}`);
                console.log(`  中位数: ${stats.median.toFixed(2)}`);
                console.log(`  标准差: ${stats.stdDev.toFixed(2)}`);
                console.log(`  范围: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}`);
            }
        });

        console.log('\n=== 指标权重 ===');
        rules.forEach(rule => {
            console.log(`\n${rule.indicator}:`);
            console.log(`权重: ${rule.weight}`);
            console.log(`盈利均值: ${rule.profitableMean}`);
            console.log(`亏损均值: ${rule.losingMean}`);
            console.log(`建议避免范围: ${rule.avoidRange}`);
        });

        // Save analysis results
        const analysisResults = {
            candleData: candleData.map(candle => ({
                timestamp: candle.timestamp,
                indicators: candle.indicators
            })),
            trades: results.trades,
            analysis: {
                profitable: analysis.profitable,
                losing: analysis.losing,
                weights,
                rules
            }
        };

        const analysisPath = path.join(__dirname, 'visualization/analysis_results.json');
        fs.writeFileSync(analysisPath, JSON.stringify(analysisResults, null, 2));

        console.log(`\n分析结果已保存至: ${analysisPath}`);

    } catch (error) {
        console.error('分析错误:', error);
    }
}

main();
