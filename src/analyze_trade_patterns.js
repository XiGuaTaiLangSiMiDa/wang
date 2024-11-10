const fs = require('fs');
const path = require('path');

// 读取交易数据
function loadTradeData() {
    try {
        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        console.log('Loading data from:', resultsPath);
        
        if (!fs.existsSync(resultsPath)) {
            throw new Error('交易数据文件不存在');
        }
        
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

// 将交易数据与K线数据匹配，添加指标信息
function enrichTradesWithIndicators(trades, candleData) {
    return trades.map(trade => {
        const entryCandle = candleData.find(c => c.timestamp === trade.entry.timestamp);
        const exitCandle = candleData.find(c => c.timestamp === trade.exit.timestamp);

        return {
            ...trade,
            entry: {
                ...trade.entry,
                indicators: entryCandle?.indicators || {}
            },
            exit: {
                ...trade.exit,
                indicators: exitCandle?.indicators || {}
            }
        };
    });
}

// 分析交易模式
function analyzeTradingPatterns(trades) {
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
        bb: analyzeIndicator('布林带位置', trades, trade => {
            const price = trade.entry.price;
            const bb = trade.entry.indicators?.bb;
            if (!bb || !bb.middle) return null;
            return ((price - bb.middle) / (bb.upper - bb.middle)) * 100;
        }),
        rsi: analyzeIndicator('RSI', trades, trade => trade.entry.indicators?.rsi),
        macd: analyzeIndicator('MACD柱状图', trades, trade => trade.entry.indicators?.macd?.histogram),
        volume: analyzeIndicator('成交量比', trades, trade => trade.entry.indicators?.volume?.volumeRatio),
        volatility: analyzeIndicator('波动率', trades, trade => {
            const bb = trade.entry.indicators?.bb;
            if (!bb || !bb.middle || !bb.standardDeviation) return null;
            return (bb.standardDeviation / bb.middle) * 100;
        })
    };

    // 计算指标权重
    const weights = calculateIndicatorWeights(indicators);

    // 生成开单建议
    const tradingRules = generateTradingRules(indicators, weights);

    return {
        indicators,
        weights,
        tradingRules
    };
}

// 分析单个指标
function analyzeIndicator(name, trades, valueGetter) {
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    const profitValues = profitTrades
        .map(valueGetter)
        .filter(v => v !== null && !isNaN(v));
    const lossValues = lossTrades
        .map(valueGetter)
        .filter(v => v !== null && !isNaN(v));

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

    // 计算总区分度
    Object.entries(indicators).forEach(([key, indicator]) => {
        if (indicator.validSamplesCount.profit >= 5 && indicator.validSamplesCount.loss >= 5) {
            totalSeparation += indicator.separation;
        }
    });

    // 计算权重
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

        // 只有当有足够的样本时才生成规则
        if (validSamplesCount.profit >= 5 && validSamplesCount.loss >= 5) {
            // 定义理想开单区间
            const idealRange = {
                min: profitStats.mean - profitStats.stdDev,
                max: profitStats.mean + profitStats.stdDev
            };

            // 定义危险区间
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
                sampleSize: {
                    profit: validSamplesCount.profit,
                    loss: validSamplesCount.loss
                }
            });
        }
    });

    return rules.sort((a, b) => b.weight - a.weight);
}

// 创建评分系统
function createScoringSystem(rules) {
    return {
        calculateScore: (indicators) => {
            let totalScore = 0;
            let totalWeight = 0;

            rules.forEach(rule => {
                const value = indicators[rule.indicator];
                if (value === undefined || value === null) return;

                const weight = rule.weight / 100;
                totalWeight += weight;

                // 计算得分
                let score = 0;
                if (value >= rule.idealRange.min && value <= rule.idealRange.max) {
                    // 在理想范围内
                    score = 100;
                } else if (value >= rule.dangerRange.min && value <= rule.dangerRange.max) {
                    // 在危险范围内
                    score = 0;
                } else {
                    // 根据距离理想范围的远近计算得分
                    const distanceToIdeal = Math.min(
                        Math.abs(value - rule.idealRange.min),
                        Math.abs(value - rule.idealRange.max)
                    );
                    const maxDistance = Math.abs(rule.idealRange.max - rule.idealRange.min);
                    score = Math.max(0, 100 * (1 - distanceToIdeal / maxDistance));
                }

                totalScore += score * weight;
            });

            return totalWeight > 0 ? totalScore / totalWeight : 0;
        }
    };
}

// 主函数
async function main() {
    console.log('开始分析交易模式...');
    
    // 加载数据
    const { trades, candleData } = loadTradeData();
    
    // 将交易数据与指标匹配
    const enrichedTrades = enrichTradesWithIndicators(trades, candleData);
    
    // 分析交易模式
    const analysis = analyzeTradingPatterns(enrichedTrades);
    
    // 创建评分系统
    const scoringSystem = createScoringSystem(analysis.tradingRules);

    // 输出分析结果
    console.log('\n=== 指标权重分析 ===');
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
    console.log('1. 建议开单条件（权重大于15%的指标）:');
    analysis.tradingRules.forEach(rule => {
        if (rule.weight >= 15) {
            console.log(`\n${rule.indicator}:`);
            console.log(`- 最佳范围: ${rule.idealRange.min.toFixed(2)} - ${rule.idealRange.max.toFixed(2)}`);
            console.log(`- 权重: ${rule.weight.toFixed(2)}%`);
            console.log(`- 区分度: ${rule.significance.toFixed(2)}`);
        }
    });

    console.log('\n2. 避免开单条件（权重大于15%的指标）:');
    analysis.tradingRules.forEach(rule => {
        if (rule.weight >= 15) {
            console.log(`\n${rule.indicator}:`);
            console.log(`- 避免范围: ${rule.dangerRange.min.toFixed(2)} - ${rule.dangerRange.max.toFixed(2)}`);
            console.log(`- 权重: ${rule.weight.toFixed(2)}%`);
        }
    });

    // 分析一些示例交易
    console.log('\n=== 示例交易分析 ===');
    enrichedTrades.slice(0, 5).forEach((trade, index) => {
        const indicators = {
            '布林带位置': ((trade.entry.price - trade.entry.indicators?.bb?.middle) / 
                (trade.entry.indicators?.bb?.upper - trade.entry.indicators?.bb?.middle)) * 100,
            'RSI': trade.entry.indicators?.rsi,
            'MACD柱状图': trade.entry.indicators?.macd?.histogram,
            '成交量比': trade.entry.indicators?.volume?.volumeRatio,
            '波动率': trade.entry.indicators?.bb ? 
                (trade.entry.indicators.bb.standardDeviation / trade.entry.indicators.bb.middle) * 100 : null
        };

        const score = scoringSystem.calculateScore(indicators);
        
        console.log(`\n交易 #${index + 1}:`);
        console.log(`得分: ${score.toFixed(2)}`);
        console.log(`结果: ${trade.profit > 0 ? '盈利' : '亏损'} (${trade.profit.toFixed(2)} USDT)`);
        console.log('开仓时指标值:');
        Object.entries(indicators).forEach(([name, value]) => {
            console.log(`- ${name}: ${value?.toFixed(4) || 'N/A'}`);
        });
    });

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

    console.log(`\n分析结果已保存至: ${analysisPath}`);
}

main().catch(console.error);
