const DataFetcher = require('./fetcher');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Calculate Bollinger Bands
function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const closes = data.map(candle => candle.close);
    
    // Calculate SMA
    const sma = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += closes[i - j];
        }
        sma.push(sum / period);
    }
    
    // Calculate Standard Deviation and Bands
    const bands = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            bands.push({
                middle: null,
                upper: null,
                lower: null
            });
            continue;
        }
        
        let sumSquaredDiff = 0;
        for (let j = 0; j < period; j++) {
            sumSquaredDiff += Math.pow(closes[i - j] - sma[i], 2);
        }
        const standardDeviation = Math.sqrt(sumSquaredDiff / period);
        
        bands.push({
            middle: sma[i],
            upper: sma[i] + (multiplier * standardDeviation),
            lower: sma[i] - (multiplier * standardDeviation)
        });
    }
    
    return bands;
}

// Backtest strategy
function backtest(candleData, bbands) {
    const initialCapital = 100; // 100 USDT
    const leverage = 100;
    const stopLossPercent = 0.5; // 50 USDT stop loss
    const takeProfitPercent = 1.0; // 100 USDT take profit
    
    let position = null;
    const trades = [];
    let cumulativeReturn = 0;
    
    for (let i = 0; i < candleData.length; i++) {
        const candle = candleData[i];
        const bb = bbands[i];
        
        // Skip if no BB data
        if (!bb.upper) continue;
        
        // Check for stop loss or take profit if in position
        if (position) {
            // For short positions, PnL is reversed: we profit when price goes down
            const pnlPercent = (position.entryPrice - candle.close) / position.entryPrice;
            
            // Check stop loss (-50% of capital = 0.5% price move against us at 100x leverage)
            if (pnlPercent <= -stopLossPercent/leverage) {
                const profit = initialCapital * leverage * pnlPercent;
                cumulativeReturn += profit;
                trades.push({
                    entryTime: moment(position.time).format('YYYY-MM-DD HH:mm:ss'),
                    entryPrice: position.entryPrice.toFixed(4),
                    exitTime: moment(candle.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                    exitPrice: candle.close.toFixed(4),
                    profit: profit.toFixed(2),
                    returnRate: (pnlPercent * 100).toFixed(2),
                    cumulativeReturn: cumulativeReturn.toFixed(2),
                    holdingPeriod: moment.duration(candle.timestamp - position.time).humanize(),
                    exitReason: 'Stop Loss'
                });
                position = null;
                continue;
            }
            
            // Check take profit (100% of capital = 1% price move in our favor at 100x leverage)
            if (pnlPercent >= takeProfitPercent/leverage) {
                const profit = initialCapital * leverage * pnlPercent;
                cumulativeReturn += profit;
                trades.push({
                    entryTime: moment(position.time).format('YYYY-MM-DD HH:mm:ss'),
                    entryPrice: position.entryPrice.toFixed(4),
                    exitTime: moment(candle.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                    exitPrice: candle.close.toFixed(4),
                    profit: profit.toFixed(2),
                    returnRate: (pnlPercent * 100).toFixed(2),
                    cumulativeReturn: cumulativeReturn.toFixed(2),
                    holdingPeriod: moment.duration(candle.timestamp - position.time).humanize(),
                    exitReason: 'Take Profit'
                });
                position = null;
                continue;
            }
        }
        
        // Check for entry if no position
        // Enter short when high price crosses above upper band
        if (!position && candle.high > bb.upper) {
            position = {
                time: candle.timestamp,
                entryPrice: candle.close,
                bbUpper: bb.upper
            };
        }
    }
    
    // Calculate statistics
    let totalProfit = 0;
    let winCount = 0;
    let totalHoldingTime = 0;
    
    trades.forEach(trade => {
        const profit = parseFloat(trade.profit);
        totalProfit += profit;
        if (profit > 0) winCount++;
        totalHoldingTime += moment(trade.exitTime).diff(moment(trade.entryTime), 'minutes');
    });
    
    const avgHoldingTime = trades.length > 0 ? totalHoldingTime / trades.length : 0;
    
    return {
        trades,
        metrics: {
            totalTrades: trades.length,
            winRate: trades.length > 0 ? (winCount / trades.length) * 100 : 0,
            totalProfit,
            profitPercent: (totalProfit / initialCapital) * 100,
            avgHoldingTimeMinutes: avgHoldingTime
        }
    };
}

async function main() {
    try {
        // Initialize fetcher
        const fetcher = new DataFetcher();

        // Calculate start time (180 days ago)
        const startTime = moment().subtract(180, 'days').valueOf();
        const symbol = 'SOL-USDT-SWAP';

        console.log('正在获取15分钟K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);

        // Process 15m data
        const candleData = rawData['15m'].map(candle => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));

        // Calculate Bollinger Bands
        console.log('计算布林带指标...');
        const bbands = calculateBollingerBands(candleData);

        // Run backtest
        console.log('执行做空回测...');
        const results = backtest(candleData, bbands);

        // Display results
        console.log('\n=== 做空回测结果 ===');
        console.log(`总交易次数: ${results.metrics.totalTrades}`);
        console.log(`胜率: ${results.metrics.winRate.toFixed(2)}%`);
        console.log(`总收益: ${results.metrics.totalProfit.toFixed(2)} USDT`);
        console.log(`收益率: ${results.metrics.profitPercent.toFixed(2)}%`);
        console.log(`平均持仓时间: ${(results.metrics.avgHoldingTimeMinutes / 60).toFixed(2)} 小时`);

        // Generate HTML table
        let tableHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>做空交易记录</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .profit { color: green; }
        .loss { color: red; }
    </style>
</head>
<body>
    <h2>做空交易记录</h2>
    <table>
        <tr>
            <th>开仓时间</th>
            <th>开仓价格</th>
            <th>平仓时间</th>
            <th>平仓价格</th>
            <th>收益(USDT)</th>
            <th>收益率(%)</th>
            <th>累计收益(USDT)</th>
            <th>持仓时间</th>
            <th>平仓原因</th>
        </tr>`;

        results.trades.forEach(trade => {
            const profitClass = parseFloat(trade.profit) >= 0 ? 'profit' : 'loss';
            tableHtml += `
        <tr>
            <td>${trade.entryTime}</td>
            <td>${trade.entryPrice}</td>
            <td>${trade.exitTime}</td>
            <td>${trade.exitPrice}</td>
            <td class="${profitClass}">${trade.profit}</td>
            <td class="${profitClass}">${trade.returnRate}%</td>
            <td class="${profitClass}">${trade.cumulativeReturn}</td>
            <td>${trade.holdingPeriod}</td>
            <td>${trade.exitReason}</td>
        </tr>`;
        });

        tableHtml += `
    </table>
    <h3>统计数据</h3>
    <p>总交易次数: ${results.metrics.totalTrades}</p>
    <p>胜率: ${results.metrics.winRate.toFixed(2)}%</p>
    <p>总收益: ${results.metrics.totalProfit.toFixed(2)} USDT</p>
    <p>收益率: ${results.metrics.profitPercent.toFixed(2)}%</p>
    <p>平均持仓时间: ${(results.metrics.avgHoldingTimeMinutes / 60).toFixed(2)} 小时</p>
</body>
</html>`;

        // Save HTML table
        const htmlPath = path.join(__dirname, 'visualization/short_trades.html');
        fs.writeFileSync(htmlPath, tableHtml);

        // Save visualization data for chart
        const visualizationData = {
            candleData: {
                '15m': candleData.map((candle, i) => ({
                    ...candle,
                    bb: bbands[i]
                }))
            },
            trades: results.trades,
            metrics: results.metrics
        };

        const visualizationPath = path.join(__dirname, 'visualization/latest_results_short.json');
        fs.writeFileSync(visualizationPath, JSON.stringify(visualizationData, null, 2));

        console.log(`\n数据已保存至: ${visualizationPath}`);
        console.log(`交易记录已保存至: ${htmlPath}`);

    } catch (error) {
        console.error('数据获取错误:', error);
    }
}

main();
