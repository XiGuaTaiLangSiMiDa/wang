const { BollingerBands } = require('technicalindicators');

class BollingerCalculator {
    constructor() {
        this.period = 20; // Standard Bollinger Bands period
        this.stdDev = 2;  // Standard deviation multiplier
    }

    calculateBollingerBands(data) {
        const input = {
            period: this.period,
            values: data.map(d => d.close),
            stdDev: this.stdDev
        };

        const bb = new BollingerBands(input);
        const results = bb.getResult();

        return data.map((candle, index) => {
            if (index < this.period - 1) return null;
            return {
                timestamp: candle.timestamp,
                upper: results[index - (this.period - 1)].upper,
                middle: results[index - (this.period - 1)].middle,
                lower: results[index - (this.period - 1)].lower,
                close: candle.close
            };
        }).filter(x => x !== null);
    }

    calculateWeights(timeframe) {
        // Support weights (middle and lower bands)
        const weights = {
            '15m': { middle: 1, lower: 2 },
            '1h': { middle: 2, lower: 4 },
            '4h': { middle: 3, lower: 6 },
        };

        // Resistance weights (middle and upper bands)
        const resistanceWeights = {
            '15m': { upper: -2, middle: -1 },
            '1h': { upper: -4, middle: -2 },
            '4h': { upper: -6, middle: -3 },
        };

        return {
            support: weights[timeframe],
            resistance: resistanceWeights[timeframe]
        };
    }

    alignTimeframes(data15m, data1h, data4h) {
        const aligned = {};
        const timestamps15m = new Set(data15m.map(d => d.timestamp));
        
        // Create lookup maps for 1h and 4h data
        const map1h = new Map(data1h.map(d => [d.timestamp, d]));
        const map4h = new Map(data4h.map(d => [d.timestamp, d]));

        // For each 15m timestamp, find corresponding 1h and 4h data
        for (const timestamp of timestamps15m) {
            const hour = Math.floor(timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
            const fourHour = Math.floor(timestamp / (4 * 60 * 60 * 1000)) * (4 * 60 * 60 * 1000);

            if (map1h.has(hour) && map4h.has(fourHour)) {
                aligned[timestamp] = {
                    '15m': data15m.find(d => d.timestamp === timestamp),
                    '1h': map1h.get(hour),
                    '4h': map4h.get(fourHour)
                };
            }
        }

        return aligned;
    }

    calculateCombinedWeight(timeData, position = 'support') {
        let totalWeight = 0;

        for (const [timeframe, data] of Object.entries(timeData)) {
            const weights = this.calculateWeights(timeframe)[position];
            const price = data.close;

            if (position === 'support') {
                if (price <= data.lower) totalWeight += weights.lower;
                else if (price <= data.middle) totalWeight += weights.middle;
            } else { // resistance
                if (price >= data.upper) totalWeight += weights.upper;
                else if (price >= data.middle) totalWeight += weights.middle;
            }
        }

        return totalWeight;
    }
}

module.exports = BollingerCalculator;
