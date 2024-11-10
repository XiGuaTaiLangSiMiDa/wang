const fs = require('fs');
const path = require('path');
const analyzer = require('./analyze_trade_patterns.js');

// 加载交易数据
function loadData() {
    try {
        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        return data;
    } catch (error) {
        console.error('读取数据失败:', error.message);
        process.exit(1);
    }
}

// 优化交易策略
function optimizeStrategy(trades, candleData) {
    const optimizedTrades = [];
    let totalProfit = 0;
    let consecutiveLosses = 0;
    const maxConsecutiveLosses = 3; // 最大连续亏损次数

    // 获取某个时间点之前的K线数据
    function getPreviousCandles(timestamp, count = 10) {
        const currentIndex = candleData.findIndex(c => c.timestamp === timestamp);
        if (currentIndex === -1) return [];
        return candleData.slice(Math.max(0, currentIndex - count), currentIndex);
    }

    // 评估开仓条件
    function evaluateEntry(trade, prevCandles) {
        const entryCandle = candleData.find(c => c.timestamp === trade.entry.timestamp);
        if (!entryCandle || !prevCandles.length) return { score: 0, reasons: [] };

        const reasons = [];
        let score = 0;

        // 分析K线形态
        const candlePattern = analyzer.analyzeCandlePattern(entryCandle, prevCandles);
        if (candlePattern) {
            if (candlePattern.hasLongLowerShadow) {
                score += 20;
                reasons.push('长下影线显示强支撑');
            }
            if (candlePattern.isBullish) {
                score += 15;
                reasons.push('K线收盘为阳线');
            }
        }

        // 分析布林带位置
        const bb = entryCandle.bb;
        if (bb && bb.lower) {
            const pricePosition = ((entryCandle.close - bb.lower) / (bb.upper - bb.lower)) * 100;
            if (pricePosition < 20) {
                score += 25;
                reasons.push('价格在布林带下轨附近');
            }
            const bandwidth = ((bb.upper - bb.lower) / bb.middle) * 100;
            if (bandwidth > 5) {
                score += 10;
                reasons.push('布林带未过度收缩');
            }
        }

        // 分析成交量
        const volumePattern = analyzer.analyzeVolumePattern(entryCandle, prevCandles);
        if (volumePattern) {
            if (volumePattern.isHighVolume) {
                score += 15;
                reasons.push('成交量放大');
            }
            if (volumePattern.volumeTrend === 'increasing') {
                score += 10;
                reasons.push('成交量趋势向上');
            }
        }

        // 分析趋势
        const trendStrength = analyzer.analyzeTrendStrength(prevCandles);
        if (trendStrength) {
            if (trendStrength.trendStrength > -5) {
                score += 5;
                reasons.push('下跌趋势减缓');
            }
        }

        return { score, reasons };
    }

    // 处理每笔交易
    trades.forEach((trade, index) => {
        const prevCandles = getPreviousCandles(trade.entry.timestamp);
        const evaluation = evaluateEntry(trade, prevCandles);

        // 根据评分和其他条件决定是否保留该交易
        const shouldKeepTrade = 
            evaluation.score >= 70 && // 评分达标
            (consecutiveLosses < maxConsecutiveLosses || trade.profit > 0) && // 控制连续亏损
            (index === 0 || trade.entry.timestamp - trades[index-1].exit.timestamp >= 900000); // 至少间隔15分钟

        if (shouldKeepTrade) {
            // 更新连续亏损计数
            if (trade.profit <= 0) {
                consecutiveLosses++;
            } else {
                consecutiveLosses = 0;
            }

            totalProfit += trade.profit;
            optimizedTrades.push({
                ...trade,
                evaluation: {
                    score: evaluation.score,
                    reasons: evaluation.reasons,
                    totalProfitAtPoint: totalProfit
                }
            });
        }
    });

    return optimizedTrades;
}

