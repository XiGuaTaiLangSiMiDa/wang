import config from './config.js';
import Strategy from './strategy.js';
import Logger from './logger.js';
import OKEXClient from './okex-client.js';
import Indicators from './indicators.js';

// 创建模拟客户端
class SimulatedClient {
    async fetchKlines(symbol, timeframe, limit = 100) {
        const klines = [];
        const now = Date.now();
        const basePrice = 100;
        
        for (let i = 0; i < limit; i++) {
            const timestamp = now - (limit - i) * 60000 * parseInt(timeframe);
            const randomChange = (Math.random() - 0.5) * 2;
            const close = basePrice + randomChange;
            klines.push({
                timestamp,
                open: close - randomChange/2,
                high: close + Math.abs(randomChange),
                low: close - Math.abs(randomChange),
                close,
                volume: Math.random() * 1000000
            });
        }
        return klines;
    }

    async openPosition() {
        return { status: 'ok' };
    }

    async closePosition() {
        return { status: 'ok' };
    }
}

async function main() {
    const strategy = new Strategy();
    const logger = new Logger();
    
    // 根据模式选择客户端
    const client = config.TRADE_MODE === 'LIVE' 
        ? new OKEXClient(config.API_KEY, config.API_SECRET, config.PASSPHRASE)
        : new SimulatedClient();

    console.log(`\n=== 策略启动 ===`);
    console.log(`交易模式: ${config.TRADE_MODE}`);
    console.log(`交易对: ${config.SYMBOL}`);
    console.log(`杠杆倍数: ${config.LEVERAGE}x`);
    console.log(`单笔金额: ${config.POSITION_SIZE} USDT`);
    console.log(`止损比例: ${config.STOP_LOSS_PERCENT * 100}%`);
    console.log(`止盈比例: ${config.TAKE_PROFIT_PERCENTS.map(p => p * 100).join('% 或 ')}%`);
    console.log('===============\n');

    // 如果是实盘模式，初始化交易所连接
    if (config.TRADE_MODE === 'LIVE') {
        await client.initialize();
    }

    while (true) {
        try {
            // 获取各时间周期的K线数据
            const klines = await fetchKlinesData(client);
            
            // 计算技术指标
            const signals = await Indicators.analyzeAllTimeframes(klines);
            
            // 检查是否需要打印统计信息
            logger.checkAndPrintStats(strategy.tradingHistory);
            
            // 检查是否有持仓
            if (!strategy.currentPosition) {
                // 判断是否开仓
                if (await strategy.shouldOpenLong(signals)) {
                    const currentPrice = signals['5'].price;
                    const takeProfitPercent = determineTakeProfit(signals);
                    
                    console.log('\n=== 开仓信号 ===');
                    console.log(`当前价格: ${currentPrice}`);
                    console.log(`止盈比例: ${takeProfitPercent * 100}%`);
                    console.log(`止损价格: ${currentPrice * (1 - config.STOP_LOSS_PERCENT)}`);
                    console.log(`止盈价格: ${currentPrice * (1 + takeProfitPercent)}`);
                    
                    const trade = await strategy.executeTrade(
                        currentPrice, 
                        'LONG',
                        takeProfitPercent
                    );

                    await client.openPosition(trade);
                }
            } else {
                // 检查止盈止损
                const position = strategy.currentPosition;
                const currentPrice = signals['5'].price;

                if (currentPrice <= position.stopLoss) {
                    const result = await strategy.closePosition(currentPrice, 'STOP_LOSS');
                    logger.logTrade(result, strategy.balance);
                    await client.closePosition(config.SYMBOL, position.type);
                    console.log(`止损平仓: 价格=${currentPrice}, 损失=${result.netProfit}USDT`);
                } else if (currentPrice >= position.takeProfit) {
                    const result = await strategy.closePosition(currentPrice, 'TAKE_PROFIT');
                    logger.logTrade(result, strategy.balance);
                    await client.closePosition(config.SYMBOL, position.type);
                    console.log(`止盈平仓: 价格=${currentPrice}, 盈利=${result.netProfit}USDT`);
                }
            }
        } catch (error) {
            console.error('Error in main loop:', error);
        }

        // 每5秒检查一次
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

function determineTakeProfit(signals) {
    let riskCount = 0;
    
    for (const timeframe in signals) {
        const {bollinger, price} = signals[timeframe];
        const upperBand = bollinger.upper[bollinger.upper.length - 1];
        
        if (price >= upperBand * 0.95) {
            riskCount++;
        }
    }

    return riskCount >= Object.keys(signals).length / 2 ? 
        config.TAKE_PROFIT_PERCENTS[0] : 
        config.TAKE_PROFIT_PERCENTS[1];
}

async function fetchKlinesData(client) {
    try {
        const klines = {};
        for (const timeframe of config.TIMEFRAMES) {
            const okexTimeframe = convertTimeframe(timeframe);
            const data = await client.fetchKlines(
                config.SYMBOL,
                okexTimeframe,
                100
            );
            klines[timeframe] = data;
        }
        return klines;
    } catch (error) {
        console.error('Error fetching klines data:', error);
        throw error;
    }
}

function convertTimeframe(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    } else if (minutes < 1440) {
        return `${minutes/60}h`;
    } else {
        return `${minutes/1440}d`;
    }
}

export { main, determineTakeProfit, fetchKlinesData, convertTimeframe };

// 启动程序
main().catch(console.error);