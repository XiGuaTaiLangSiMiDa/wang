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

// 分析成交量特征
function analyzeVolumePattern(candle, prevCandles) {
    if (!prevCandles || prevCandles.length < 3) return null;

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

// 创建评分系统
function createScoringSystem() {
    return {
        calculateScore: (candle, prevCandles) => {
            if (!candle || !prevCandles || prevCandles.length < 3) return 0;

            let totalScore = 0;

            // 分析K线形态
            const candlePattern = analyzeCandlePattern(candle, prevCandles);
            if (candlePattern) {
                if (candlePattern.hasLongLowerShadow) totalScore += 15;
                if (candlePattern.isBullish) totalScore += 10;
            }

            // 分析布林带
            const bbPattern = analyzeBollingerBands(candle, candle.bb);
            if (bbPattern) {
                if (bbPattern.isNearLower && !bbPattern.isSqueeze) totalScore += 25;
                if (bbPattern.isWithinBands) totalScore += 10;
            }

            // 分析成交量
            const volumePattern = analyzeVolumePattern(candle, prevCandles);
            if (volumePattern) {
                if (volumePattern.isHighVolume) totalScore += 10;
                if (volumePattern.volumeTrend === 'increasing') totalScore += 10;
            }

            // 分析趋势
            const priceChange = ((candle.close - prevCandles[0].close) / prevCandles[0].close) * 100;
            if (priceChange > -5) totalScore += 10; // 下跌趋势减缓
            if (bbPattern && bbPattern.position < 30) totalScore += 10; // 价格在低位

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
