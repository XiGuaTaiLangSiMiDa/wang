const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
require('dotenv').config();

class DataFetcher {
    constructor() {
        this.exchange = new ccxt.okx({
            apiKey: process.env.API_KEY,
            secret: process.env.API_SECRET,
            password: process.env.PASSPHRASE,
            enableRateLimit: true,
            timeout: 30000, // Increase timeout to 30 seconds
            options: {
                defaultType: 'spot'
            }
        });
        
        this.dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    getFilePath(symbol, timeframe) {
        return path.join(this.dataDir, `${symbol.replace('/', '-')}-${timeframe}.json`);
    }

    async retry(fn, maxAttempts = 3, delay = 2000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) throw error;
                console.log(`Attempt ${attempt} failed, retrying in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }

    async fetchHistoricalData(symbol, timeframe, startTime) {
        const filePath = this.getFilePath(symbol, timeframe);
        let existingData = [];
        
        // Check if cached data exists
        if (fs.existsSync(filePath)) {
            console.log(`Loading cached data for ${symbol} ${timeframe}...`);
            existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const lastTimestamp = existingData[existingData.length - 1].timestamp;
            startTime = Math.max(startTime, lastTimestamp);
        }

        const endTime = Date.now();
        let allData = [];

        try {
            await this.exchange.loadMarkets();
            
            while (startTime < endTime) {
                const fetchData = async () => {
                    const data = await this.exchange.fetchOHLCV(symbol, timeframe, startTime, 100);
                    return data;
                };

                const data = await this.retry(fetchData);
                
                if (data.length === 0) break;
                
                allData = allData.concat(data);
                startTime = data[data.length - 1][0] + 1;
                
                console.log(`Fetched ${data.length} candles for ${symbol} ${timeframe}, from ${moment(data[0][0]).format('YYYY-MM-DD HH:mm')} to ${moment(data[data.length-1][0]).format('YYYY-MM-DD HH:mm')}`);
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Merge with existing data and remove duplicates
            const combinedData = [...existingData, ...allData.map(d => ({
                timestamp: d[0],
                open: d[1],
                high: d[2],
                low: d[3],
                close: d[4],
                volume: d[5]
            }))];

            // Remove duplicates based on timestamp
            const uniqueData = Array.from(new Map(
                combinedData.map(item => [item.timestamp, item])
            ).values());

            // Sort by timestamp
            uniqueData.sort((a, b) => a.timestamp - b.timestamp);

            // Save to file
            fs.writeFileSync(filePath, JSON.stringify(uniqueData, null, 2));
            console.log(`Saved ${uniqueData.length} candles for ${symbol} ${timeframe}`);
            
            return uniqueData;
        } catch (error) {
            console.error(`Error fetching data for ${symbol} ${timeframe}: ${error.message}`);
            if (existingData.length > 0) {
                console.log(`Returning cached data for ${symbol} ${timeframe}`);
                return existingData;
            }
            throw error;
        }
    }

    async fetchAllTimeframes(symbol, startTime) {
        const timeframes = ['15m', '1h', '4h'];
        const results = {};

        for (const timeframe of timeframes) {
            console.log(`Fetching ${timeframe} data for ${symbol}...`);
            results[timeframe] = await this.fetchHistoricalData(symbol, timeframe, startTime);
            console.log(`Completed fetching ${timeframe} data for ${symbol}`);
        }

        return results;
    }
}

module.exports = DataFetcher;
