const fs = require('fs');
const path = require('path');

// 读取交易数据
function loadTradeData() {
    const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
    return JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
}

// 计算指标的权重分数
function calculateIndicatorScores(trades, candleData) {
    // 分离盈利和亏损交易
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    // 计算各指标的统计数据
    const indicators = {
        rsi: analyzeIndicator('RSI', 'rsi', profitTrades, lossTrades, candleData),
        macd: analyzeIndicator('MACD柱状图', 'macd.histogram', profitTrades, lossTrades, candleData),
        volume: analyzeIndicator('成交量比', 'volume.volumeRatio', profitTrades, lossTrades, candleData),
        pricePosition: analyzeIndicator('价格位置', 'pricePosition', profitTrades, lossTrades, candleData),
        volatility: analyzeIndicator('波动率', 'volatility', profitTrades, lossTrades, candleData)
    };

    // 计算指标权重
    calculateWeights(indicators);

    // 生成开单规则
    const rules = generateTradingRules(indicators);

    return {
        indicators,
        rules,
        scoringSystem: createScoringSystem(indicators)
    };
}

// 分析单个指标
function analyzeIndicator(name, path, profitTrades, lossTrades, candleData) {
    const profitValues = getIndicatorValues(profitTrades, path, candleData);
    const lossValues = getIndicatorValues(lossTrades, path, candleData);

    const profitStats = calculateStats(profitValues);
    const lossStats = calculateStats(lossValues);

    // 计算区分度
    const separation = Math.abs(profitStats.mean - lossStats.mean) / 
        ((profitStats.stdDev + lossStats.stdDev) / 2);

    return {
        name,
        profitStats,
        lossStats,
        separation,
        idealRange: calculateIdealRange(profitStats, lossStats)
    };
}

// 获取指标值
function getIndicatorValues(trades, path, candleData) {
    return trades.map(trade => {
        const candle = candleData.find(c => c.timestamp === trade.entry.time);
        if (!candle) return null;
        return path.split('.').reduce((obj, key) => obj?.[key], candle.indicators);
    }).filter(v => v !== null);
}

// 计算统计数据
function calculateStats(values) {
    if (values.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };

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
        max: sortedValues[sortedValues.length - 1]
    };
}

// 计算理想范围
function calculateIdealRange(profitStats, lossStats) {
    // 使用盈利交易的均值±1个标准差作为理想范围
    const lower = profitStats.mean - profitStats.stdDev;
    const upper = profitStats.mean + profitStats.stdDev;

    // 计算与亏损交易的重叠程度
    const lossLower = lossStats.mean - lossStats.stdDev;
    const lossUpper = lossStats.mean + lossStats.stdDev;

    return {
        min: lower,
        max: upper,
        overlapWithLoss: checkOverlap(lower, upper, lossLower, lossUpper)
    };
}

// 检查范围重叠
function checkOverlap(min1, max1, min2, max2) {
    return !(max1 < min2 || min1 > max2);
}

// 计算指标权重
function calculateWeights(indicators) {
    // 基于区分度计算权重
    const totalSeparation = Object.values(indicators)
        .reduce((sum, ind) => sum + ind.separation, 0);

    Object.values(indicators).forEach(indicator => {
        indicator.weight = indicator.separation / totalSeparation;
    });
}

// 生成交易规则
function generateTradingRules(indicators) {
    const rules = [];

    Object.values(indicators).forEach(indicator => {
        const { name, profitStats, lossStats, weight, idealRange } = indicator;

        // 计算开单条件
        const condition = {
            name,
            weight: weight * 100,
            ideal: {
                min: idealRange.min.toFixed(2),
                max: idealRange.max.toFixed(2)
            },
            avoid: {
                min: lossStats.mean - lossStats.stdDev,
                max: lossStats.mean + lossStats.stdDev
            },
            description: `
                理想范围: ${idealRange.min.toFixed(2)} - ${idealRange.max.toFixed(2)}
                避免范围: ${(lossStats.mean - lossStats.stdDev).toFixed(2)} - ${(lossStats.mean + lossStats.stdDev).toFixed(2)}
                权重: ${(weight * 100).toFixed(2)}%
            `.trim()
        };

        rules.push(condition);
    });

    return rules.sort((a, b) => b.weight - a.weight);
}

