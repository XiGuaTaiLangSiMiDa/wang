const BollingerCalculator = require('./calculator');

class TradingStrategy {
    constructor() {
        this.calculator = new BollingerCalculator();
        this.initialCapital = 100; // 100 USDT
        this.leverage = 100;       // 100x leverage
        this.currentPosition = null;
        this.trades = [];
        
        // Risk management parameters
        this.stopLossPercent = 50;  // 50% of initial capital
        this.minTakeProfitPercent = 50;  // 50% of initial capital
        this.maxTakeProfitPercent = 100; // 100% of initial capital
    }

    calculatePositionSize(price) {
        return (this.initialCapital * this.leverage) / price;
    }

    calculateSupportWeight(timeData) {
        const weights = {
            '15m': { middle: 1, lower: 2 },
            '1h': { middle: 2, lower: 4 },
            '4h': { middle: 3, lower: 6 }
        };

        let totalWeight = 0;
        let entryTimeframes = [];

        for (const [timeframe, data] of Object.entries(timeData)) {
            const price = data.close;
            if (price <= data.lower) {
                totalWeight += weights[timeframe].lower;
                entryTimeframes.push({ timeframe, band: 'lower' });
            } else if (price <= data.middle) {
                totalWeight += weights[timeframe].middle;
                entryTimeframes.push({ timeframe, band: 'middle' });
            }
        }

        return { weight: totalWeight, entryTimeframes };
    }

    calculateResistanceWeight(timeData, entryTimeframes) {
        const weights = {
            '15m': { upper: -2, middle: -1 },
            '1h': { upper: -4, middle: -2 },
            '4h': { upper: -6, middle: -3 }
        };

        let totalWeight = 0;
        let exitTriggers = [];

        // Only consider resistance from timeframes we didn't use for entry
        for (const [timeframe, data] of Object.entries(timeData)) {
            // Skip if this timeframe was used for entry
            if (entryTimeframes.some(entry => entry.timeframe === timeframe)) {
                continue;
            }

            const price = data.close;
            if (price >= data.upper) {
                totalWeight += weights[timeframe].upper;
                exitTriggers.push({ timeframe, band: 'upper', weight: weights[timeframe].upper });
            } else if (price >= data.middle) {
                totalWeight += weights[timeframe].middle;
                exitTriggers.push({ timeframe, band: 'middle', weight: weights[timeframe].middle });
            }
        }

        return { weight: totalWeight, exitTriggers };
    }

    shouldEnterPosition(timeData) {
        // Only enter if we don't have an active position
        if (this.currentPosition) return false;

        // Calculate support weight and get entry timeframes
        const { weight: supportWeight, entryTimeframes } = this.calculateSupportWeight(timeData);
        
        // Enter long position if support weight is significant
        if (supportWeight >= 3) {
            return { enter: true, entryTimeframes };
        }

        return { enter: false };
    }

    shouldExitPosition(timeData, currentPrice) {
        if (!this.currentPosition) return false;

        const positionValue = this.currentPosition.size * currentPrice;
        const entryValue = this.currentPosition.size * this.currentPosition.entryPrice;
        const unrealizedPnL = positionValue - entryValue;
        const pnlPercent = (unrealizedPnL / this.initialCapital) * 100;

        // Check stop loss (50% of initial capital)
        if (pnlPercent <= -this.stopLossPercent) {
            return {
                reason: 'Stop Loss',
                weight: 0,
                details: '止损: 亏损达到50%'
            };
        }

        // Check take profit (between 50% and 100% of initial capital)
        if (pnlPercent >= this.minTakeProfitPercent) {
            return {
                reason: 'Take Profit',
                weight: 0,
                details: `止盈: 收益达到${pnlPercent.toFixed(2)}%`
            };
        }

        // Calculate resistance weight excluding entry timeframes
        const { weight: resistanceWeight, exitTriggers } = this.calculateResistanceWeight(timeData, this.currentPosition.entryTimeframes);
        
        // Exit if resistance weight is significant
        if (resistanceWeight <= -3 && exitTriggers.length > 0) {
            // Sort exit triggers by weight to find the strongest signal
            exitTriggers.sort((a, b) => a.weight - b.weight);
            const primaryTrigger = exitTriggers[0];
            
            return {
                reason: 'Resistance',
                weight: resistanceWeight,
                details: `阻力位退出: ${primaryTrigger.timeframe}${primaryTrigger.band === 'upper' ? '上轨' : '中轨'}`,
                exitTriggers
            };
        }

        return false;
    }

