import fs from 'fs';
import { ding } from './ding.js';

class Logger {
    constructor() {
        this.logFile = `trades_${new Date().toISOString()}.csv`;
        this.lastStatsPrint = Date.now();
        this.statsPrintInterval =  60 * 60 * 1000; // 每5分钟打印一次统计
        this.initLogFile();
    }

    initLogFile() {
        const headers = [
            'Date',
            'Type',
            'Entry Price',
            'Exit Price',
            'Size',
            'Leverage',
            'Profit',
            'Fees',
            'Net Profit',
            'Balance',
            'Reason'
        ].join(',');
        
        fs.writeFileSync(this.logFile, headers + '\n');
        console.log('交易日志文件已创建:', this.logFile);
    }

    async logTrade(trade, balance) {
        const logEntry = [
            trade.closeTime,
            trade.type,
            trade.entryPrice,
            trade.exitPrice,
            trade.size,
            trade.leverage,
            trade.profit.toFixed(2),
            trade.fees.toFixed(2),
            trade.netProfit.toFixed(2),
            balance.toFixed(2),
            trade.reason
        ].join(',');

        fs.appendFileSync(this.logFile, logEntry + '\n');

        // 交易信息
        const tradeInfo = `
=== 交易完成 ===
时间: ${new Date(trade.closeTime).toLocaleString()}
类型: ${trade.type}
开仓价: ${trade.entryPrice}
平仓价: ${trade.exitPrice}
收益: ${trade.profit.toFixed(2)} USDT
手续费: ${trade.fees.toFixed(2)} USDT
净收益: ${trade.netProfit.toFixed(2)} USDT
当前余额: ${balance.toFixed(2)} USDT
平仓原因: ${trade.reason}
================
        `;

        console.log(tradeInfo);
        
        // 发送钉钉通知
        await ding(tradeInfo);
    }

    async logStatistics(trades) {
        const totalTrades = trades.length;
        const profitableTrades = trades.filter(t => t.netProfit > 0).length;
        const totalProfit = trades.reduce((sum, t) => sum + t.netProfit, 0);
        const winRate = (profitableTrades / totalTrades * 100).toFixed(2);
        const avgProfit = totalTrades > 0 ? (totalProfit / totalTrades).toFixed(2) : '0.00';

        const stats = `
=== 交易统计 ===
总交易次数: ${totalTrades}
盈利交易数: ${profitableTrades}
亏损交易数: ${totalTrades - profitableTrades}
胜率: ${winRate}%
总盈亏: ${totalProfit.toFixed(2)} USDT
平均每笔盈亏: ${avgProfit} USDT
===============
        `;

        console.log(stats);
        fs.writeFileSync('trading_statistics.txt', stats);
        
        // 发送钉钉统计通知
        await ding(stats);
    }

    // 检查是否需要打印统计信息
    async checkAndPrintStats(trades) {
        const now = Date.now();
        if (now - this.lastStatsPrint >= this.statsPrintInterval) {
            await this.logStatistics(trades);
            this.lastStatsPrint = now;
        }
    }
}

export default Logger; 