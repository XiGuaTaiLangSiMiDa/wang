const fs = require('fs');
const path = require('path');

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
        isSqueeze: bandwidth < 5
    };
}

// 评分系统
function createScoringSystem() {
    return {
        calculateScore: (candle, prevCandles) => {
            let totalScore = 0;
            
            // 分析各项指标
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

// 导出函数
module.exports = {
    analyzeCandlePattern,
    analyzeTrendStrength,
    analyzeVolumePattern,
    analyzeBollingerBands,
    createScoringSystem
};
