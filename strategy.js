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
        let allData = [];
        let currentTime = moment().valueOf();
        const pageSize = 100;
        const timeframeMs = {
            '15m': 15 * 60 * 1000,
            '1H': 60 * 60 * 1000,
            '4H': 4 * 60 * 60 * 1000
        }[config.timeframes[timeframe].bar];

        // 计算需要获取的数据点数量
        const totalPeriod = currentTime - startTime;
        const expectedDataPoints = Math.ceil(totalPeriod / timeframeMs);
        console.log(`${timeframe} 预期数据点数量: ${expectedDataPoints}`);

        while (currentTime > startTime) {
            let lastError;
            let success = false;

            // 尝试所有端点
            for (let i = 0; i < this.apiEndpoints.length && !success; i++) {
                try {
                    const params = {
                        'instId': config.SYMBOL,
                        'bar': config.timeframes[timeframe].bar,
                        'limit': '100'
                    };

                    // 如果不是第一次请求，添加 before 参数
                    if (allData.length > 0) {
                        const earliestTimestamp = Math.min(...allData.map(d => d.timestamp));
                        params.before = Math.floor(earliestTimestamp / 1000).toString();
                    }

                    const currentTimeStr = moment(currentTime).format('YYYY-MM-DD HH:mm:ss');
                    console.log(`获取 ${timeframe} 数据: ${currentTimeStr}`);
                    console.log('请求参数:', params);

                    const response = await this.exchange.publicGetMarketCandles(params);

                    if (response && response.data && response.data.length > 0) {
                        const pageData = response.data.map(candle => ({
                            timestamp: parseInt(candle[0]) * 1000,
                            open: parseFloat(candle[1]),
                            high: parseFloat(candle[2]),
                            low: parseFloat(candle[3]),
                            close: parseFloat(candle[4]),
                            volume: parseFloat(candle[5])
                        }));

                        // 过滤掉超出时间范围的数据
                        const filteredData = pageData.filter(d => 
                            d.timestamp >= startTime && d.timestamp <= endTime
                        );

                        if (filteredData.length > 0) {
                            allData = allData.concat(filteredData);
                            // 更新当前时间为最早数据点的时间减去一个时间周期
                            currentTime = Math.min(...filteredData.map(d => d.timestamp)) - timeframeMs;
                            success = true;

                            console.log(`已获取 ${allData.length}/${expectedDataPoints} 数据点`);
                            console.log(`当前最早时间: ${moment(currentTime).format('YYYY-MM-DD HH:mm:ss')}`);
                            
                            if (currentTime <= startTime) {
                                break;
                            }
                        } else {
                            // 如果过滤后没有数据，向前移动一个时间周期
                            currentTime -= timeframeMs * pageSize;
                            break;
                        }

                        await new Promise(resolve => setTimeout(resolve, 200));
                    } else {
                        if (response && response.data && response.data.length === 0) {
                            // 如果返回空数据，向前移动一个时间周期
                            currentTime -= timeframeMs * pageSize;
                            success = true;
                            break;
                        }
                        throw new Error(`API返回错误: ${JSON.stringify(response)}`);
                    }
                } catch (error) {
                    lastError = error;
                    console.error(`端点失败，尝试下一个端点:`, error.message);
                    await this.switchEndpoint();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            if (!success && lastError) {
                throw new Error(`所有端点都失败: ${lastError.message}`);
            }

            if (success && allData.length === 0) {
                currentTime -= timeframeMs * pageSize;
            }
        }

        // 数据后处理
        allData = allData
            .sort((a, b) => a.timestamp - b.timestamp)
            .filter(d => d.timestamp >= startTime && d.timestamp <= endTime);

        // 去重
        allData = Array.from(new Map(allData.map(item => [item.timestamp, item])).values());

        console.log(`成功获取 ${timeframe} 完整数据: ${allData.length} 条记录`);
        return allData;
    }

    validateTimeframe(data, expectedInterval) {
        if (data.length < 2) return false;

        let validIntervals = 0;
        let totalIntervals = 0;

        for (let i = 1; i < data.length; i++) {
            const interval = data[i].timestamp - data[i-1].timestamp;
            if (Math.abs(interval - expectedInterval) <= 60000) { // 允许1分钟误差
                validIntervals++;
            }
            totalIntervals++;
        }

        const validityRatio = validIntervals / totalIntervals;
        console.log(`时间间隔有效率: ${(validityRatio * 100).toFixed(2)}%`);
        
        return validityRatio >= 0.95; // 允许5%的误差
    }

    async getHistoricalData(timeframe, since) {
        // 尝试从缓存加载数据
        let cachedData = await cache.loadData(config.SYMBOL, timeframe);
        const currentTime = Date.now();

        if (cachedData) {
            const lastDataTime = cachedData[cachedData.length - 1].timestamp;
            const firstDataTime = cachedData[0].timestamp;
            const sixMonthsAgo = moment().subtract(6, 'months').valueOf();

            // 检查缓存数据是否覆盖了所需的时间范围
            if (firstDataTime <= sixMonthsAgo && currentTime - lastDataTime < 24 * 60 * 60 * 1000) {
                console.log(`使用缓存的 ${timeframe} 数据`);
                return cachedData;
            }

            // 如果缓存数据不完整，重新获取全部数据
            console.log(`缓存数据不完整，重新获取 ${timeframe} 数据`);
        }

        try {
            const newData = await this.fetchHistoricalDataWithPagination(timeframe, since, currentTime);
            await cache.saveData(config.SYMBOL, timeframe, newData);
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