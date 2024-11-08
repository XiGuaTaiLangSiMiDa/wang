import ccxt from 'ccxt';

class OKEXClient {
    constructor(apiKey, apiSecret, passphrase) {
        this.exchange = new ccxt.okex({
            apiKey,
            secret: apiSecret,
            password: passphrase,
            options: {
                defaultType: 'swap'
            }
        });
    }

    async initialize() {
        await this.exchange.loadMarkets();
    }

    async fetchKlines(symbol, timeframe, limit = 100) {
        try {
            const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
            return ohlcv.map(k => ({
                timestamp: k[0],
                open: k[1],
                high: k[2],
                low: k[3],
                close: k[4],
                volume: k[5]
            }));
        } catch (error) {
            console.error('Error fetching klines:', error);
            throw error;
        }
    }

    async openPosition(trade) {
        try {
            const order = await this.exchange.createOrder(
                trade.symbol,
                'market',
                trade.type.toLowerCase(),
                trade.size,
                undefined,
                {
                    leverage: trade.leverage,
                    stopLoss: trade.stopLoss,
                    takeProfit: trade.takeProfit
                }
            );
            return order;
        } catch (error) {
            console.error('Error opening position:', error);
            throw error;
        }
    }

    async closePosition(symbol, type) {
        try {
            const positions = await this.exchange.fetchPositions([symbol]);
            const position = positions.find(p => p.side === type.toLowerCase());
            
            if (position) {
                const order = await this.exchange.createOrder(
                    symbol,
                    'market',
                    type === 'LONG' ? 'sell' : 'buy',
                    Math.abs(position.contracts),
                    undefined,
                    {
                        reduce_only: true
                    }
                );
                return order;
            }
        } catch (error) {
            console.error('Error closing position:', error);
            throw error;
        }
    }
}

export default OKEXClient; 