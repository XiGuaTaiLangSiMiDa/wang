const fs = require('fs');
const path = require('path');

// Debug function to inspect data structure
function inspectDataStructure(trades) {
    if (!trades || trades.length === 0) {
        console.log('No trades found');
        return;
    }

    const firstTrade = trades[0];
    console.log('\n=== Data Structure Inspection ===');
    console.log('First Trade Structure:');
    console.log(JSON.stringify(firstTrade, null, 2));

    if (firstTrade.entry) {
        console.log('\nEntry Indicators Structure:');
        console.log(JSON.stringify(firstTrade.entry.indicators, null, 2));
    }

    // Count trades with indicators
    const tradesWithIndicators = trades.filter(t => t.entry && t.entry.indicators).length;
    console.log(`\nTrades with indicators: ${tradesWithIndicators}/${trades.length}`);

    // Sample some indicator values
    const sampleIndicators = trades.slice(0, 5).map(trade => ({
        tradeNumber: trade.tradeNumber,
        profit: trade.profit,
        indicators: trade.entry?.indicators
    }));
    console.log('\nSample Indicators from first 5 trades:');
    console.log(JSON.stringify(sampleIndicators, null, 2));
}

// 读取交易数据
function loadTradeData() {
    try {
        const resultsPath = path.join(__dirname, 'visualization/latest_results.json');
        console.log('Loading data from:', resultsPath);
        
        if (!fs.existsSync(resultsPath)) {
            throw new Error('交易数据文件不存在');
        }
        
        const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        console.log('Data loaded successfully');
        
        return {
            trades: data.trades,
            candleData: data.candleData['15m']
        };
    } catch (error) {
        console.error('读取数据失败:', error.message);
        process.exit(1);
    }
}

// 主函数
async function main() {
    console.log('开始分析交易模式...');
    
    // 加载数据
    const { trades } = loadTradeData();
    
    // 检查数据结构
    inspectDataStructure(trades);
    
    // 如果需要继续执行其他分析，可以在这里添加
    
    console.log('\n数据结构检查完成。请根据输出调整分析逻辑。');
}

main().catch(console.error);
