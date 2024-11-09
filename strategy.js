const ccxt = require('ccxt');
const moment = require('moment');
const config = require('./config.js');
const cache = require('./utils/cache');

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

    async fetchHistoricalDataWithPagination(timeframe, startTime, endTime) {
        try {
            let allData = [];
            const pageSize = 100;

            // 转换为秒级时间戳
            const endTimeSec = Math.floor(Date.now() / 1000);
            const startTimeSec = Math.floor(startTime / 1000);

            console.log('\n获取数据的时间范围:');
            console.log(`开始时间: ${moment.unix(startTimeSec).format('YYYY-MM-DD HH:mm:ss')}`);
            console.log(`结束时间: ${moment.unix(endTimeSec).format('YYYY-MM-DD HH:mm:ss')}`);

            // 直接使用 after 参数获取数据
            const params = {
                'instId': config.SYMBOL,
                'bar': config.timeframes[timeframe].bar,
                'limit': pageSize.toString(),
                'after': startTimeSec.toString(),
                'before': endTimeSec.toString()
            };

            console.log('请求参数:', params);

            try {
                const response = await this.exchange.publicGetMarketCandles(params);
                
                if (!response || !response.data) {
                    throw new Error('API返回数据格式错误');
                }

                console.log(`API响应数据长度: ${response.data.length}`);

                if (response.data.length > 0) {
                    // 解析数据
                    const data = response.data.map(candle => ({
                        timestamp: parseInt(candle[0]) * 1000, // 转换为毫秒级
                        open: parseFloat(candle[1]),
                        high: parseFloat(candle[2]),
                        low: parseFloat(candle[3]),
                        close: parseFloat(candle[4]),
                        volume: parseFloat(candle[5])
                    }));

                    // 按时间排序
                    allData = data.sort((a, b) => a.timestamp - b.timestamp);

                    console.log(`获取数据成功:`);
                    console.log(`- 数据点数量: ${allData.length}`);
                    if (allData.length > 0) {
                        console.log(`- 数据范围: ${moment(allData[0].timestamp).format('YYYY-MM-DD HH:mm:ss')} 到 ${moment(allData[allData.length-1].timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                    }

                    // 验证数据间隔
                    let invalidIntervals = 0;
                    const expectedInterval = this.getTimeframeInterval(timeframe);
                    
                    for (let i = 1; i < allData.length; i++) {
                        const interval = allData[i].timestamp - allData[i-1].timestamp;
                        if (Math.abs(interval - expectedInterval) > 60000) { // 允许1分钟误差
                            invalidIntervals++;
                            console.log(`发现异常间隔: ${moment(allData[i-1].timestamp).format('YYYY-MM-DD HH:mm:ss')} 到 ${moment(allData[i].timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                        }
                    }

                    if (invalidIntervals > 0) {
                        console.log(`警告: 发现 ${invalidIntervals} 个异常时间间隔`);
                    }
                }

                return allData;

            } catch (error) {
                console.error(`请求失败: ${error.message}`);
                throw error;
            }
        } catch (error) {
            console.error(`获取历史数据失败: ${error.message}`);
            throw error;
        }
    }

    // 辅助函数：获取时间间隔（毫秒）
    getTimeframeInterval(timeframe) {
        const intervals = {
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000
        };
        return intervals[timeframe] || 15 * 60 * 1000; // 默认15分钟
    }

    async getHistoricalData(timeframe, since) {
        try {
            // 尝试从缓存加载数据
            let cachedData = await cache.loadData(config.SYMBOL, timeframe);
            const currentTime = Date.now();

            // 如果有缓存数据且数据有效
            if (cachedData && cachedData.length > 0) {
                const lastDataTime = cachedData[cachedData.length - 1].timestamp;
                const firstDataTime = cachedData[0].timestamp;
                const sixMonthsAgo = moment().subtract(6, 'months').valueOf();

                // 检查缓存数据是否覆盖了所需的时间范围
                if (firstDataTime <= sixMonthsAgo && currentTime - lastDataTime < 24 * 60 * 60 * 1000) {
                    console.log(`使用缓存的 ${timeframe} 数据`);
                    return cachedData;
                }

                console.log(`缓存数据不完整，重新获取 ${timeframe} 数据`);
            } else {
                console.log(`没有有效的缓存数据，获取新的 ${timeframe} 数据`);
            }

            // 获取新数据
            const newData = await this.fetchHistoricalDataWithPagination(timeframe, since, currentTime);
            
            // 验证新数据
            if (!newData || newData.length === 0) {
                throw new Error(`获取 ${timeframe} 数据失败: 没有数据返回`);
            }

            // 保存到缓存
            await cache.saveData(config.SYMBOL, timeframe, newData);
            
            console.log(`成功获取并缓存 ${timeframe} 数据: ${newData.length} 条记录`);
            return newData;
        } catch (error) {
            console.error(`获取 ${timeframe} 数据失败:`, error);
            throw error;
        }
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
            await cache.init();
            await cache.clearOldCache();  // 清理旧缓存
            console.log('开始获取历史数据...');
            const sixMonthsAgo = moment().subtract(6, 'months').valueOf();
            const timeframeData = {};

            // 获取所有时间周期的历史数据
            for (const timeframe of Object.keys(config.timeframes)) {
                console.log(`正在获取 ${timeframe} 时间周期的数据...`);
                const data = await this.getHistoricalData(timeframe, sixMonthsAgo);
                
                // 验证数据完整性
                if (!cache.validateData(data, config.timeframes[timeframe].bar)) {
                    throw new Error(`${timeframe} 数据完整性验证失败`);
                }
                
                console.log(`成功获取 ${timeframe} 数据，数据点数量: ${data.length}`);
                
                const prices = data.map(d => d.close);
                const bb = this.calculateBollingerBands(prices);
                timeframeData[timeframe] = {
                    data: data,
                    bb: bb,
                    timeframe: timeframe
                };
            }

            // 同步不同时间周期的数据
            const alignedData = this.alignTimeframes(timeframeData);
            console.log(`对齐后的数据点数量: ${alignedData.length}`);

            // 模拟交易
            let position = null;
            let capital = config.initialCapital;
            let maxDrawdown = 0;
            let peakCapital = capital;
            let trades = [];

            // 遍历对齐后的数据点
            for (let i = 0; i < alignedData.length; i++) {
                const point = alignedData[i];
                const signal = this.calculateWeightedSignal(timeframeData, point.timestamp, point.price);
                
                // 更新最大回撤
                if (capital > peakCapital) {
                    peakCapital = capital;
                }
                const currentDrawdown = (peakCapital - capital) / peakCapital;
                maxDrawdown = Math.max(maxDrawdown, currentDrawdown);

                // 交易逻辑
                if (!position && signal >= 3) { // 开仓条件
                    position = {
                        entryPrice: point.price,
                        entryTime: point.timestamp,
                        size: (capital * config.leverage) / point.price,
                        entrySignal: signal,
                        entryIndex: i
                    };
                    trades.push({
                        type: 'ENTRY',
                        time: moment(point.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                        price: point.price,
                        signal: signal,
                        capital: capital
                    });
                } else if (position) {
                    // 计算当前持仓收益
                    const unrealizedPnl = (point.price - position.entryPrice) * position.size;
                    const unrealizedReturn = (unrealizedPnl / config.initialCapital) * 100;

                    // 平仓条件：信号反转或止损
                    if (signal <= -3 || unrealizedReturn <= -10) { // 添加10%止损
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
                            exitSignal: signal,
                            holdingPeriod: i - position.entryIndex
                        });

                        trades.push({
                            type: 'EXIT',
                            time: moment(point.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                            price: point.price,
                            signal: signal,
                            pnl: pnl,
                            capital: capital
                        });

                        position = null;
                    }
                }
            }

            // 计算额外的统计指标
            const stats = this.calculateStats(this.results, maxDrawdown, trades);
            return { results: this.results, stats: stats };
        } catch (error) {
            console.error('回测过程中发生错误:', error);
            throw error;
        }
    }

    calculateStats(results, maxDrawdown, trades) {
        if (results.length === 0) return null;

        const winningTrades = results.filter(r => r.profit > 0);
        const losingTrades = results.filter(r => r.profit <= 0);
        const totalProfit = results.reduce((sum, r) => sum + r.profit, 0);
        const profitFactor = winningTrades.reduce((sum, r) => sum + r.profit, 0) / 
                            Math.abs(losingTrades.reduce((sum, r) => sum + r.profit, 0) || 1);

        return {
            totalTrades: results.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: (winningTrades.length / results.length) * 100,
            totalProfit: totalProfit,
            profitPercentage: (totalProfit / config.initialCapital) * 100,
            maxDrawdown: maxDrawdown * 100,
            profitFactor: profitFactor,
            averageHoldingPeriod: results.reduce((sum, r) => sum + r.holdingPeriod, 0) / results.length,
            averageWinningTrade: winningTrades.reduce((sum, r) => sum + r.profit, 0) / winningTrades.length,
            averageLosingTrade: losingTrades.reduce((sum, r) => sum + r.profit, 0) / losingTrades.length
        };
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

// 改运行函数，添加错误处理
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
            console.log(`仓价格: ${r.entryPrice}`);
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