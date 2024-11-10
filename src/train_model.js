const DataFetcher = require('./fetcher');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Technical Indicators Calculation
class TechnicalIndicators {
    // Bollinger Bands
    static calculateBB(closes, period = 20, multiplier = 2) {
        const bands = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < period - 1) {
                bands.push({ middle: null, upper: null, lower: null });
                continue;
            }
            
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += closes[i - j];
            }
            const sma = sum / period;
            
            let sumSquaredDiff = 0;
            for (let j = 0; j < period; j++) {
                sumSquaredDiff += Math.pow(closes[i - j] - sma, 2);
            }
            const std = Math.sqrt(sumSquaredDiff / period);
            
            bands.push({
                middle: sma,
                upper: sma + (multiplier * std),
                lower: sma - (multiplier * std)
            });
        }
        return bands;
    }

    // RSI
    static calculateRSI(closes, period = 14) {
        const rsi = [];
        let gains = 0;
        let losses = 0;

        // Initialize RSI
        for (let i = 0; i < closes.length; i++) {
            if (i < period) {
                rsi.push(null);
                if (i > 0) {
                    const diff = closes[i] - closes[i - 1];
                    if (diff >= 0) gains += diff;
                    else losses -= diff;
                }
                continue;
            }

            if (i === period) {
                gains = gains / period;
                losses = losses / period;
            } else {
                const diff = closes[i] - closes[i - 1];
                if (diff >= 0) {
                    gains = (gains * (period - 1) + diff) / period;
                    losses = (losses * (period - 1)) / period;
                } else {
                    gains = (gains * (period - 1)) / period;
                    losses = (losses * (period - 1) - diff) / period;
                }
            }

            const rs = gains / losses;
            rsi.push(100 - (100 / (1 + rs)));
        }
        return rsi;
    }

    // MACD
    static calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const macd = [];
        const ema12 = this.calculateEMA(closes, fastPeriod);
        const ema26 = this.calculateEMA(closes, slowPeriod);

        // Calculate MACD line
        for (let i = 0; i < closes.length; i++) {
            if (i < slowPeriod - 1) {
                macd.push({ macd: null, signal: null, histogram: null });
                continue;
            }
            const macdValue = ema12[i] - ema26[i];
            macd.push({ macd: macdValue, signal: null, histogram: null });
        }

        // Calculate Signal line (9-day EMA of MACD)
        const macdValues = macd.map(m => m.macd);
        const signal = this.calculateEMA(macdValues.slice(slowPeriod - 1), signalPeriod);

        // Calculate Histogram and update signal
        let signalIndex = 0;
        for (let i = slowPeriod - 1; i < macd.length; i++) {
            if (signalIndex < signal.length) {
                macd[i].signal = signal[signalIndex];
                macd[i].histogram = macd[i].macd - signal[signalIndex];
                signalIndex++;
            }
        }

        return macd;
    }

    // EMA Helper
    static calculateEMA(data, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                ema.push(null);
                continue;
            }
            if (i === period - 1) {
                // First EMA uses SMA
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += data[i - j];
                }
                ema.push(sum / period);
            } else {
                ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
            }
        }
        return ema;
    }

    // Volume Profile
    static calculateVolumeProfile(candles, periods = 24) {
        const profile = [];
        for (let i = 0; i < candles.length; i++) {
            if (i < periods - 1) {
                profile.push(null);
                continue;
            }

            let totalVolume = 0;
            let buyVolume = 0;
            for (let j = 0; j < periods; j++) {
                const candle = candles[i - j];
                totalVolume += candle.volume || 0;
                if (candle.close > candle.open) {
                    buyVolume += candle.volume || 0;
                }
            }

            profile.push({
                totalVolume,
                buyVolume,
                sellVolume: totalVolume - buyVolume,
                buyRatio: buyVolume / totalVolume
            });
        }
        return profile;
    }

    // Price Momentum
    static calculateMomentum(closes, period = 10) {
        const momentum = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < period) {
                momentum.push(null);
                continue;
            }
            momentum.push((closes[i] / closes[i - period]) * 100);
        }
        return momentum;
    }
}

