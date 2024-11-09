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

    shouldEnterPosition(timeData) {
        // Only enter if we don't have an active position
        if (this.currentPosition) return false;

        // Calculate support weight
        const supportWeight = this.calculator.calculateCombinedWeight(timeData, 'support');
        
        // Enter long position if support weight is significant (sum of middle/lower band weights)
        return supportWeight >= 3; // Minimum threshold for entry
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
                weight: 0
            };
        }

        // Check take profit (between 50% and 100% of initial capital)
        if (pnlPercent >= this.minTakeProfitPercent) {
            return {
                reason: 'Take Profit',
                weight: 0
            };
        }

        // Calculate resistance weight for normal exit
        const resistanceWeight = this.calculator.calculateCombinedWeight(timeData, 'resistance');
        
        // Exit if resistance weight is significant
        if (resistanceWeight <= -3) {
            return {
                reason: 'Resistance',
                weight: resistanceWeight
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
                        entry: this.currentPosition,
                        exit: {
                            timestamp: parseInt(timestamp),
                            price: currentPrice,
                            weight: exitSignal.weight,
                            reason: exitSignal.reason
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
            else if (!this.currentPosition && this.shouldEnterPosition(timeData)) {
                this.currentPosition = {
                    timestamp: parseInt(timestamp),
                    entryPrice: currentPrice,
                    size: this.calculatePositionSize(currentPrice),
                    weight: this.calculator.calculateCombinedWeight(timeData, 'support')
                };
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
            resistanceExitTrades: 0
        };

        if (trades.length === 0) return metrics;

        trades.forEach(trade => {
            metrics.totalProfit += trade.profit;
            metrics.profitableTrades += trade.profit > 0 ? 1 : 0;
            metrics.maxProfit = Math.max(metrics.maxProfit, trade.profit);
            metrics.maxLoss = Math.min(metrics.maxLoss, trade.profit);
            metrics.averageDuration += trade.duration;

            // Count exit reasons
            switch (trade.exit.reason) {
                case 'Stop Loss':
                    metrics.stopLossTrades++;
                    break;
                case 'Take Profit':
                    metrics.takeProfitTrades++;
                    break;
                case 'Resistance':
                    metrics.resistanceExitTrades++;
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
