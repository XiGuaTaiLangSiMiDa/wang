const BollingerCalculator = require('./calculator');

class TradingStrategy {
    constructor() {
        this.calculator = new BollingerCalculator();
        this.initialCapital = 100; // 100 USDT
        this.leverage = 100;       // 100x leverage
        this.currentPosition = null;
        this.trades = [];
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

    shouldExitPosition(timeData) {
        if (!this.currentPosition) return false;

        // Calculate resistance weight
        const resistanceWeight = this.calculator.calculateCombinedWeight(timeData, 'resistance');
        
        // Exit if resistance weight is significant (sum of middle/upper band weights)
        return resistanceWeight <= -3; // Threshold for exit (negative because resistance weights are negative)
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
            if (this.currentPosition && this.shouldExitPosition(timeData)) {
                const profit = (currentPrice - this.currentPosition.entryPrice) * this.currentPosition.size;
                const profitPercent = (profit / this.initialCapital) * 100;

                const trade = {
                    entry: this.currentPosition,
                    exit: {
                        timestamp: parseInt(timestamp),
                        price: currentPrice,
                        weight: this.calculator.calculateCombinedWeight(timeData, 'resistance')
                    },
                    profit,
                    profitPercent,
                    duration: parseInt(timestamp) - this.currentPosition.timestamp
                };

                results.trades.push(trade);
                this.currentPosition = null;
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
            winRate: 0
        };

        if (trades.length === 0) return metrics;

        trades.forEach(trade => {
            metrics.totalProfit += trade.profit;
            metrics.profitableTrades += trade.profit > 0 ? 1 : 0;
            metrics.maxProfit = Math.max(metrics.maxProfit, trade.profit);
            metrics.maxLoss = Math.min(metrics.maxLoss, trade.profit);
            metrics.averageDuration += trade.duration;
        });

        metrics.winRate = (metrics.profitableTrades / metrics.totalTrades) * 100;
        metrics.averageProfit = metrics.totalProfit / metrics.totalTrades;
        metrics.averageDuration = metrics.averageDuration / metrics.totalTrades;
        metrics.totalProfitPercent = (metrics.totalProfit / this.initialCapital) * 100;

        return metrics;
    }
}

module.exports = TradingStrategy;
