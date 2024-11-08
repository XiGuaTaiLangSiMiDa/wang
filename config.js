export default {
    // 交易配置
    SYMBOL: 'SOL-USDT-SWAP',
    LEVERAGE: 100,
    POSITION_SIZE: 100, // USDT
    
    // 止盈止损配置
    STOP_LOSS_PERCENT: 0.01, // 1%
    TAKE_PROFIT_PERCENTS: [0.005, 0.01], // 0.5% 或 1%
    
    // 交易费率
    FEE_RATE: 0.07, // 7%
    
    // 技术指标时间周期 (分钟)
    TIMEFRAMES: [
        5, 15, 30, 45,        // 分钟级
        60, 120, 180, 240, 300, 480, 720,  // 小时级
        1440, 10080           // 天级
    ],
    
    // 技术指标参数
    BOLLINGER_PERIOD: 20,
    BOLLINGER_STD: 2,
    RSI_PERIOD: 14,
    RSI_OVERSOLD: 30,
    
    // 模拟/实盘切换
    TRADE_MODE: 'SIMULATION', // 'SIMULATION' 或 'LIVE'
    
    // OKE API配置
    API_KEY: 'your_api_key',
    API_SECRET: 'your_api_secret',
    PASSPHRASE: 'your_passphrase'
}; 