// 创建评分系统
function createScoringSystem(indicators) {
    return {
        maxScore: 100,
        weights: Object.values(indicators).map(ind => ({
            name: ind.name,
            weight: ind.weight,
            idealRange: ind.idealRange
        })),
        threshold: 60, // 建议开单的最低分数
        scoreFunction: (values) => {
            let totalScore = 0;
            
            Object.entries(values).forEach(([key, value]) => {
                const indicator = indicators[key];
                if (!indicator) return;

                const { idealRange, weight } = indicator;
                let score = 0;

                // 如果值在理想范围内，得分最高
                if (value >= idealRange.min && value <= idealRange.max) {
                    score = 100;
                } else {
                    // 根据距离理想范围的远近计算得分
                    const distanceToRange = Math.min(
                        Math.abs(value - idealRange.min),
                        Math.abs(value - idealRange.max)
                    );
                    const maxDistance = Math.max(
                        Math.abs(idealRange.max - idealRange.min),
                        indicator.profitStats.stdDev * 2
                    );
                    score = Math.max(0, 100 * (1 - distanceToRange / maxDistance));
                }

                totalScore += score * weight;
            });

            return totalScore;
        }
    };
}

// 主函数
async function main() {
    try {
        console.log('加载交易数据...');
        const data = loadTradeData();

        console.log('分析指标...');
        const analysis = calculateIndicatorScores(data.trades, data.candleData);

        console.log('\n=== 指标分析结果 ===\n');
        
        // 显示各指标的权重和规则
        analysis.rules.forEach(rule => {
            console.log(`${rule.name}:`);
            console.log(`权重: ${rule.weight.toFixed(2)}%`);
            console.log(`理想范围: ${rule.ideal.min} - ${rule.ideal.max}`);
            console.log(`避免范围: ${rule.avoid.min.toFixed(2)} - ${rule.avoid.max.toFixed(2)}`);
            console.log('---');
        });

        console.log('\n=== 开单评分系统 ===\n');
        console.log(`最高分: ${analysis.scoringSystem.maxScore}`);
        console.log(`建议开单最低分: ${analysis.scoringSystem.threshold}`);
        console.log('\n指标权重:');
        analysis.scoringSystem.weights.forEach(w => {
            console.log(`${w.name}: ${(w.weight * 100).toFixed(2)}%`);
        });

        // 保存分析结果
        const analysisPath = path.join(__dirname, 'visualization/indicator_analysis.json');
        fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
        console.log(`\n分析结果已保存至: ${analysisPath}`);

        // 示例：计算一些交易的得分
        console.log('\n=== 示例交易得分 ===\n');
        data.trades.slice(0, 5).forEach((trade, index) => {
            const entryCandle = data.candleData.find(c => c.timestamp === trade.entry.time);
            if (!entryCandle) return;

            const indicators = {
                rsi: entryCandle.indicators.rsi,
                macd: entryCandle.indicators.macd.histogram,
                volume: entryCandle.indicators.volume?.volumeRatio,
                pricePosition: entryCandle.indicators.pricePosition,
                volatility: entryCandle.indicators.volatility
            };

            const score = analysis.scoringSystem.scoreFunction(indicators);
            console.log(`交易 #${index + 1}:`);
            console.log(`得分: ${score.toFixed(2)}`);
            console.log(`实际结果: ${trade.profit > 0 ? '盈利' : '亏损'}`);
            console.log('指标值:', indicators);
            console.log('---');
        });

    } catch (error) {
        console.error('分析错误:', error);
    }
}

main();