// Prepare features and labels for training
function prepareTrainingData(candleData) {
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

    // Look ahead period (4 candles = 1 hour for 15m data)
    const LOOK_AHEAD = 4;
    const TARGET_RETURN = 0.01; // 1% return target

    for (let i = 26; i < candleData.length - LOOK_AHEAD; i++) {
        // Skip if any indicator is null
        if (!bb[i] || !rsi[i] || !macd[i] || !volumeProfile[i] || !momentum[i]) {
            continue;
        }

        // Calculate price features
        const currentPrice = closes[i];
        const priceChange = (currentPrice - closes[i-1]) / closes[i-1];
        const highLowRange = (candleData[i].high - candleData[i].low) / currentPrice;
        
        // Calculate forward return
        const futurePrice = Math.max(...closes.slice(i + 1, i + LOOK_AHEAD + 1));
        const maxReturn = (futurePrice - currentPrice) / currentPrice;
        
        // Feature set
        const feature = {
            // Price action features
            priceChange,
            highLowRange,
            volumeRatio: volumes[i] / Math.max(...volumes.slice(i-10, i+1)),
            
            // Bollinger Bands features
            bbWidth: (bb[i].upper - bb[i].lower) / bb[i].middle,
            bbPosition: (currentPrice - bb[i].lower) / (bb[i].upper - bb[i].lower),
            
            // RSI features
            rsi: rsi[i],
            rsiChange: rsi[i] - rsi[i-1],
            
            // MACD features
            macdValue: macd[i].macd,
            macdSignal: macd[i].signal,
            macdHistogram: macd[i].histogram,
            
            // Volume features
            volumeProfile: volumeProfile[i].buyRatio,
            volumeTrend: volumes[i] / Math.average(...volumes.slice(i-5, i)),
            
            // Momentum
            momentum: momentum[i],
            
            // Time features
            hourOfDay: moment(candleData[i].timestamp).hour(),
            dayOfWeek: moment(candleData[i].timestamp).day()
        };

        features.push(feature);
        labels.push(maxReturn >= TARGET_RETURN ? 1 : 0);
    }

    return { features, labels };
}

async function main() {
    try {
        const fetcher = new DataFetcher();
        const startTime = moment().subtract(180, 'days').valueOf();
        const symbol = 'SOL-USDT-SWAP';

        console.log('获取训练数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);
        const candleData = rawData['15m'];

        console.log('准备训练数据...');
        const { features, labels } = prepareTrainingData(candleData);

        // Calculate feature importance and statistics
        const totalSamples = labels.length;
        const positiveSamples = labels.filter(l => l === 1).length;
        const baselineAccuracy = Math.max(positiveSamples, totalSamples - positiveSamples) / totalSamples;

        console.log('\n=== 数据集统计 ===');
        console.log(`总样本数: ${totalSamples}`);
        console.log(`正样本数 (可盈利机会): ${positiveSamples}`);
        console.log(`正样本比例: ${((positiveSamples / totalSamples) * 100).toFixed(2)}%`);
        console.log(`基准准确率: ${(baselineAccuracy * 100).toFixed(2)}%`);

        // Save training data
        const outputPath = path.join(__dirname, 'data/training_data.json');
        fs.writeFileSync(outputPath, JSON.stringify({
            features,
            labels,
            metadata: {
                totalSamples,
                positiveSamples,
                baselineAccuracy,
                targetReturn: '1%',
                lookAheadPeriod: '1小时',
                features: Object.keys(features[0])
            }
        }, null, 2));

        console.log(`\n训练数据已保存至: ${outputPath}`);
        console.log('\n特征列表:');
        Object.keys(features[0]).forEach(feature => {
            console.log(`- ${feature}`);
        });

    } catch (error) {
        console.error('错误:', error);
    }
}

main();
