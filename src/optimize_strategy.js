const fs = require('fs');
const path = require('path');

// 加载交易数据和分析结果
function loadData() {
    const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
    const analysisPath = path.join(__dirname, 'visualization/pattern_analysis.json');
    
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    
    return { results, analysis };
}

// 评估开仓条件
function evaluateEntryConditions(candle, rules) {
    let totalScore = 0;
    let totalWeight = 0;
    let conditions = [];

    rules.forEach(rule => {
        const weight = rule.weight / 100;
        let score = 0;
        let value = null;

        // 根据指标类型获取值
        switch (rule.indicator) {
            case '布林带偏离度':
                if (candle.bb?.middle && candle.bb?.upper && candle.bb?.lower) {
                    value = ((candle.close - candle.bb.middle) / (candle.bb.upper - candle.bb.lower)) * 100;
                }
                break;
            case '布林带宽度':
                if (candle.bb?.middle && candle.bb?.upper && candle.bb?.lower) {
                    value = ((candle.bb.upper - candle.bb.lower) / candle.bb.middle) * 100;
                }
                break;
            case '价格距下轨':
                if (candle.bb?.lower) {
                    value = ((candle.close - candle.bb.lower) / candle.bb.lower) * 100;
                }
                break;
            case '波动率':
                if (candle.bb?.middle && candle.bb?.standardDeviation) {
                    value = (candle.bb.standardDeviation / candle.bb.middle) * 100;
                }
                break;
        }

        if (value !== null) {
            // 计算得分
            if (value >= rule.idealRange.min && value <= rule.idealRange.max) {
                score = 100; // 在理想范围内
            } else if (value >= rule.dangerRange.min && value <= rule.dangerRange.max) {
                score = 0; // 在危险范围内
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
            totalWeight += weight;

            conditions.push({
                indicator: rule.indicator,
                value: value,
                score: score,
                weight: weight,
                status: score >= 70 ? '良好' : score >= 40 ? '一般' : '不佳'
            });
        }
    });

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    return {
        score: finalScore,
        conditions,
        recommendation: finalScore >= 70 ? '建议开仓' : '不建议开仓'
    };
}

// 优化回测结果
function optimizeBacktest(results, analysis) {
    const { trades, candleData } = results;
    const rules = analysis.tradingRules.filter(rule => rule.weight >= 15); // 只使用权重大于15%的规则

    const optimizedTrades = [];
    let totalOriginalTrades = 0;
    let totalOptimizedTrades = 0;
    let originalProfit = 0;
    let optimizedProfit = 0;

    trades.forEach(trade => {
        totalOriginalTrades++;
        originalProfit += trade.profit;

        // 获取开仓时的K线数据
        const entryCandle = candleData['15m'].find(c => c.timestamp === trade.entry.timestamp);
        if (!entryCandle) return;

        // 评估开仓条件
        const evaluation = evaluateEntryConditions(entryCandle, rules);

        // 只保留评分达标的交易
        if (evaluation.score >= 70) {
            optimizedTrades.push({
                ...trade,
                evaluation
            });
            totalOptimizedTrades++;
            optimizedProfit += trade.profit;
        }
    });

    // 计算优化效果
    const optimization = {
        originalStats: {
            totalTrades: totalOriginalTrades,
            totalProfit: originalProfit,
            profitPerTrade: originalProfit / totalOriginalTrades
        },
        optimizedStats: {
            totalTrades: totalOptimizedTrades,
            totalProfit: optimizedProfit,
            profitPerTrade: optimizedProfit / totalOptimizedTrades
        },
        improvement: {
            tradeReduction: ((totalOriginalTrades - totalOptimizedTrades) / totalOriginalTrades * 100),
            profitPerTradeImprovement: (
                (optimizedProfit / totalOptimizedTrades) / (originalProfit / totalOriginalTrades) - 1
            ) * 100
        }
    };

    return {
        optimization,
        optimizedTrades
    };
}

// 生成优化报告
function generateReport(optimization, optimizedTrades) {
    console.log('\n=== 策略优化报告 ===');
    
    console.log('\n原始策略统计:');
    console.log(`总交易次数: ${optimization.originalStats.totalTrades}`);
    console.log(`总收益: ${optimization.originalStats.totalProfit.toFixed(2)} USDT`);
    console.log(`平均每笔收益: ${optimization.originalStats.profitPerTrade.toFixed(2)} USDT`);
    
    console.log('\n优化后策略统计:');
    console.log(`总交易次数: ${optimization.optimizedStats.totalTrades}`);
    console.log(`总收益: ${optimization.optimizedStats.totalProfit.toFixed(2)} USDT`);
    console.log(`平均每笔收益: ${optimization.optimizedStats.profitPerTrade.toFixed(2)} USDT`);
    
    console.log('\n优化效果:');
    console.log(`减少无效交易: ${optimization.improvement.tradeReduction.toFixed(2)}%`);
    console.log(`提升每笔收益: ${optimization.improvement.profitPerTradeImprovement.toFixed(2)}%`);

    // 保存优化结果
    const optimizationPath = path.join(__dirname, 'visualization/strategy_optimization.json');
    fs.writeFileSync(optimizationPath, JSON.stringify({
        optimization,
        trades: optimizedTrades
    }, null, 2));

    console.log(`\n优化结果已保存至: ${optimizationPath}`);
    
    // 输出开仓建议
    console.log('\n=== 优化后开仓建议 ===');
    console.log('1. 开仓条件 (所有条件都必须满足):');
    console.log('- 综合评分必须大于等于70分');
    console.log('- 布林带指标必须在理想范围内');
    console.log('- 避免在高波动率期间开仓');
    
    console.log('\n2. 止损设置:');
    console.log('- 维持50%本金止损');
    console.log('- 当价格接近布林带上轨时考虑提前止盈');
    
    console.log('\n3. 建议交易频率:');
    console.log('- 避免连续开仓');
    console.log('- 每次开仓后等待至少3根K线确认趋势');
}

// 主函数
async function main() {
    try {
        console.log('加载数据...');
        const { results, analysis } = loadData();

        console.log('优化策略...');
        const { optimization, optimizedTrades } = optimizeBacktest(results, analysis);

        console.log('生成报告...');
        generateReport(optimization, optimizedTrades);

    } catch (error) {
        console.error('优化错误:', error);
    }
}

// 运行优化
main().catch(console.error);
