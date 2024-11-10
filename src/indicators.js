class TechnicalIndicators {
    // Calculate average helper function
    static average(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

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

        for (let i = 0; i < closes.length; i++) {
            if (i < slowPeriod - 1) {
                macd.push({ macd: null, signal: null, histogram: null });
                continue;
            }
            const macdValue = ema12[i] - ema26[i];
            macd.push({ macd: macdValue, signal: null, histogram: null });
        }

        const macdValues = macd.map(m => m.macd);
        const signal = this.calculateEMA(macdValues.slice(slowPeriod - 1), signalPeriod);

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

module.exports = TechnicalIndicators;
