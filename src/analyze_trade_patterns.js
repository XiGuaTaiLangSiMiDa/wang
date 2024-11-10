const fs = require('fs');
const path = require('path');

// 加载交易数据
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

// 计算布林带指标
function calculateBollingerBands(candle) {
    if (!candle.bb || !candle.bb.middle || !candle.bb.upper || !candle.bb.lower) return null;

    return {
        width: ((candle.bb.upper - candle.bb.lower) / candle.bb.middle) * 100,
        priceToLower: ((candle.close - candle.bb.lower) / candle.bb.lower) * 100,
        deviation: ((candle.close - candle.bb.middle) / (candle.bb.upper - candle.bb.lower)) * 100
    };
}

// 分析交易特征
function analyzeTrades(trades, candleData) {
    // 分离盈利和亏损交易
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    console.log('\n=== 交易统计 ===');
    console.log(`总交易数: ${trades.length}`);
    console.log(`盈利交易: ${profitTrades.length}`);
    console.log(`亏损交易: ${lossTrades.length}`);
    console.log(`胜率: ${((profitTrades.length / trades.length) * 100).toFixed(2)}%`);

    // 收集指标数据
    const profitIndicators = collectIndicators(profitTrades, candleData);
    const lossIndicators = collectIndicators(lossTrades, candleData);

    // 分析指标特征
    const analysis = analyzeIndicators(profitIndicators, lossIndicators);

    return analysis;
}

// 收集指标数据
function collectIndicators(trades, candleData) {
    const indicators = {
        bbWidth: [],
        priceToLower: [],
        deviation: []
    };

    trades.forEach(trade => {
        const entryCandle = candleData.find(c => c.timestamp === trade.entry.timestamp);
        if (!entryCandle) return;

        const bb = calculateBollingerBands(entryCandle);
        if (!bb) return;

        indicators.bbWidth.push(bb.width);
        indicators.priceToLower.push(bb.priceToLower);
        indicators.deviation.push(bb.deviation);
    });

    return indicators;
}

// 分析指标特征
function analyzeIndicators(profitIndicators, lossIndicators) {
    const indicatorNames = {
        bbWidth: '布林带宽度',
        priceToLower: '价格距下轨',
        deviation: '布林带偏离度'
    };

    const analysis = {};
    let totalSeparation = 0;

    // 分析每个指标
    Object.entries(indicatorNames).forEach(([key, name]) => {
        const profitStats = calculateStats(profitIndicators[key]);
        const lossStats = calculateStats(lossIndicators[key]);
        
        // 计算区分度
        const separation = calculateSeparation(profitStats, lossStats);
        totalSeparation += separation;

        // 计算不重叠的理想范围
        const ranges = calculateNonOverlappingRanges(profitStats, lossStats);

        analysis[key] = {
            name,
            profitStats,
            lossStats,
            separation,
            ranges,
            sampleSize: {
                profit: profitIndicators[key].length,
                loss: lossIndicators[key].length
            }
        };
    });

    // 计算权重
    Object.values(analysis).forEach(indicator => {
        indicator.weight = (indicator.separation / totalSeparation) * 100;
    });

    return analysis;
}

// 计算统计数据
function calculateStats(values) {
    if (!values || values.length === 0) {
        return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return {
        mean,
        median: sorted[Math.floor(values.length / 2)],
        stdDev: Math.sqrt(variance),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        percentile25: sorted[Math.floor(values.length * 0.25)],
        percentile75: sorted[Math.floor(values.length * 0.75)]
    };
}

// 计算区分度
function calculateSeparation(profitStats, lossStats) {
    const meanDiff = Math.abs(profitStats.mean - lossStats.mean);
    const avgStdDev = (profitStats.stdDev + lossStats.stdDev) / 2;
    return avgStdDev === 0 ? 0 : meanDiff / avgStdDev;
}

// 计算不重叠的理想范围
function calculateNonOverlappingRanges(profitStats, lossStats) {
    // 使用四分位数来定义范围，避免极端值的影响
    const profitRange = {
        min: profitStats.percentile25,
        max: profitStats.percentile75
    };

    const lossRange = {
        min: lossStats.percentile25,
        max: lossStats.percentile75
    };

    // 判断是否存在明显的区分区间
    if (profitRange.min > lossRange.max) {
        // 盈利区间在亏损区间上方
        return {
            ideal: { min: profitRange.min, max: profitRange.max },
            avoid: { min: lossRange.min, max: lossRange.max }
        };
    } else if (profitRange.max < lossRange.min) {
        // 盈利区间在亏损区间下方
        return {
            ideal: { min: profitRange.min, max: profitRange.max },
            avoid: { min: lossRange.min, max: lossRange.max }
        };
    } else {
        // 区间有重叠，寻找最佳分割点
        const midPoint = (profitStats.mean + lossStats.mean) / 2;
        if (profitStats.mean > lossStats.mean) {
            return {
                ideal: { min: midPoint, max: profitRange.max },
                avoid: { min: lossRange.min, max: midPoint }
            };
        } else {
            return {
                ideal: { min: profitRange.min, max: midPoint },
                avoid: { min: midPoint, max: lossRange.max }
            };
        }
    }
}

// 生成交易建议
function generateTradingRules(analysis) {
    const rules = [];
    const significantIndicators = Object.values(analysis)
        .filter(ind => ind.weight >= 15)
        .sort((a, b) => b.weight - a.weight);

    significantIndicators.forEach(indicator => {
        rules.push({
            name: indicator.name,
            weight: indicator.weight,
            idealRange: indicator.ranges.ideal,
            avoidRange: indicator.ranges.avoid,
            separation: indicator.separation,
            sampleSize: indicator.sampleSize
        });
    });

    return rules;
}

// 主函数
async function main() {
    try {
        console.log('开始分析交易模式...');
        const { trades, candleData } = loadTradeData();

        // 分析交易特征
        const analysis = analyzeTrades(trades, candleData);

        // 生成交易规则
        const rules = generateTradingRules(analysis);

        // 输出分析结果
        console.log('\n=== 指标分析结果 ===\n');
        rules.forEach(rule => {
            console.log(`${rule.name}:`);
            console.log(`权重: ${rule.weight.toFixed(2)}%`);
            console.log(`区分度: ${rule.separation.toFixed(2)}`);
            console.log(`样本数量: 盈利=${rule.sampleSize.profit}, 亏损=${rule.sampleSize.loss}`);
            console.log(`理想开单区间: ${JSON.stringify(rule.idealRange, null, 2)}`);
            console.log(`避免开单区间: ${JSON.stringify(rule.avoidRange, null, 2)}`);
            console.log('');
        });

        // 保存分析结果
        const analysisPath = path.join(__dirname, 'visualization/pattern_analysis.json');
        fs.writeFileSync(analysisPath, JSON.stringify({
            rules,
            scoringSystem: {
                maxScore: 100,
                threshold: 70,
                weights: rules.map(r => ({
                    name: r.name,
                    weight: r.weight
                }))
            }
        }, null, 2));

        console.log(`分析结果已保存至: ${analysisPath}`);

    } catch (error) {
        console.error('分析错误:', error);
    }
}

// 运行分析
main().catch(console.error);
