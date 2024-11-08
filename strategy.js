import config from './config.js';
import Indicators from './indicators.js';

class TradingStrategy {
    constructor() {
        this.currentPosition = null;
        this.tradingHistory = [];
        this.balance = 1000; // 初始资金1000U
    }

    async shouldOpenLong(signals) {
        let longSignals = 0;
        let totalSignals = 0;

        for (const timeframe in signals) {
            const {bollinger, rsi, price} = signals[timeframe];
            
            if (price <= bollinger.lower[bollinger.lower.length - 1] * 1.005) {
                longSignals++;
            }
            
            if (rsi <= config.RSI_OVERSOLD) {
                longSignals++;
            }
            
            totalSignals += 2;
        }

        return (longSignals / totalSignals) >= 0.6;
    }

    async executeTrade(price, type, takeProfitPercent) {
        const trade = {
            type,
            entryPrice: price,
            size: config.POSITION_SIZE,
            leverage: config.LEVERAGE,
            stopLoss: type === 'LONG' ? 
                price * (1 - config.STOP_LOSS_PERCENT) : 
                price * (1 + config.STOP_LOSS_PERCENT),
            takeProfit: type === 'LONG' ? 
                price * (1 + takeProfitPercent) : 
                price * (1 - takeProfitPercent),
            openTime: new Date(),
            status: 'OPEN'
        };

        this.currentPosition = trade;
        return trade;
    }

    async closePosition(price, reason) {
        const position = this.currentPosition;
        const profit = position.type === 'LONG' ? 
            (price - position.entryPrice) / position.entryPrice * position.leverage * position.size :
            (position.entryPrice - price) / position.entryPrice * position.leverage * position.size;
            
        const fees = position.size * config.FEE_RATE;
        const netProfit = profit - fees;

        const tradeResult = {
            ...position,
            exitPrice: price,
            closeTime: new Date(),
            profit,
            fees,
            netProfit,
            reason,
            status: 'CLOSED'
        };

        this.tradingHistory.push(tradeResult);
        this.balance += netProfit;
        this.currentPosition = null;

        return tradeResult;
    }
}

export default TradingStrategy; 