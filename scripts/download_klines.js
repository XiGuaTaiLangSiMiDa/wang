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
        // 创建数据目录
        await fs.mkdir(this.dataDir, { recursive: true });
    }

    getFilePath(timeframe) {
        return path.join(this.dataDir, `${this.symbol}_${timeframe}.json`);
    }

    async loadExistingData(timeframe) {
        try {
            const filePath = this.getFilePath(timeframe);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    async saveData(timeframe, data) {
        const filePath = this.getFilePath(timeframe);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`数据已保存到: ${filePath}`);
    }

    async downloadKlines(timeframe, startTime, endTime) {
        console.log(`\n下载 ${timeframe} K线数据:`);
        console.log(`开始时间: ${moment(startTime).format('YYYY-MM-DD HH:mm:ss')}`);
        console.log(`结束时间: ${moment(endTime).format('YYYY-MM-DD HH:mm:ss')}`);

        const params = {
            'instId': this.symbol,
            'bar': this.timeframes[timeframe],
            'after': Math.floor(startTime / 1000).toString(),
            'before': Math.floor(endTime / 1000).toString(),
            'limit': '100'
        };

        try {
            const response = await this.exchange.publicGetMarketCandles(params);
            
            if (!response || !response.data) {
                throw new Error('API返回数据格式错误');
            }

            console.log(`获取到 ${response.data.length} 条数据`);

            const klines = response.data.map(candle => ({
                timestamp: parseInt(candle[0]) * 1000,
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));

            return klines.sort((a, b) => a.timestamp - b.timestamp);
        } catch (error) {
            console.error(`下载数据失败: ${error.message}`);
            throw error;
        }
    }

    async updateKlineData() {
        const now = Date.now();
        const sixMonthsAgo = moment().subtract(6, 'months').valueOf();

        for (const timeframe of Object.keys(this.timeframes)) {
            console.log(`\n处理 ${timeframe} 时间周期数据...`);

            try {
                // 加载现有数据
                let existingData = await this.loadExistingData(timeframe);
                let startTime = sixMonthsAgo;

                if (existingData && existingData.length > 0) {
                    // 获取最新数据的时间戳
                    const lastTimestamp = Math.max(...existingData.map(d => d.timestamp));
                    startTime = lastTimestamp;
                    console.log(`发现现有数据，最新时间戳: ${moment(lastTimestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                }

                // 下载新数据
                const newData = await this.downloadKlines(timeframe, startTime, now);

                if (existingData) {
                    // 合并新旧数据
                    const combinedData = [...existingData, ...newData];
                    // 去重并排序
                    existingData = Array.from(
                        new Map(combinedData.map(item => [item.timestamp, item])).values()
                    ).sort((a, b) => a.timestamp - b.timestamp);
                } else {
                    existingData = newData;
                }

                // 保存数据
                await this.saveData(timeframe, existingData);
                console.log(`${timeframe} 数据更新完成，共 ${existingData.length} 条记录`);

                // 验证数据完整性
                this.validateData(existingData, timeframe);

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
            if (Math.abs(interval - expectedInterval) > 60000) { // 允许1分钟误差
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

// 运行下载器
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