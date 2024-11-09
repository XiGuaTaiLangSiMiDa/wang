const ccxt = require('ccxt');
const moment = require('moment');
const config = require('./config.js');

class TradingStrategy {
    constructor() {
        // 定义多个API端点
        this.apiEndpoints = [
            {
                name: 'Production',
                url: 'https://www.okx.com'
            },
            {
                name: 'AWS',
                url: 'https://aws.okx.com'
            }
        ];
        
        this.currentEndpointIndex = 0;
        this.initializeExchange();
        this.results = [];
    }

    initializeExchange(endpointIndex = 0) {
        const endpoint = this.apiEndpoints[endpointIndex];
        this.exchange = new ccxt.okx({
            'apiKey': config.API_KEY,
            'secret': config.API_SECRET,
            'password': config.PASSPHRASE,
            'enableRateLimit': true,
            'timeout': 30000,
            'options': {
                'defaultType': 'swap',
                'adjustForTimeDifference': true
            },
            'urls': {
                'api': {
                    'public': `${endpoint.url}/api/v5/public`,
                    'private': `${endpoint.url}/api/v5/private`,
                    'market': `${endpoint.url}/api/v5/market`,
                    'rest': endpoint.url
                }
            },
            'headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
    }

    async switchEndpoint() {
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.apiEndpoints.length;
        console.log(`切换到 ${this.apiEndpoints[this.currentEndpointIndex].name} 端点`);
        this.initializeExchange(this.currentEndpointIndex);
    }

    async fetchHistoricalData(timeframe, since) {
        let lastError;
        // 尝试所有可用的端点
        for (let i = 0; i < this.apiEndpoints.length; i++) {
            try {
                let retries = 3;
                let data;
                
                while (retries > 0) {
                    try {
                        console.log(`使用 ${this.apiEndpoints[this.currentEndpointIndex].name} 端点获取数据...`);
                        const params = {
                            'instId': config.SYMBOL,
                            'bar': config.timeframes[timeframe].bar,
                            'after': since.toString(),
                            'limit': '100'
                        };

                        console.log('请求参数:', params);
                        const response = await this.exchange.publicGetMarketHistoryCandles(params);
                        
                        if (response && response.data) {
                            data = response.data;
                            break;
                        } else {
                            throw new Error(`API返回错误: ${JSON.stringify(response)}`);
                        }
                    } catch (e) {
                        console.error(`获取数据失败 (尝试 ${4-retries}/3): ${e.message}`);
                        lastError = e;
                        retries--;
                        if (retries === 0) break;
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }

                if (data && data.length > 0) {
                    return data.map(candle => ({
                        timestamp: parseInt(candle[0]),
                        open: parseFloat(candle[1]),
                        high: parseFloat(candle[2]),
                        low: parseFloat(candle[3]),
                        close: parseFloat(candle[4]),
                        volume: parseFloat(candle[5])
                    }));
                }

                // 如果当前端点失败，切换到下一个端点
                await this.switchEndpoint();
            } catch (error) {
                lastError = error;
                console.error(`端点 ${this.apiEndpoints[this.currentEndpointIndex].name} 失败:`, error.message);
                await this.switchEndpoint();
            }
        }

        // 如果所有端点都失败
        throw new Error(`所有API端点都失败。最后的错误: ${lastError.message}`);
    }

    calculateSMA(prices, period) {
        const sma = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) {
                sma.push(null);
                continue;
            }
            const slice = prices.slice(i - period + 1, i + 1);
            const sum = slice.reduce((a, b) => a + b, 0);
            sma.push(sum / period);
        }
        return sma;
    }

    calculateStandardDeviation(prices, period, sma) {
        const stdDev = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) {
                stdDev.push(null);
                continue;
            }
            const slice = prices.slice(i - period + 1, i + 1);
            const mean = sma[i];
            const squareDiffs = slice.map(price => Math.pow(price - mean, 2));
            const variance = squareDiffs.reduce((a, b) => a + b, 0) / period;
            stdDev.push(Math.sqrt(variance));
        }
        return stdDev;
    }

    calculateBollingerBands(prices) {
        const period = config.period;
        const stdDev = config.stdDev;
        const sma = this.calculateSMA(prices, period);
        const standardDeviation = this.calculateStandardDeviation(prices, period, sma);
        
        const bands = [];
        for (let i = 0; i < prices.length; i++) {
            if (sma[i] === null) {
                bands.push({
                    middle: null,
                    upper: null,
                    lower: null
                });
                continue;
            }
            
            bands.push({
                middle: sma[i],
                upper: sma[i] + (standardDeviation[i] * stdDev),
                lower: sma[i] - (standardDeviation[i] * stdDev)
            });
        }
        
        return bands;
    }

    calculateWeightedSignal(timeData, currentTime, currentPrice) {
        let totalWeight = 0;
        
        // 为每个时间周期找到对应的布林带数据
        for (const [timeframe, tfData] of Object.entries(timeData)) {
            // 找到当前时间对应的布林带数据索引
            const index = tfData.data.findIndex(d => d.timestamp === currentTime);
            if (index === -1 || index >= tfData.bb.length) continue;

            const weights = config.timeframes[timeframe];
            const bb = tfData.bb[index];
            
            // 根据价格位置计算权重
            if (currentPrice <= bb.lower) {
                totalWeight += weights.lower;
            } else if (currentPrice <= bb.middle) {
                totalWeight += weights.middle;
            } else if (currentPrice >= bb.upper) {
                totalWeight += weights.upper;
            }
        }
        
        return totalWeight;
    }

    async backtest() {
        try {
            console.log('开始获取历史数据...');
            const sixMonthsAgo = moment().subtract(6, 'months').valueOf();
            const timeframeData = {};

            // 获取所有时间周期的历史数据
            for (const timeframe of Object.keys(config.timeframes)) {
                console.log(`正在获取 ${timeframe} 时间周期的数据...`);
                try {
                    const data = await this.fetchHistoricalData(timeframe, sixMonthsAgo);
                    console.log(`成功获取 ${timeframe} 数据，数据点数量: ${data.length}`);
                    
                    const prices = data.map(d => d.close);
                    const bb = this.calculateBollingerBands(prices);
                    timeframeData[timeframe] = {
                        data: data,
                        bb: bb,
                        timeframe: timeframe
                    };
                } catch (error) {
                    console.error(`获取 ${timeframe} 数据失败:`, error);
                    throw error;
                }
            }

            // 同步不同时间周期的数据
            const alignedData = this.alignTimeframes(timeframeData);
            
            // 模拟交易
            let position = null;
            let capital = config.initialCapital;

            // 遍历对齐后的数据点
            for (const point of alignedData) {
                const signal = this.calculateWeightedSignal(timeframeData, point.timestamp, point.price);
                
                // 记录当前状态
                const currentState = {
                    time: point.timestamp,
                    price: point.price,
                    signal: signal,
                    capital: capital
                };

                // 交易逻辑
                if (!position && signal >= 3) { // 开仓条件
                    position = {
                        entryPrice: point.price,
                        entryTime: point.timestamp,
                        size: (capital * config.leverage) / point.price,
                        entrySignal: signal
                    };
                } else if (position && signal <= -3) { // 平仓条件
                    const pnl = (point.price - position.entryPrice) * position.size;
                    capital += pnl;

                    this.results.push({
                        entryTime: moment(position.entryTime).format('YYYY-MM-DD HH:mm:ss'),
                        exitTime: moment(point.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                        entryPrice: position.entryPrice,
                        exitPrice: point.price,
                        profit: pnl,
                        profitPercentage: (pnl / config.initialCapital) * 100,
                        entrySignal: position.entrySignal,
                        exitSignal: signal
                    });

                    position = null;
                }
            }

            return this.results;
        } catch (error) {
            console.error('回测过程中发生错误:', error);
            throw error;
        }
    }

    // 新增：时间对齐函数
    alignTimeframes(timeframeData) {
        const aligned = [];
        const baseTimeframe = timeframeData['15m'].data;
        
        for (let i = 0; i < baseTimeframe.length; i++) {
            const currentTime = baseTimeframe[i].timestamp;
            const point = {
                timestamp: currentTime,
                price: baseTimeframe[i].close,
                indicators: {}
            };
            
            // 确保所有时间周期都有对应的数据
            let hasAllData = true;
            for (const [timeframe, data] of Object.entries(timeframeData)) {
                const tfIndex = data.data.findIndex(d => d.timestamp <= currentTime);
                if (tfIndex === -1) {
                    hasAllData = false;
                    break;
                }
                point.indicators[timeframe] = {
                    bb: data.bb[tfIndex]
                };
            }
            
            if (hasAllData) {
                aligned.push(point);
            }
        }
        
        return aligned;
    }
}