    executeBacktest(alignedData) {
        const results = {
            trades: [],
            metrics: {}
        };

        const timestamps = Object.keys(alignedData).sort((a, b) => parseInt(a) - parseInt(b));

        for (const timestamp of timestamps) {
            const timeData = alignedData[timestamp];
            const currentPrice = timeData['15m'].close;

            // Check for exit signals first
            if (this.currentPosition) {
                const exitSignal = this.shouldExitPosition(timeData, currentPrice);
                if (exitSignal) {
                    const positionValue = this.currentPosition.size * currentPrice;
                    const entryValue = this.currentPosition.size * this.currentPosition.entryPrice;
                    const profit = positionValue - entryValue;
                    const profitPercent = (profit / this.initialCapital) * 100;

                    const trade = {
                        entry: {
                            ...this.currentPosition,
                            timeframes: this.currentPosition.entryTimeframes
                        },
                        exit: {
                            timestamp: parseInt(timestamp),
                            price: currentPrice,
                            weight: exitSignal.weight,
                            reason: exitSignal.reason,
                            details: exitSignal.details,
                            exitTriggers: exitSignal.exitTriggers
                        },
                        profit,
                        profitPercent,
                        duration: parseInt(timestamp) - this.currentPosition.timestamp
                    };

                    results.trades.push(trade);
                    this.currentPosition = null;
                }
            }
            // Check for entry signals
            else {
                const entrySignal = this.shouldEnterPosition(timeData);
                if (entrySignal.enter) {
                    this.currentPosition = {
                        timestamp: parseInt(timestamp),
                        entryPrice: currentPrice,
                        size: this.calculatePositionSize(currentPrice),
                        entryTimeframes: entrySignal.entryTimeframes,
                        weight: this.calculateSupportWeight(timeData).weight
                    };
                }
            }
        }

        // Calculate metrics
        results.metrics = this.calculateMetrics(results.trades);
        return results;
    }

    calculateMetrics(trades) {
        const metrics = {
            totalTrades: trades.length,
            profitableTrades: 0,
            totalProfit: 0,
            maxProfit: 0,
            maxLoss: 0,
            averageProfit: 0,
            averageDuration: 0,
            winRate: 0,
            stopLossTrades: 0,
            takeProfitTrades: 0,
            resistanceExitTrades: {
                total: 0,
                byTimeframe: {
                    '15m': { upper: 0, middle: 0 },
                    '1h': { upper: 0, middle: 0 },
                    '4h': { upper: 0, middle: 0 }
                }
            }
        };

        if (trades.length === 0) return metrics;

        trades.forEach(trade => {
            metrics.totalProfit += trade.profit;
            metrics.profitableTrades += trade.profit > 0 ? 1 : 0;
            metrics.maxProfit = Math.max(metrics.maxProfit, trade.profit);
            metrics.maxLoss = Math.min(metrics.maxLoss, trade.profit);
            metrics.averageDuration += trade.duration;

            switch (trade.exit.reason) {
                case 'Stop Loss':
                    metrics.stopLossTrades++;
                    break;
                case 'Take Profit':
                    metrics.takeProfitTrades++;
                    break;
                case 'Resistance':
                    metrics.resistanceExitTrades.total++;
                    if (trade.exit.exitTriggers) {
                        trade.exit.exitTriggers.forEach(trigger => {
                            metrics.resistanceExitTrades.byTimeframe[trigger.timeframe][trigger.band]++;
                        });
                    }
                    break;
            }
        });

        metrics.winRate = (metrics.profitableTrades / metrics.totalTrades) * 100;
        metrics.averageProfit = metrics.totalProfit / metrics.totalTrades;
        metrics.averageDuration = metrics.averageDuration / metrics.totalTrades;
        metrics.totalProfitPercent = (metrics.totalProfit / this.initialCapital) * 100;

        return metrics;
    }
}

module.exports = TradingStrategy;
