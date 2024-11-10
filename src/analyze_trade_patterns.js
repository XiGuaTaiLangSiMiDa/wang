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

// 分析K线形态
function analyzeCandlePattern(candle, prevCandles) {
    if (!prevCandles || prevCandles.length < 3) return null;

    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const avgBodySize = prevCandles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / prevCandles.length;

    return {
        isLongBody: bodySize > avgBodySize * 1.5,
        isShortBody: bodySize < avgBodySize * 0.5,
        hasLongLowerShadow: lowerShadow > bodySize * 2,
        hasLongUpperShadow: upperShadow > bodySize * 2,
        isBullish: candle.close > candle.open,
        isBearish: candle.close < candle.open
    };
}

// 分析趋势强度
function analyzeTrendStrength(candles, period = 10) {
    if (!candles || candles.length < period) return null;

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // 计算趋势强度指标
    const highestHigh = Math.max(...highs.slice(-period));
    const lowestLow = Math.min(...lows.slice(-period));
    const currentClose = closes[closes.length - 1];
    const startClose = closes[closes.length - period];

    return {
        trendStrength: ((currentClose - startClose) / startClose) * 100,
        priceRange: ((highestHigh - lowestLow) / lowestLow) * 100,
        relativePosition: (currentClose - lowestLow) / (highestHigh - lowestLow)
    };
}

