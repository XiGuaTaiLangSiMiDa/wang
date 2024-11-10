const fs = require('fs');
const path = require('path');

// 读取交易数据
function loadTradeData() {
    try {
        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        if (!fs.existsSync(resultsPath)) {
            throw new Error('交易数据文件不存在');
        }
        const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        // 验证数据结构
        if (!data.candleData || !data.candleData['15m'] || !Array.isArray(data.candleData['15m'])) {
            throw new Error('K线数据格式错误');
        }
        if (!data.trades || !Array.isArray(data.trades)) {
            throw new Error('交易数据格式错误');
        }

        // 确保每个K线数据都包含必要的指标
        const validCandleData = data.candleData['15m'].map(candle => {
            if (!candle.indicators) {
                candle.indicators = {};
            }
            // 确保所有指标都有默认值
            candle.indicators = {
                rsi: null,
                macd: { histogram: null },
                volume: { volumeRatio: null },
                pricePosition: null,
                volatility: null,
                ...candle.indicators
            };
            return candle;
        });

        return {
            trades: data.trades,
            candleData: validCandleData
        };
    } catch (error) {
        console.error('加载数据错误:', error.message);
        // 返回空数据结构
        return {
            trades: [],
            candleData: []
        };
    }
}

// 计算指标的权重分数
function calculateIndicatorScores(trades, candleData) {
    if (!trades.length || !candleData.length) {
        console.warn('没有足够的数据进行分析');
        return createEmptyAnalysis();
    }

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

function createEmptyAnalysis() {
    const emptyStats = {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0
    };

    const emptyIndicator = {
        name: '',
        profitStats: emptyStats,
        lossStats: emptyStats,
        separation: 0,
        idealRange: { min: 0, max: 0, overlapWithLoss: true },
        weight: 0
    };

    const indicators = {
        rsi: { ...emptyIndicator, name: 'RSI' },
        macd: { ...emptyIndicator, name: 'MACD柱状图' },
        volume: { ...emptyIndicator, name: '成交量比' },
        pricePosition: { ...emptyIndicator, name: '价格位置' },
        volatility: { ...emptyIndicator, name: '波动率' }
    };

    return {
        indicators,
        rules: generateTradingRules(indicators),
        scoringSystem: createScoringSystem(indicators)
    };
}

// 分析单个指标
function analyzeIndicator(name, path, profitTrades, lossTrades, candleData) {
    try {
        const profitValues = getIndicatorValues(profitTrades, path, candleData);
        const lossValues = getIndicatorValues(lossTrades, path, candleData);

        const profitStats = calculateStats(profitValues);
        const lossStats = calculateStats(lossValues);

        // 计算区分度
        const separation = Math.abs(profitStats.mean - lossStats.mean) / 
            ((profitStats.stdDev + lossStats.stdDev) / 2 || 1);

        return {
            name,
            profitStats,
            lossStats,
            separation: isNaN(separation) ? 0 : separation,
            idealRange: calculateIdealRange(profitStats, lossStats)
        };
    } catch (error) {
        console.error(`分析指标 ${name} 时出错:`, error.message);
        return createEmptyIndicator(name);
    }
}

function createEmptyIndicator(name) {
    return {
        name,
        profitStats: { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 },
        lossStats: { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 },
        separation: 0,
        idealRange: { min: 0, max: 0, overlapWithLoss: true }
    };
}

// 获取指标值
function getIndicatorValues(trades, path, candleData) {
    return trades.map(trade => {
        try {
            if (!trade.entry || !trade.entry.timestamp) return null;
            
            const candle = candleData.find(c => c.timestamp === trade.entry.timestamp);
            if (!candle || !candle.indicators) return null;
            
            const value = path.split('.').reduce((obj, key) => obj?.[key], candle.indicators);
            return typeof value === 'number' && !isNaN(value) ? value : null;
        } catch (error) {
            return null;
        }
    }).filter(v => v !== null);
}

// 计算统计数据
function calculateStats(values) {
    if (!values || values.length === 0) {
        return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }

    try {
        const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
        if (validValues.length === 0) {
            return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
        }

        const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
        const sortedValues = [...validValues].sort((a, b) => a - b);
        const median = sortedValues[Math.floor(validValues.length / 2)];
        const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
        const stdDev = Math.sqrt(variance);

        return {
            mean,
            median,
            stdDev,
            min: sortedValues[0],
            max: sortedValues[sortedValues.length - 1]
        };
    } catch (error) {
        console.error('计算统计数据时出错:', error.message);
        return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }
}

// 计算理想范围
function calculateIdealRange(profitStats, lossStats) {
    try {
        const lower = profitStats.mean - profitStats.stdDev;
        const upper = profitStats.mean + profitStats.stdDev;
        const lossLower = lossStats.mean - lossStats.stdDev;
        const lossUpper = lossStats.mean + lossStats.stdDev;

        return {
            min: lower,
            max: upper,
            overlapWithLoss: checkOverlap(lower, upper, lossLower, lossUpper)
        };
    } catch (error) {
        return { min: 0, max: 0, overlapWithLoss: true };
    }
}

// 检查范围重叠
function checkOverlap(min1, max1, min2, max2) {
    return !(max1 < min2 || min1 > max2);
}

// 计算指标权重
function calculateWeights(indicators) {
    try {
        const totalSeparation = Object.values(indicators)
            .reduce((sum, ind) => sum + (isNaN(ind.separation) ? 0 : ind.separation), 0);

        Object.values(indicators).forEach(indicator => {
            indicator.weight = totalSeparation > 0 ? 
                (isNaN(indicator.separation) ? 0 : indicator.separation) / totalSeparation : 0;
        });
    } catch (error) {
        console.error('计算权重时出错:', error.message);
        Object.values(indicators).forEach(indicator => {
            indicator.weight = 0;
        });
    }
}

// 生成交易规则
function generateTradingRules(indicators) {
    try {
        const rules = [];

        Object.values(indicators).forEach(indicator => {
            const { name, profitStats, lossStats, weight, idealRange } = indicator;

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
    } catch (error) {
        console.error('生成交易规则时出错:', error.message);
        return [];
    }
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
        threshold: 60,
        scoreFunction: (values) => {
            try {
                let totalScore = 0;
                
                Object.entries(values).forEach(([key, value]) => {
                    const indicator = indicators[key];
                    if (!indicator || isNaN(value)) return;

                    const { idealRange, weight } = indicator;
                    let score = 0;

                    if (value >= idealRange.min && value <= idealRange.max) {
                        score = 100;
                    } else {
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
            } catch (error) {
                console.error('计算得分时出错:', error.message);
                return 0;
            }
        }
    };
}

// 主函数
async function main() {
    try {
        console.log('加载交易数据...');
        const { trades, candleData } = loadTradeData();

        if (!trades.length || !candleData.length) {
            throw new Error('没有可用的交易数据');
        }

        console.log('分析指标...');
        const analysis = calculateIndicatorScores(trades, candleData);

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
        trades.slice(0, 5).forEach((trade, index) => {
            try {
                const entryCandle = candleData.find(c => c.timestamp === trade.entry.timestamp);
                if (!entryCandle || !entryCandle.indicators) {
                    console.log(`交易 #${index + 1}: 无法获取指标数据`);
                    return;
                }

                const indicators = {
                    rsi: entryCandle.indicators.rsi,
                    macd: entryCandle.indicators.macd?.histogram,
                    volume: entryCandle.indicators.volume?.volumeRatio,
                    pricePosition: entryCandle.indicators.pricePosition,
                    volatility: entryCandle.indicators.volatility
                };

                const score = analysis.scoringSystem.scoreFunction(indicators);
                console.log(`交易 #${index + 1}:`);
                console.log(`得分: ${score.toFixed(2)}`);
                console.log(`实际结果: ${trade.profit > 0 ? '盈利' : '亏损'}`);
                console.log('指标值:', Object.entries(indicators).reduce((acc, [key, value]) => {
                    acc[key] = typeof value === 'number' ? value.toFixed(4) : 'N/A';
                    return acc;
                }, {}));
                console.log('---');
            } catch (error) {
                console.error(`处理交易 #${index + 1} 时出错:`, error.message);
            }
        });

    } catch (error) {
        console.error('分析错误:', error.message);
    }
}

main();
