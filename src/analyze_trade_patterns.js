const fs = require('fs');
const path = require('path');

// 读取交易数据
function loadTradeData() {
    try {
        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        return {
            trades: data.trades,
            candleData: data.candleData['15m']
        };
    } catch (error) {
        console.error('读取数据失败:', error.message);
        process.exit(1);
    }
}

// 分析交易模式
function analyzeTradingPatterns(trades, candleData) {
    // 分离盈利和亏损交易
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    console.log('\n=== 交易统计 ===');
    console.log(`总交易数: ${trades.length}`);
    console.log(`盈利交易: ${profitTrades.length}`);
    console.log(`亏损交易: ${lossTrades.length}`);
    console.log(`胜率: ${((profitTrades.length / trades.length) * 100).toFixed(2)}%`);

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
        }),
        volumeChange: analyzeIndicator('成交量变化', trades, candleData, (trade, candle, prevCandle) => {
            if (!candle?.volume || !prevCandle?.volume) return null;
            return ((candle.volume - prevCandle.volume) / prevCandle.volume) * 100;
        })
    };

    // 计算指标权重
    const weights = calculateIndicatorWeights(indicators);

    // 生成交易规则
    const tradingRules = generateTradingRules(indicators, weights);

    return {
        indicators,
        weights,
        tradingRules
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
            const prevCandle = candleData.find(c => c.timestamp === trade.entry.timestamp - 900000); // 15分钟前
            return valueCalculator(trade, candle, prevCandle);
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
    console.log('开始分析交易模式...');
    
    // 加载数据
    const { trades, candleData } = loadTradeData();
    
    // 分析交易模式
    const analysis = analyzeTradingPatterns(trades, candleData);
    
    // 输出分析结果
    console.log('\n=== 指标分析结果 ===');
    analysis.tradingRules.forEach(rule => {
        console.log(`\n${rule.indicator}:`);
        console.log(`权重: ${rule.weight.toFixed(2)}%`);
        console.log(`区分度: ${rule.significance.toFixed(2)}`);
        console.log(`样本数量: 盈利=${rule.sampleSize.profit}, 亏损=${rule.sampleSize.loss}`);
        console.log('理想开单区间:', {
            min: rule.idealRange.min.toFixed(2),
            max: rule.idealRange.max.toFixed(2)
        });
        console.log('避免开单区间:', {
            min: rule.dangerRange.min.toFixed(2),
            max: rule.dangerRange.max.toFixed(2)
        });
        console.log(`盈利均值: ${rule.profitMean.toFixed(2)}`);
        console.log(`亏损均值: ${rule.lossMean.toFixed(2)}`);
    });

    // 输出开单建议
    console.log('\n=== 开单建议 ===');
    const significantRules = analysis.tradingRules.filter(rule => rule.weight >= 15);
    
    if (significantRules.length > 0) {
        console.log('\n最佳开单条件组合:');
        significantRules.forEach(rule => {
            console.log(`\n${rule.indicator} (权重: ${rule.weight.toFixed(2)}%):`);
            console.log(`1. 指标值应在 ${rule.idealRange.min.toFixed(2)} 到 ${rule.idealRange.max.toFixed(2)} 之间`);
            console.log(`2. 避免在 ${rule.dangerRange.min.toFixed(2)} 到 ${rule.dangerRange.max.toFixed(2)} 之间开单`);
            console.log(`3. 区分度: ${rule.significance.toFixed(2)}`);
            console.log(`4. 样本数据: 盈利=${rule.sampleSize.profit}个, 亏损=${rule.sampleSize.loss}个`);
        });

        console.log('\n建议开单评分系统:');
        console.log('1. 计算各指标得分 (0-100分):');
        significantRules.forEach(rule => {
            console.log(`   - ${rule.indicator}: `);
            console.log(`     最佳范围 (100分): ${rule.idealRange.min.toFixed(2)} - ${rule.idealRange.max.toFixed(2)}`);
            console.log(`     危险范围 (0分): ${rule.dangerRange.min.toFixed(2)} - ${rule.dangerRange.max.toFixed(2)}`);
            console.log(`     权重: ${rule.weight.toFixed(2)}%`);
        });
        console.log('2. 综合得分 = 各指标得分 * 权重之和');
        console.log('3. 建议开单最低得分: 70分');
    } else {
        console.log('没有发现显著的交易规律，建议收集更多数据后重新分析');
    }

    // 保存分析结果
    const analysisPath = path.join(__dirname, 'visualization/pattern_analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify({
        tradingRules: analysis.tradingRules,
        recommendedScore: 70,
        analysis: {
            indicators: analysis.indicators,
            weights: analysis.weights
        }
    }, null, 2));

    console.log(`\n详细分析结果已保存至: ${analysisPath}`);
}

main().catch(console.error);
