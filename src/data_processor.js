const moment = require('moment');
const TechnicalIndicators = require('./indicators');

class DataProcessor {
    static prepareTrainingData(candleData) {
        const closes = candleData.map(c => c.close);
        const volumes = candleData.map(c => c.volume || 0);
        
        // Calculate technical indicators
        const bb = TechnicalIndicators.calculateBB(closes);
        const rsi = TechnicalIndicators.calculateRSI(closes);
        const macd = TechnicalIndicators.calculateMACD(closes);
        const volumeProfile = TechnicalIndicators.calculateVolumeProfile(candleData);
        const momentum = TechnicalIndicators.calculateMomentum(closes);

        const features = [];
        const labels = [];
        const profitPoints = [];

        // Look ahead period (4 candles = 1 hour for 15m data)
        const LOOK_AHEAD = 4;
        const TARGET_RETURN = 0.01; // 1% return target

        for (let i = 26; i < candleData.length - LOOK_AHEAD; i++) {
            // Skip if any indicator is null
            if (!bb[i] || !rsi[i] || !macd[i] || !volumeProfile[i] || !momentum[i]) {
                continue;
            }

            const currentPrice = closes[i];
            const priceChange = (currentPrice - closes[i-1]) / closes[i-1];
            const highLowRange = (candleData[i].high - candleData[i].low) / currentPrice;
            
            const futurePrice = Math.max(...closes.slice(i + 1, i + LOOK_AHEAD + 1));
            const maxReturn = (futurePrice - currentPrice) / currentPrice;
            
            const recentVolumes = volumes.slice(i-5, i);
            const avgVolume = TechnicalIndicators.average(recentVolumes);
            
            const feature = {
                priceChange,
                highLowRange,
                volumeRatio: volumes[i] / Math.max(...volumes.slice(i-10, i+1)),
                bbWidth: (bb[i].upper - bb[i].lower) / bb[i].middle,
                bbPosition: (currentPrice - bb[i].lower) / (bb[i].upper - bb[i].lower),
                rsi: rsi[i],
                rsiChange: rsi[i] - rsi[i-1],
                macdValue: macd[i].macd,
                macdSignal: macd[i].signal,
                macdHistogram: macd[i].histogram,
                volumeProfile: volumeProfile[i].buyRatio,
                volumeTrend: volumes[i] / avgVolume,
                momentum: momentum[i],
                hourOfDay: moment(candleData[i].timestamp).hour(),
                dayOfWeek: moment(candleData[i].timestamp).day()
            };

            const isProfit = maxReturn >= TARGET_RETURN;
            if (isProfit) {
                profitPoints.push(i);
            }

            features.push(feature);
            labels.push(isProfit ? 1 : 0);
        }

        return { features, labels, profitPoints };
    }

    static formatCandleData(candleData, profitPoints) {
        return candleData.map((candle, index) => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            isProfit: profitPoints.includes(index)
        }));
    }

    static calculateStatistics(labels) {
        const totalSamples = labels.length;
        const positiveSamples = labels.filter(l => l === 1).length;
        const baselineAccuracy = Math.max(positiveSamples, totalSamples - positiveSamples) / totalSamples;

        return {
            totalSamples,
            positiveSamples,
            baselineAccuracy,
            positiveRatio: (positiveSamples / totalSamples) * 100
        };
    }
}

module.exports = DataProcessor;
