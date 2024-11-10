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
        hasLongLowerShadow: lowerShadow > bodySize * 1.5, // 降低长下影要求
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
        isNearLower: position < 30, // 增加下轨判定范围
        isNearUpper: position > 70,
        isWithinBands: position >= 0 && position <= 100,
        isSqueeze: bandwidth < 3 // 降低带宽收缩判定标准
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
        isHighVolume: candle.volume > avgVolume * 0.8, // 降低放量要求
        isLowVolume: candle.volume < avgVolume * 0.5,
        volumeTrend: candle.volume > volumes[volumes.length - 1] ? 'increasing' : 'decreasing'
    };
}

// 创建评分系统
function createScoringSystem() {
    return {
        calculateScore: (candle, prevCandles) => {
            if (!candle || !prevCandles || prevCandles.length < 3) return 0;

            let totalScore = 0;

            // 分析K线形态 (35分)
            const candlePattern = analyzeCandlePattern(candle, prevCandles);
            if (candlePattern) {
                if (candlePattern.hasLongLowerShadow) totalScore += 20;
                if (candlePattern.isBullish) totalScore += 15;
            }

            // 分析布林带 (35分)
            const bbPattern = analyzeBollingerBands(candle, candle.bb);
            if (bbPattern) {
                if (bbPattern.isNearLower) totalScore += 20;
                if (!bbPattern.isSqueeze) totalScore += 15;
            }

            // 分析成交量 (30分)
            const volumePattern = analyzeVolumePattern(candle, prevCandles);
            if (volumePattern) {
                if (volumePattern.isHighVolume) totalScore += 15;
                if (volumePattern.volumeTrend === 'increasing') totalScore += 15;
            }

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