// 修改运行函数，添加错误处理
async function run() {
    try {
        console.log('开始回测策略...');
        const strategy = new TradingStrategy();
        const results = await strategy.backtest();
        
        if (results.length === 0) {
            console.log('警告: 回测期间没有产生任何交易');
            return;
        }

        // 计算统计指标
        const totalProfit = results.reduce((sum, r) => sum + r.profit, 0);
        const winningTrades = results.filter(r => r.profit > 0);
        const losingTrades = results.filter(r => r.profit <= 0);
        
        console.log('===== 交易结果统计 =====');
        console.log(`总交易次数: ${results.length}`);
        console.log(`盈利交易: ${winningTrades.length}`);
        console.log(`亏损交易: ${losingTrades.length}`);
        console.log(`胜率: ${((winningTrades.length / results.length) * 100).toFixed(2)}%`);
        console.log(`总收益: ${totalProfit.toFixed(2)} USDT`);
        console.log(`收益率: ${((totalProfit / config.initialCapital) * 100).toFixed(2)}%`);
        
        // 输出详细交易记录
        console.log('\n===== 详细交易记录 =====');
        results.forEach((r, index) => {
            console.log(`\n交易 #${index + 1}`);
            console.log(`开仓时间: ${r.entryTime}`);
            console.log(`开仓价格: ${r.entryPrice}`);
            console.log(`开仓信号强度: ${r.entrySignal}`);
            console.log(`平仓时间: ${r.exitTime}`);
            console.log(`平仓价格: ${r.exitPrice}`);
            console.log(`平仓信号强度: ${r.exitSignal}`);
            console.log(`收益: ${r.profit.toFixed(2)} USDT`);
            console.log(`收益率: ${r.profitPercentage.toFixed(2)}%`);
        });
    } catch (error) {
        console.error('策略执行失败:', error);
        process.exit(1);
    }
}

// 添加进程错误处理
process.on('unhandledRejection', (error) => {
    console.error('未处理的 Promise 拒绝:', error);
    process.exit(1);
});

run().catch(console.error); 