// 计算策略统计数据
function calculateStats(trades, optimizedTrades) {
    const originalStats = {
        totalTrades: trades.length,
        totalProfit: trades.reduce((sum, t) => sum + t.profit, 0),
        profitTrades: trades.filter(t => t.profit > 0).length,
        lossTrades: trades.filter(t => t.profit <= 0).length
    };
    originalStats.winRate = (originalStats.profitTrades / originalStats.totalTrades) * 100;
    originalStats.profitPerTrade = originalStats.totalProfit / originalStats.totalTrades;

    const optimizedStats = {
        totalTrades: optimizedTrades.length,
        totalProfit: optimizedTrades.reduce((sum, t) => sum + t.profit, 0),
        profitTrades: optimizedTrades.filter(t => t.profit > 0).length,
        lossTrades: optimizedTrades.filter(t => t.profit <= 0).length
    };
    optimizedStats.winRate = (optimizedStats.profitTrades / optimizedStats.totalTrades) * 100;
    optimizedStats.profitPerTrade = optimizedStats.totalProfit / optimizedStats.totalTrades;

    return {
        original: originalStats,
        optimized: optimizedStats,
        improvement: {
            tradeReduction: ((originalStats.totalTrades - optimizedStats.totalTrades) / originalStats.totalTrades) * 100,
            winRateImprovement: optimizedStats.winRate - originalStats.winRate,
            profitPerTradeImprovement: ((optimizedStats.profitPerTrade / originalStats.profitPerTrade) - 1) * 100
        }
    };
}

// 生成优化建议
function generateRecommendations(stats, optimizedTrades) {
    const recommendations = {
        entryRules: [
            '等待价格在布林带下轨附近企稳',
            '确认K线出现长下影线',
            '成交量需要配合价格反弹',
            '避免连续亏损超过3次',
            '每次交易之间至少间隔15分钟'
        ],
        riskManagement: [
            '设置固定止损位置，不超过本金的50%',
            '当价格接近布林带上轨时考虑止盈',
            '连续亏损后降低仓位或暂停交易',
            '避免在高波动期间开仓'
        ],
        timing: [
            '优先在布林带收缩后开仓',
            '等待明确的反转信号',
            '避免在重要新闻公告前开仓'
        ]
    };

    // 根据实际效果调整建议
    if (stats.improvement.winRateImprovement > 0) {
        recommendations.entryRules.push('保持当前的入场条件筛选标准');
    } else {
        recommendations.entryRules.push('提高入场评分阈值到75分以上');
    }

    return recommendations;
}

// 主函数
async function main() {
    try {
        console.log('加载交易数据...');
        const data = loadData();

        console.log('优化策略...');
        const optimizedTrades = optimizeStrategy(data.trades, data.candleData['15m']);

        console.log('计算统计数据...');
        const stats = calculateStats(data.trades, optimizedTrades);

        console.log('生成优化建议...');
        const recommendations = generateRecommendations(stats, optimizedTrades);

        // 输出分析结果
        console.log('\n=== 策略优化报告 ===');
        
        console.log('\n原始策略统计:');
        console.log(`总交易次数: ${stats.original.totalTrades}`);
        console.log(`总收益: ${stats.original.totalProfit.toFixed(2)} USDT`);
        console.log(`胜率: ${stats.original.winRate.toFixed(2)}%`);
        console.log(`平均每笔收益: ${stats.original.profitPerTrade.toFixed(2)} USDT`);
        
        console.log('\n优化后策略统计:');
        console.log(`总交易次数: ${stats.optimized.totalTrades}`);
        console.log(`总收益: ${stats.optimized.totalProfit.toFixed(2)} USDT`);
        console.log(`胜率: ${stats.optimized.winRate.toFixed(2)}%`);
        console.log(`平均每笔收益: ${stats.optimized.profitPerTrade.toFixed(2)} USDT`);
        
        console.log('\n优化效果:');
        console.log(`减少无效交易: ${stats.improvement.tradeReduction.toFixed(2)}%`);
        console.log(`胜率提升: ${stats.improvement.winRateImprovement.toFixed(2)}%`);
        console.log(`平均收益提升: ${stats.improvement.profitPerTradeImprovement.toFixed(2)}%`);

        // 保存优化结果
        const optimizationPath = path.join(__dirname, 'visualization/strategy_optimization.json');
        fs.writeFileSync(optimizationPath, JSON.stringify({
            stats,
            recommendations,
            trades: optimizedTrades
        }, null, 2));

        console.log(`\n优化结果已保存至: ${optimizationPath}`);

    } catch (error) {
        console.error('优化错误:', error);
    }
}

// 运行优化
main().catch(console.error);
