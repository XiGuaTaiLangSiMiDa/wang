// 使用 CommonJS 语法
const { config } = require('dotenv');
config();

module.exports = {
    // OKX API配置
    API_KEY: process.env.API_KEY,
    API_SECRET: process.env.API_SECRET,
    PASSPHRASE: process.env.PASSPHRASE,

    // 交易配置
    SYMBOL: 'SOL-USDT-SWAP',
    timeframes: {
        '15m': {
            middle: 1,
            lower: 2,
            upper: -2,
        },
        '1h': {
            middle: 2,
            lower: 4,
            upper: -4,
        },
        '4h': {
            middle: 3,
            lower: 6,
            upper: -6,
        }
    },
    leverage: 100,
    initialCapital: 100,
    period: 20,
    stdDev: 2
}; 