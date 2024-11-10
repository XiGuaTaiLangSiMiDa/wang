const fs = require('fs');
const path = require('path');
const DataFetcher = require('./fetcher');
const moment = require('moment');
const patternAnalyzer = require('./analyze_trade_patterns.js');

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

// 智能交易策略
function smartBacktest(candleData, bbands) {
    const initialCapital = 2000; // 2000 USDT
    const leverage = 100;
    const stopLossPercent = 0.5; // 50% of position size
    const takeProfitPercent = 1.0; // 100% of position size
    
    let capital = initialCapital;
    let position = null;
    const trades = [];
    let tradeCount = 0;
    let consecutiveLosses = 0;
    const maxConsecutiveLosses = 3;
    
    // 创建评分系统
    const scoringSystem = patternAnalyzer.createScoringSystem();
    
    console.log('\n开始回测分析...');
    console.log(`总K线数量: ${candleData.length}`);
    
    // 遍历K线数据
    for (let i = 20; i < candleData.length; i++) {
        const candle = candleData[i];
        const bb = bbands[i];
        
        // 跳过无效的布林带数据
        if (!bb || !bb.lower) continue;
        
        // 检查止损或止盈
        if (position) {
            const pnlPercent = (candle.close - position.entryPrice) / position.entryPrice;
            const positionSize = position.positionSize;
            
            // 检查止损
            if (pnlPercent <= -stopLossPercent/leverage) {
                const loss = positionSize * leverage * pnlPercent;
                capital += loss;
                consecutiveLosses++;
                tradeCount++;
                trades.push({
                    entry: position,
                    exit: {
                        price: candle.close,
                        timestamp: candle.timestamp,
                        reason: 'Stop Loss',
                        indicators: { bb }
                    },
                    profit: loss,
                    remainingCapital: capital,
                    tradeNumber: tradeCount
                });
                console.log(`\n交易 #${tradeCount} 止损平仓:`);
                console.log(`开仓价: ${position.entryPrice}, 平仓价: ${candle.close}`);
                console.log(`损失: ${loss.toFixed(2)} USDT`);
                position = null;
                continue;
            }
            
            // 检查止盈
            if (pnlPercent >= takeProfitPercent/leverage) {
                const profit = positionSize * leverage * pnlPercent;
                capital += profit;
                consecutiveLosses = 0;
                tradeCount++;
                trades.push({
                    entry: position,
                    exit: {
                        price: candle.close,
                        timestamp: candle.timestamp,
                        reason: 'Take Profit',
                        indicators: { bb }
                    },
                    profit: profit,
                    remainingCapital: capital,
                    tradeNumber: tradeCount
                });
                console.log(`\n交易 #${tradeCount} 止盈平仓:`);
                console.log(`开仓价: ${position.entryPrice}, 平仓价: ${candle.close}`);
                console.log(`盈利: ${profit.toFixed(2)} USDT`);
                position = null;
                continue;
            }
        }
        
        // 检查开仓条件
        if (!position && consecutiveLosses < maxConsecutiveLosses) {
            // 获取历史K线用于分析
            const prevCandles = candleData.slice(Math.max(0, i - 10), i);
            
            // 计算开仓得分
            const score = scoringSystem.calculateScore(candle, prevCandles);
            
            // 分析布林带指标
            const bbAnalysis = patternAnalyzer.analyzeBollingerBands(candle, bb);
            
            // 计算平均成交量
            const avgVolume = prevCandles.reduce((sum, c) => sum + c.volume, 0) / prevCandles.length;
            
            // 检查是否满足开仓条件
            const conditions = {
                score: score >= 60, // 降低评分要求
                nearLower: bbAnalysis?.isNearLower,
                notSqueeze: bbAnalysis && !bbAnalysis.isSqueeze,
                volumeOK: candle.volume > avgVolume * 0.8 // 降低成交量要求
            };

            // 记录分析结果
            if (i % 20 === 0) {
                console.log(`\nK线 ${i} 分析结果:`);
                console.log(`评分: ${score}`);
                console.log(`布林带位置: ${bbAnalysis?.position?.toFixed(2)}`);
                console.log(`成交量比: ${(candle.volume / avgVolume).toFixed(2)}`);
                console.log('开仓条件:', conditions);
            }

            // 开仓条件：评分达标且至少满足两个其他条件
            const otherConditions = [conditions.nearLower, conditions.notSqueeze, conditions.volumeOK];
            const metConditionsCount = otherConditions.filter(c => c).length;
            const canOpen = conditions.score && metConditionsCount >= 2;

            if (canOpen) {
                const positionSize = capital;
                position = {
                    price: candle.close,
                    timestamp: candle.timestamp,
                    bbLower: bb.lower,
                    entryPrice: candle.close,
                    lowPrice: candle.low,
                    positionSize: positionSize,
                    indicators: { bb },
                    score: score,
                    analysis: bbAnalysis
                };
                
                console.log(`\n新开仓 (K线 ${i}):`);
                console.log(`开仓价: ${position.entryPrice}`);
                console.log(`评分: ${score}`);
                console.log(`布林带位置: ${bbAnalysis.position.toFixed(2)}%`);
            }
        }
        
        // 检查资金是否耗尽
        if (capital <= 0) {
            console.log('\n资金耗尽，停止交易');
            break;
        }
    }
    
    // 计算统计数据
    let totalProfit = 0;
    let winCount = 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentDrawdown = 0;
    
    trades.forEach(trade => {
        totalProfit += trade.profit;
        if (trade.profit > 0) winCount++;
        
        const currentCapital = trade.remainingCapital;
        if (currentCapital > peakCapital) {
            peakCapital = currentCapital;
            currentDrawdown = 0;
        } else {
            currentDrawdown = (peakCapital - currentCapital) / peakCapital * 100;
            if (currentDrawdown > maxDrawdown) {
                maxDrawdown = currentDrawdown;
            }
        }
    });
    
    return {
        trades,
        metrics: {
            initialCapital,
            finalCapital: capital,
            totalTrades: trades.length,
            winRate: trades.length > 0 ? (winCount / trades.length) * 100 : 0,
            totalProfit,
            profitPercent: (totalProfit / initialCapital) * 100,
            maxDrawdown
        }
    };
}

// 主函数
async function main() {
    try {
        const fetcher = new DataFetcher();
        const startTime = moment().subtract(30, 'days').valueOf();
        const symbol = 'SOL/USDT:USDT';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // 处理和计算指标
        console.log('计算技术指标...');
        const candleData = rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
        }));

        // 计算布林带
        const bbands = calculateBollingerBands(candleData);

        // 运行智能回测
        console.log('执行智能回测...');
        const results = smartBacktest(candleData, bbands);

        // 保存结果
        const resultsData = {
            candleData: {
                '15m': candleData.map((candle, i) => ({
                    ...candle,
                    bb: bbands[i]
                }))
            },
            trades: results.trades,
            metrics: results.metrics
        };

        const resultsPath = path.join(__dirname, 'visualization/smart_trading_results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));

        // 输出回测结果
        console.log('\n=== 智能回测结果 ===');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT`);
        console.log(`收益率: ${results.metrics.profitPercent.toFixed(2)}%`);
        console.log(`最大回撤: ${results.metrics.maxDrawdown.toFixed(2)}%`);
        console.log(`\n数据已保存至: ${resultsPath}`);

    } catch (error) {
        console.error('执行错误:', error);
    }
}

// 运行主函数
main().catch(console.error);
