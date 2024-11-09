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
        let currentTime = endTime;
        const pageSize = 100;

        while (currentTime > startTime) {
            try {
                const params = {
                    'instId': this.symbol,
                    'bar': this.timeframes[timeframe],
                    'limit': pageSize.toString(),
                    'before': Math.floor(currentTime / 1000).toString()
                };

                console.log(`请求数据: ${moment(currentTime).format('YYYY-MM-DD HH:mm:ss')}`);
                const response = await this.exchange.publicGetMarketCandles(params);

                if (response && response.data && response.data.length > 0) {
                    const klines = response.data.map(candle => ({
                        timestamp: parseInt(candle[0]) * 1000,
                        open: parseFloat(candle[1]),
                        high: parseFloat(candle[2]),
                        low: parseFloat(candle[3]),
                        close: parseFloat(candle[4]),
                        volume: parseFloat(candle[5])
                    }));

                    console.log(`获取到 ${klines.length} 条数据`);
                    console.log(`数据范围: ${moment(klines[0].timestamp).format('YYYY-MM-DD HH:mm:ss')} 到 ${moment(klines[klines.length-1].timestamp).format('YYYY-MM-DD HH:mm:ss')}`);

                    allKlines = allKlines.concat(klines);
                    currentTime = Math.min(...klines.map(k => k.timestamp));
                } else {
                    console.log('未获取到数据，尝试更早的时间范围');
                    currentTime -= 24 * 60 * 60 * 1000; // 向前移动一天
                }

                // 添加延时避免请求限制
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`请求失败: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 去重和排序
        const uniqueKlines = Array.from(
            new Map(allKlines.map(item => [item.timestamp, item])).values()
        ).sort((a, b) => a.timestamp - b.timestamp);

        return uniqueKlines;
    }

    async updateKlineData() {
        const now = Date.now();
        const sixMonthsAgo = moment().subtract(6, 'months').valueOf();

        for (const timeframe of Object.keys(this.timeframes)) {
            try {
                console.log(`\n处理 ${timeframe} 时间周期数据...`);

                // 下载新数据
                const klines = await this.downloadKlinesWithPagination(timeframe, sixMonthsAgo, now);

                if (klines.length > 0) {
                    // 保存数据
                    const filePath = path.join(this.dataDir, `${this.symbol}_${timeframe}.json`);
                    await fs.writeFile(filePath, JSON.stringify(klines, null, 2));
                    console.log(`数据已保存到: ${filePath}`);
                    console.log(`${timeframe} 数据更新完成，共 ${klines.length} 条记录`);

                    // 验证数据完整性
                    this.validateData(klines, timeframe);
                } else {
                    console.log(`警告: ${timeframe} 未获取到任何数据`);
                }

            } catch (error) {
                console.error(`处理 ${timeframe} 数据时出错:`, error);
            }

            // 添加延时避免请求限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    validateData(data, timeframe) {
        if (!data || data.length === 0) return;

        const intervals = {
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000
        };

        const expectedInterval = intervals[timeframe];
        let invalidIntervals = 0;

        for (let i = 1; i < data.length; i++) {
            const interval = data[i].timestamp - data[i-1].timestamp;
            if (Math.abs(interval - expectedInterval) > 60000) {
                invalidIntervals++;
                console.log(`发现异常间隔: ${moment(data[i-1].timestamp).format('YYYY-MM-DD HH:mm:ss')} 到 ${moment(data[i].timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
            }
        }

        if (invalidIntervals > 0) {
            console.log(`警告: ${timeframe} 数据中发现 ${invalidIntervals} 个异常间隔`);
        } else {
            console.log(`${timeframe} 数据完整性验证通过`);
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

run(); 