import tulind from 'tulind';

class Indicators {
    static async calculateBollinger(prices, period = 20, stdDev = 2) {
        return new Promise((resolve, reject) => {
            tulind.indicators.bbands.indicator(
                [prices],
                [period, stdDev],
                function(err, results) {
                    if (err) reject(err);
                    resolve({
                        upper: results[0],
                        middle: results[1],
                        lower: results[2]
                    });
                }
            );
        });
    }

    static async calculateRSI(prices, period = 14) {
        return new Promise((resolve, reject) => {
            tulind.indicators.rsi.indicator(
                [prices],
                [period],
                function(err, results) {
                    if (err) reject(err);
                    resolve(results[0]);
                }
            );
        });
    }

    static async analyzeAllTimeframes(klines) {
        const signals = {};
        for (const timeframe of Object.keys(klines)) {
            const prices = klines[timeframe].map(k => k.close);
            
            const [bollinger, rsi] = await Promise.all([
                this.calculateBollinger(prices),
                this.calculateRSI(prices)
            ]);

            signals[timeframe] = {
                bollinger,
                rsi: rsi[rsi.length - 1],
                price: prices[prices.length - 1]
            };
        }
        return signals;
    }
}

export default Indicators; 