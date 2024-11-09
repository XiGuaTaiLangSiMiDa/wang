const ccxt = require('ccxt');
const moment = require('moment');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class KlineDownloader {
    constructor() {
        this.exchange = new ccxt.okx({
            'apiKey': process.env.API_KEY,
            'secret': process.env.API_SECRET,
            'password': process.env.PASSPHRASE,
            'enableRateLimit': true,
            'timeout': 30000,
            'options': {
                'defaultType': 'swap'
            }
        });

        this.symbol = 'SOL-USDT-SWAP';
        this.timeframes = {
            '15m': '15m',
            '1h': '1H',
            '4h': '4H'
        };
        this.dataDir = path.join(process.cwd(), 'data');
    }

    async init() {
        await fs.mkdir(this.dataDir, { recursive: true });
        await this.exchange.loadMarkets();
    }

    async downloadKlinesWithPagination(timeframe, startTime, endTime) {
        console.log(`\n下载 ${timeframe} K线数据:`);
        console.log(`开始时间: ${moment(startTime).format('YYYY-MM-DD HH:mm:ss')}`);
        console.log(`结束时间: ${moment(endTime).format('YYYY-MM-DD HH:mm:ss')}`);

        let allKlines = [];
        let currentEndTime = endTime;
        const pageSize = 100;
        let retryCount = 0;
        const maxRetries = 3;

        while (currentEndTime > startTime && retryCount < maxRetries) {
            try {
                // 计算当前批次的开始时间
                const batchStartTime = Math.max(
                    startTime,
                    currentEndTime - (pageSize * this.getTimeframeMinutes(timeframe) * 60 * 1000)
                );

                const params = {
                    'instId': this.symbol,
                    'bar': this.timeframes[timeframe],
                    'limit': pageSize.toString(),
                    'after': Math.floor(batchStartTime / 1000).toString(),
                    'before': Math.floor(currentEndTime / 1000).toString()
                };

                console.log(`\n请求数据批次:`);
                console.log(`开始: ${moment(batchStartTime).format('YYYY-MM-DD HH:mm:ss')}`);
                console.log(`结束: ${moment(currentEndTime).format('YYYY-MM-DD HH:mm:ss')}`);

                const response = await this.exchange.publicGetMarketCandles(params);

                if (!response?.data) {
                    throw new Error('API返回数据格式错误');
                }

                if (response.data.length > 0) {
                    const klines = response.data.map(candle => ({
                        timestamp: parseInt(candle[0]) * 1000,
                        open: parseFloat(candle[1]),
                        high: parseFloat(candle[2]),
                        low: parseFloat(candle[3]),
                        close: parseFloat(candle[4]),
                        volume: parseFloat(candle[5])
                    }));

                    // 验证并过滤数据
                    const validKlines = this.validateAndFilterKlines(klines, timeframe);
                    
                    if (validKlines.length > 0) {
                        console.log(`获取有效数据: ${validKlines.length} 条`);
                        console.log(`数据范围: ${moment(validKlines[0].timestamp).format('YYYY-MM-DD HH:mm:ss')} 到 ${moment(validKlines[validKlines.length-1].timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                        
                        allKlines = allKlines.concat(validKlines);
                        // 更新下一批次的结束时间
                        currentEndTime = validKlines[0].timestamp;
                        retryCount = 0; // 重置重试计数
                    } else {
                        console.log('本批次没有有效数据');
                        currentEndTime -= pageSize * this.getTimeframeMinutes(timeframe) * 60 * 1000;
                    }
                } else {
                    console.log('API返回空数据');
                    currentEndTime -= pageSize * this.getTimeframeMinutes(timeframe) * 60 * 1000;
                }

                // 添加延时避免请求限制
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`请求失败: ${error.message}`);
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw new Error(`达到最大重试次数: ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 最终处理
        if (allKlines.length === 0) {
            throw new Error(`未能获取到任何 ${timeframe} 数据`);
        }

        // 去重和排序
        return Array.from(
            new Map(allKlines.map(item => [item.timestamp, item])).values()
        ).sort((a, b) => a.timestamp - b.timestamp);
    }

    validateAndFilterKlines(klines, timeframe) {
        const expectedInterval = this.getTimeframeMinutes(timeframe) * 60 * 1000;
        const validKlines = [];
        let lastTimestamp = null;

        for (const kline of klines) {
            // 验证时间戳是否合理
            if (kline.timestamp < moment('2020-01-01').valueOf() || 
                kline.timestamp > Date.now()) {
                console.log(`跳过异常时间戳: ${moment(kline.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                continue;
            }

            // 验证时间间隔
            if (lastTimestamp !== null) {
                const interval = kline.timestamp - lastTimestamp;
                if (Math.abs(interval - expectedInterval) > 60000) { // 允许1分钟误差
                    console.log(`异常时间间隔: ${moment(lastTimestamp).format('YYYY-MM-DD HH:mm:ss')} 到 ${moment(kline.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                    continue;
                }
            }

            validKlines.push(kline);
            lastTimestamp = kline.timestamp;
        }

        return validKlines;
    }

    getTimeframeMinutes(timeframe) {
        const minutes = {
            '15m': 15,
            '1h': 60,
            '4h': 240
        };
        return minutes[timeframe] || 15;
    }

    async updateKlineData() {
        const now = Date.now();
        const sixMonthsAgo = moment().subtract(6, 'months').valueOf();

        for (const timeframe of Object.keys(this.timeframes)) {
            try {
                console.log(`\n处理 ${timeframe} 时间周期数据...`);
                const klines = await this.downloadKlinesWithPagination(timeframe, sixMonthsAgo, now);

                // 保存数据
                const filePath = path.join(this.dataDir, `${this.symbol}_${timeframe}.json`);
                await fs.writeFile(filePath, JSON.stringify(klines, null, 2));
                console.log(`数据已保存到: ${filePath}`);
                console.log(`${timeframe} 数据更新完成，共 ${klines.length} 条记录`);

            } catch (error) {
                console.error(`处理 ${timeframe} 数据时出错:`, error);
            }

            // 添加延时避免请求限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function run() {
    try {
        const downloader = new KlineDownloader();
        await downloader.init();
        await downloader.updateKlineData();
    } catch (error) {
        console.error('程序执行失败:', error);
        process.exit(1);
    }
}

// 添加错误处理
process.on('unhandledRejection', (error) => {
    console.error('未处理的 Promise 拒绝:', error);
    process.exit(1);
});

run(); 