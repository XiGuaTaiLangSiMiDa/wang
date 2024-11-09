const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');

class DataCache {
    constructor() {
        this.cacheDir = path.join(process.cwd(), 'cache');
    }

    async init() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error('创建缓存目录失败:', error);
        }
    }

    getCacheFilePath(symbol, timeframe) {
        const date = moment().format('YYYY-MM-DD');
        return path.join(this.cacheDir, `${symbol}_${timeframe}_${date}.json`);
    }

    async saveData(symbol, timeframe, data) {
        const filePath = this.getCacheFilePath(symbol, timeframe);
        try {
            // 按时间戳排序数据
            const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);
            // 去除重复数据
            const uniqueData = this.removeDuplicates(sortedData);
            await fs.writeFile(filePath, JSON.stringify(uniqueData, null, 2));
            console.log(`缓存已保存: ${filePath}`);
        } catch (error) {
            console.error('保存缓存数据失败:', error);
        }
    }

    async loadData(symbol, timeframe) {
        const filePath = this.getCacheFilePath(symbol, timeframe);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            const parsedData = JSON.parse(data);
            console.log(`从缓存加载 ${timeframe} 数据: ${parsedData.length} 条记录`);
            return parsedData;
        } catch (error) {
            console.log(`没有找到缓存数据: ${timeframe}`);
            return null;
        }
    }

    removeDuplicates(data) {
        const seen = new Set();
        return data.filter(item => {
            const duplicate = seen.has(item.timestamp);
            seen.add(item.timestamp);
            return !duplicate;
        });
    }

    async clearOldCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const today = moment().startOf('day');
            
            for (const file of files) {
                const filePath = path.join(this.cacheDir, file);
                const stats = await fs.stat(filePath);
                const fileDate = moment(stats.mtime);
                
                // 删除超过7天的缓存文件
                if (today.diff(fileDate, 'days') > 7) {
                    await fs.unlink(filePath);
                    console.log(`删除过期缓存: ${file}`);
                }
            }
        } catch (error) {
            console.error('清理缓存失败:', error);
        }
    }

    // 验证数据完整性
    validateData(data, timeframe) {
        if (!data || data.length === 0) return false;

        // 检查时间间隔
        const timeframeMinutes = {
            '15m': 15,
            '1H': 60,
            '4H': 240
        }[timeframe];

        for (let i = 1; i < data.length; i++) {
            const timeDiff = data[i].timestamp - data[i-1].timestamp;
            const expectedDiff = timeframeMinutes * 60 * 1000;
            if (Math.abs(timeDiff - expectedDiff) > 60000) { // 允许1分钟的误差
                console.log(`数据间隔异常: ${timeframe} at ${moment(data[i].timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                return false;
            }
        }

        return true;
    }

    // 合并新旧数据
    mergeData(oldData, newData) {
        if (!oldData) return newData;
        if (!newData) return oldData;

        const combined = [...oldData, ...newData];
        const sorted = combined.sort((a, b) => a.timestamp - b.timestamp);
        return this.removeDuplicates(sorted);
    }
}

module.exports = new DataCache(); 