// 分析成交量特征
function analyzeVolumePattern(candle, prevCandles, period = 10) {
    if (!prevCandles || prevCandles.length < period) return null;

    const volumes = prevCandles.map(c => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeStdDev = Math.sqrt(volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length);

    return {
        volumeRatio: candle.volume / avgVolume,
        isHighVolume: candle.volume > avgVolume + volumeStdDev,
        isLowVolume: candle.volume < avgVolume - volumeStdDev,
        volumeTrend: candle.volume > volumes[volumes.length - 1] ? 'increasing' : 'decreasing'
    };
}

// 分析布林带特征
function analyzeBollingerBands(candle, bb) {
    if (!bb || !bb.middle || !bb.upper || !bb.lower) return null;

    const price = candle.close;
    const bandwidth = ((bb.upper - bb.lower) / bb.middle) * 100;
    const position = ((price - bb.lower) / (bb.upper - bb.lower)) * 100;

    return {
        bandwidth,
        position,
        isNearLower: position < 20,
        isNearUpper: position > 80,
        isWithinBands: position >= 0 && position <= 100,
        isSqueeze: bandwidth < 5 // 带宽收窄
    };
}

// 分析交易模式
function analyzeTradingPatterns(trades, candleData) {
    // 分离盈利和亏损交易
    const profitTrades = trades.filter(trade => trade.profit > 0);
    const lossTrades = trades.filter(trade => trade.profit <= 0);

    // 分析每笔交易的特征
    const tradePatterns = trades.map(trade => {
        const entryCandle = candleData.find(c => c.timestamp === trade.entry.timestamp);
        if (!entryCandle) return null;

        const entryIndex = candleData.findIndex(c => c.timestamp === trade.entry.timestamp);
        const prevCandles = candleData.slice(Math.max(0, entryIndex - 10), entryIndex);

        const candlePattern = analyzeCandlePattern(entryCandle, prevCandles);
        const trendStrength = analyzeTrendStrength(prevCandles);
        const volumePattern = analyzeVolumePattern(entryCandle, prevCandles);
        const bbPattern = analyzeBollingerBands(entryCandle, entryCandle.bb);

        return {
            trade,
            patterns: {
                candle: candlePattern,
                trend: trendStrength,
                volume: volumePattern,
                bb: bbPattern
            },
            isProfit: trade.profit > 0
        };
    }).filter(p => p !== null);

    // 分析盈利交易的共同特征
    const profitPatterns = analyzeCommonPatterns(tradePatterns.filter(p => p.isProfit));
    const lossPatterns = analyzeCommonPatterns(tradePatterns.filter(p => !p.isProfit));

    // 生成交易规则
    const rules = generateImprovedRules(profitPatterns, lossPatterns);

    return {
        patterns: {
            profit: profitPatterns,
            loss: lossPatterns
        },
        rules,
        tradePatterns
    };
}

// 分析共同特征
function analyzeCommonPatterns(patterns) {
    if (!patterns.length) return null;

    // 统计各种特征的出现频率
    const stats = {
        candlePatterns: {
            longBody: 0,
            shortBody: 0,
            longLowerShadow: 0,
            longUpperShadow: 0,
            bullish: 0,
            bearish: 0
        },
        volumePatterns: {
            highVolume: 0,
            lowVolume: 0,
            increasing: 0,
            decreasing: 0
        },
        bbPatterns: {
            nearLower: 0,
            nearUpper: 0,
            withinBands: 0,
            squeeze: 0
        }
    };

    patterns.forEach(pattern => {
        // 统计K线形态
        if (pattern.patterns.candle) {
            if (pattern.patterns.candle.isLongBody) stats.candlePatterns.longBody++;
            if (pattern.patterns.candle.isShortBody) stats.candlePatterns.shortBody++;
            if (pattern.patterns.candle.hasLongLowerShadow) stats.candlePatterns.longLowerShadow++;
            if (pattern.patterns.candle.hasLongUpperShadow) stats.candlePatterns.longUpperShadow++;
            if (pattern.patterns.candle.isBullish) stats.candlePatterns.bullish++;
            if (pattern.patterns.candle.isBearish) stats.candlePatterns.bearish++;
        }

        // 统计成交量特征
        if (pattern.patterns.volume) {
            if (pattern.patterns.volume.isHighVolume) stats.volumePatterns.highVolume++;
            if (pattern.patterns.volume.isLowVolume) stats.volumePatterns.lowVolume++;
            if (pattern.patterns.volume.volumeTrend === 'increasing') stats.volumePatterns.increasing++;
            if (pattern.patterns.volume.volumeTrend === 'decreasing') stats.volumePatterns.decreasing++;
        }

        // 统计布林带特征
        if (pattern.patterns.bb) {
            if (pattern.patterns.bb.isNearLower) stats.bbPatterns.nearLower++;
            if (pattern.patterns.bb.isNearUpper) stats.bbPatterns.nearUpper++;
            if (pattern.patterns.bb.isWithinBands) stats.bbPatterns.withinBands++;
            if (pattern.patterns.bb.isSqueeze) stats.bbPatterns.squeeze++;
        }
    });

    // 计算百分比
    const total = patterns.length;
    return {
        candlePatterns: Object.entries(stats.candlePatterns).map(([key, value]) => ({
            pattern: key,
            frequency: (value / total) * 100
        })),
        volumePatterns: Object.entries(stats.volumePatterns).map(([key, value]) => ({
            pattern: key,
            frequency: (value / total) * 100
        })),
        bbPatterns: Object.entries(stats.bbPatterns).map(([key, value]) => ({
            pattern: key,
            frequency: (value / total) * 100
        }))
    };
}

// 生成改进的交易规则
function generateImprovedRules(profitPatterns, lossPatterns) {
    const rules = [];

    // 布林带规则
    rules.push({
        name: '布林带开仓规则',
        conditions: [
            '价格必须在布林带下轨附近（位置 < 20%）',
            '布林带不处于极度收缩状态（带宽 > 5%）',
            '避免在布林带上轨附近开仓（位置 > 80%）'
        ],
        weight: 35
    });

    // K线形态规则
    rules.push({
        name: 'K线形态规则',
        conditions: [
            '优先选择带有长下影线的K线',
            '避免在大阴线后立即开仓',
            '确认K线收盘价站稳布林带下轨'
        ],
        weight: 25
    });

    // 成交量规则
    rules.push({
        name: '成交量规则',
        conditions: [
            '成交量应高于前10根K线平均值',
            '避免在成交量持续萎缩时开仓',
            '成交量应支撑价格反弹'
        ],
        weight: 20
    });

    // 趋势规则
    rules.push({
        name: '趋势规则',
        conditions: [
            '避免在强势下跌趋势中开仓',
            '等待趋势出现企稳迹象',
            '关注支撑位的有效性'
        ],
        weight: 20
    });

    return rules;
}

// 创建评分系统
function createScoringSystem(patterns) {
    return {
        calculateScore: (candle, prevCandles) => {
            let totalScore = 0;
            const candlePattern = analyzeCandlePattern(candle, prevCandles);
            const trendStrength = analyzeTrendStrength(prevCandles);
            const volumePattern = analyzeVolumePattern(candle, prevCandles);
            const bbPattern = analyzeBollingerBands(candle, candle.bb);

            // 布林带得分 (35分)
            if (bbPattern) {
                if (bbPattern.isNearLower && !bbPattern.isSqueeze) totalScore += 25;
                if (bbPattern.isWithinBands) totalScore += 10;
            }

            // K线形态得分 (25分)
            if (candlePattern) {
                if (candlePattern.hasLongLowerShadow) totalScore += 15;
                if (candlePattern.isBullish) totalScore += 10;
            }

            // 成交量得分 (20分)
            if (volumePattern) {
                if (volumePattern.isHighVolume) totalScore += 10;
                if (volumePattern.volumeTrend === 'increasing') totalScore += 10;
            }

            // 趋势得分 (20分)
            if (trendStrength) {
                if (trendStrength.trendStrength > -5) totalScore += 10;
                if (trendStrength.relativePosition < 0.3) totalScore += 10;
            }

            return totalScore;
        }
    };
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

// 导出函数
module.exports = {
    analyzeCandlePattern,
    analyzeTrendStrength,
    analyzeVolumePattern,
    analyzeBollingerBands,
    analyzeTradingPatterns,
    analyzeCommonPatterns,
    generateImprovedRules,
    createScoringSystem
};
