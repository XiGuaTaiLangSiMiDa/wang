const DataFetcher = require('./fetcher');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// 导入原有的main.js功能
const mainScript = require('./main.js');

// 计算布林带指标
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

// 分析交易模式
function analyzeTradingPatterns(trades, candleData) {
    // 分离盈利和亏损交易
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    // 分析各项指标
    const indicators = {
        bbDeviation: analyzeIndicator('布林带偏离度', trades, candleData, (trade, candle) => {
            if (!candle?.bb?.middle || !candle?.bb?.upper || !candle?.bb?.lower) return null;
            return ((trade.entry.price - candle.bb.middle) / (candle.bb.upper - candle.bb.lower)) * 100;
        }),
        bbWidth: analyzeIndicator('布林带宽度', trades, candleData, (trade, candle) => {
            if (!candle?.bb?.middle || !candle?.bb?.upper || !candle?.bb?.lower) return null;
            return ((candle.bb.upper - candle.bb.lower) / candle.bb.middle) * 100;
        }),
        priceToLower: analyzeIndicator('价格距下轨', trades, candleData, (trade, candle) => {
            if (!candle?.bb?.lower) return null;
            return ((trade.entry.price - candle.bb.lower) / candle.bb.lower) * 100;
        }),
        volatility: analyzeIndicator('波动率', trades, candleData, (trade, candle) => {
            if (!candle?.bb?.middle || !candle?.bb?.standardDeviation) return null;
            return (candle.bb.standardDeviation / candle.bb.middle) * 100;
        })
    };

    // 计算指标权重
    const weights = calculateIndicatorWeights(indicators);

    // 生成交易规则
    const tradingRules = generateTradingRules(indicators, weights);

    return {
        indicators,
        weights,
        tradingRules,
        stats: {
            totalTrades: trades.length,
            profitTrades: profitTrades.length,
            lossTrades: lossTrades.length,
            winRate: (profitTrades.length / trades.length) * 100
        }
    };
}

// 分析单个指标
function analyzeIndicator(name, trades, candleData, valueCalculator) {
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    function getTradeValues(tradeList) {
        return tradeList.map(trade => {
            const candle = candleData.find(c => c.timestamp === trade.entry.timestamp);
            if (!candle) return null;
            return valueCalculator(trade, candle);
        }).filter(v => v !== null && !isNaN(v));
    }

    const profitValues = getTradeValues(profitTrades);
    const lossValues = getTradeValues(lossTrades);

    const profitStats = calculateStats(profitValues);
    const lossStats = calculateStats(lossValues);

    return {
        name,
        profitStats,
        lossStats,
        separation: calculateSeparation(profitStats, lossStats),
        validSamplesCount: {
            profit: profitValues.length,
            loss: lossValues.length
        }
    };
}

// 计算统计数据
function calculateStats(values) {
    if (!values.length) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, count: 0 };

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const sortedValues = [...values].sort((a, b) => a - b);
    const median = sortedValues[Math.floor(values.length / 2)];
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
        mean,
        median,
        stdDev,
        min: sortedValues[0],
        max: sortedValues[sortedValues.length - 1],
        count: values.length
    };
}

// 计算指标区分度
function calculateSeparation(profitStats, lossStats) {
    if (profitStats.count < 5 || lossStats.count < 5) return 0;
    
    const meanDiff = Math.abs(profitStats.mean - lossStats.mean);
    const avgStdDev = (profitStats.stdDev + lossStats.stdDev) / 2;
    
    return avgStdDev === 0 ? 0 : meanDiff / avgStdDev;
}

// 计算指标权重
function calculateIndicatorWeights(indicators) {
    const weights = {};
    let totalSeparation = 0;

    Object.entries(indicators).forEach(([key, indicator]) => {
        if (indicator.validSamplesCount.profit >= 5 && indicator.validSamplesCount.loss >= 5) {
            totalSeparation += indicator.separation;
        }
    });

    Object.entries(indicators).forEach(([key, indicator]) => {
        if (indicator.validSamplesCount.profit >= 5 && indicator.validSamplesCount.loss >= 5) {
            weights[key] = totalSeparation > 0 ? indicator.separation / totalSeparation : 0;
        } else {
            weights[key] = 0;
        }
    });

    return weights;
}

// 生成交易规则
function generateTradingRules(indicators, weights) {
    const rules = [];

    Object.entries(indicators).forEach(([key, indicator]) => {
        const { profitStats, lossStats, validSamplesCount } = indicator;
        const weight = weights[key];

        if (validSamplesCount.profit >= 5 && validSamplesCount.loss >= 5) {
            const idealRange = {
                min: profitStats.mean - profitStats.stdDev,
                max: profitStats.mean + profitStats.stdDev
            };

            const dangerRange = {
                min: lossStats.mean - lossStats.stdDev,
                max: lossStats.mean + lossStats.stdDev
            };

            rules.push({
                indicator: indicator.name,
                weight: weight * 100,
                idealRange,
                dangerRange,
                profitMean: profitStats.mean,
                lossMean: lossStats.mean,
                significance: indicator.separation,
                sampleSize: validSamplesCount
            });
        }
    });

    return rules.sort((a, b) => b.weight - a.weight);
}

// 主函数
async function main() {
    try {
        const fetcher = new DataFetcher();
        const startTime = moment().subtract(30, 'days').valueOf();
        const symbol = 'SOL/USDT:USDT';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // Process and calculate indicators
        console.log('计算技术指标...');
        const candleData = rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            bb: calculateBollingerBands([candle])[0]
        }));

        // Run backtest
        console.log('执行回测...');
        const bbands = candleData.map(candle => candle.bb);
        const results = mainScript.backtest(candleData, bbands);

        // 分析交易模式
        console.log('分析交易模式...');
        const analysis = analyzeTradingPatterns(results.trades, candleData);

        // 保存结果
        const resultsData = {
            candleData: {
                '15m': candleData
            },
            trades: results.trades,
            metrics: results.metrics,
            analysis: {
                tradingRules: analysis.tradingRules,
                stats: analysis.stats,
                indicators: analysis.indicators,
                weights: analysis.weights
            }
        };

        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));

        // 输出分析结果
        console.log('\n=== 回测结果 ===');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT`);
        console.log(`收益率: ${results.metrics.profitPercent.toFixed(2)}%`);

        console.log('\n=== 交易模式分析 ===');
        analysis.tradingRules.forEach(rule => {
            console.log(`\n${rule.indicator}:`);
            console.log(`权重: ${rule.weight.toFixed(2)}%`);
            console.log(`最佳范围: ${rule.idealRange.min.toFixed(2)} - ${rule.idealRange.max.toFixed(2)}`);
            console.log(`避免范围: ${rule.dangerRange.min.toFixed(2)} - ${rule.dangerRange.max.toFixed(2)}`);
            console.log(`样本数: 盈利=${rule.sampleSize.profit}, 亏损=${rule.sampleSize.loss}`);
        });

        console.log(`\n数据已保存至: ${resultsPath}`);

    } catch (error) {
        console.error('执行错误:', error);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    analyzeTradingPatterns,
    calculateBollingerBands
};
