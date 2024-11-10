const fs = require('fs');
const path = require('path');

// 分析K线形态
function analyzeCandlePattern(candle, prevCandles) {
    if (!prevCandles || prevCandles.length < 3) return null;

    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const avgBodySize = prevCandles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / prevCandles.length;

    // 计算趋势
    const trend = calculateTrend(prevCandles);

    return {
        isLongBody: bodySize > avgBodySize * 1.5,
        isShortBody: bodySize < avgBodySize * 0.5,
        hasLongLowerShadow: lowerShadow > bodySize * 1.5,
        hasLongUpperShadow: upperShadow > bodySize * 2,
        isBullish: candle.close > candle.open,
        isBearish: candle.close < candle.open,
        trend
    };
}

// 计算趋势
function calculateTrend(candles) {
    if (candles.length < 5) return null;

    const closes = candles.map(c => c.close);
    const ma5 = calculateMA(closes, 5);
    const ma10 = calculateMA(closes, Math.min(10, candles.length));

    // 计算趋势强度
    const ma5Slope = (ma5[ma5.length - 1] - ma5[ma5.length - 2]) / ma5[ma5.length - 2] * 100;
    const priceChange = (closes[closes.length - 1] - closes[0]) / closes[0] * 100;

    return {
        direction: ma5Slope > 0 ? 'up' : 'down',
        strength: Math.abs(ma5Slope),
        ma5Slope,
        priceChange,
        isGoldenCross: ma5[ma5.length - 1] > ma10[ma10.length - 1] && 
                       ma5[ma5.length - 2] <= ma10[ma10.length - 2]
    };
}

// 计算移动平均线
function calculateMA(values, period) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
            result.push(null);
            continue;
        }
        const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
    }
    return result;
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
        isNearLower: position < 25, // 更严格的下轨判定
        isNearUpper: position > 75,
        isWithinBands: position >= 0 && position <= 100,
        isSqueeze: bandwidth < 3,
        priceToLower: (price - bb.lower) / bb.lower * 100,
        priceToMiddle: (price - bb.middle) / bb.middle * 100
    };
}

// 分析成交量特征
function analyzeVolumePattern(candle, prevCandles) {
    if (!prevCandles || prevCandles.length < 3) return null;

    const volumes = prevCandles.map(c => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeStdDev = Math.sqrt(volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length);

    // 计算成交量趋势
    const volumeTrend = calculateVolumeTrend(prevCandles);

    return {
        volumeRatio: candle.volume / avgVolume,
        isHighVolume: candle.volume > avgVolume * 1.2, // 提高放量要求
        isLowVolume: candle.volume < avgVolume * 0.5,
        volumeTrend,
        avgVolume,
        volumeStdDev
    };
}

// 计算成交量趋势
function calculateVolumeTrend(candles) {
    const volumes = candles.map(c => c.volume);
    const ma5Volume = calculateMA(volumes, 5);
    const lastMA5 = ma5Volume[ma5Volume.length - 1];
    const prevMA5 = ma5Volume[ma5Volume.length - 2];

    return {
        direction: lastMA5 > prevMA5 ? 'increasing' : 'decreasing',
        strength: Math.abs((lastMA5 - prevMA5) / prevMA5 * 100)
    };
}

// 创建评分系统
function createScoringSystem() {
    return {
        calculateScore: (candle, prevCandles) => {
            if (!candle || !prevCandles || prevCandles.length < 5) return 0;

            let totalScore = 0;
            let validIndicators = 0;

            // 分析K线形态 (35分)
            const candlePattern = analyzeCandlePattern(candle, prevCandles);
            if (candlePattern) {
                validIndicators++;
                let patternScore = 0;
                if (candlePattern.hasLongLowerShadow) patternScore += 15;
                if (candlePattern.isBullish) patternScore += 10;
                if (candlePattern.trend?.direction === 'up') patternScore += 10;
                totalScore += patternScore;
            }

            // 分析布林带 (35分)
            const bbPattern = analyzeBollingerBands(candle, candle.bb);
            if (bbPattern) {
                validIndicators++;
                let bbScore = 0;
                if (bbPattern.isNearLower) bbScore += 20;
                if (!bbPattern.isSqueeze) bbScore += 10;
                if (bbPattern.priceToLower > -1 && bbPattern.priceToLower < 1) bbScore += 5;
                totalScore += bbScore;
            }

            // 分析成交量 (30分)
            const volumePattern = analyzeVolumePattern(candle, prevCandles);
            if (volumePattern) {
                validIndicators++;
                let volumeScore = 0;
                if (volumePattern.isHighVolume) volumeScore += 15;
                if (volumePattern.volumeTrend.direction === 'increasing') volumeScore += 10;
                if (volumePattern.volumeTrend.strength > 10) volumeScore += 5;
                totalScore += volumeScore;
            }

            // 如果没有足够的有效指标，返回0分
            if (validIndicators < 3) return 0;

            return totalScore;
        }
    };
}

// 导出函数
module.exports = {
    analyzeCandlePattern,
    analyzeBollingerBands,
    analyzeVolumePattern,
    createScoringSystem
};
