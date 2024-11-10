const DataFetcher = require('./fetcher');
const DataProcessor = require('./data_processor');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const fetcher = new DataFetcher();
        const startTime = moment().subtract(180, 'days').valueOf();
        const symbol = 'SOL-USDT-SWAP';

        console.log('获取训练数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);
        console.log(`获取到原始数据: ${rawData['15m'].length} 条K线记录`);

        const candleData = rawData['15m'];
        console.log('K线数据示例:', candleData[0]);

        console.log('准备训练数据...');
        const { features, labels, profitPoints } = DataProcessor.prepareTrainingData(candleData);

        // Calculate statistics
        const stats = DataProcessor.calculateStatistics(labels);
        
        console.log('\n=== 数据集统计 ===');
        console.log(`总样本数: ${stats.totalSamples}`);
        console.log(`正样本数 (可盈利机会): ${stats.positiveSamples}`);
        console.log(`正样本比例: ${stats.positiveRatio.toFixed(2)}%`);
        console.log(`基准准确率: ${(stats.baselineAccuracy * 100).toFixed(2)}%`);
        console.log(`盈利点数量: ${profitPoints.length}`);

        // Format candlestick data for visualization
        console.log('格式化K线数据用于可视化...');
        const formattedCandleData = DataProcessor.formatCandleData(candleData, profitPoints);

        // Save training data
        const outputPath = path.join(process.cwd(), 'data', 'training_data.json');
        const dataDir = path.join(process.cwd(), 'data');
        
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        const outputData = {
            features,
            labels,
            candleData: { '15m': formattedCandleData },
            metadata: {
                ...stats,
                targetReturn: '1%',
                lookAheadPeriod: '1小时',
                features: Object.keys(features[0])
            }
        };

        fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

        console.log(`\n训练数据已保存至: ${outputPath}`);
        console.log('数据文件大小:', (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2), 'MB');
        console.log('\n特征列表:');
        Object.keys(features[0]).forEach(feature => {
            console.log(`- ${feature}`);
        });

        // Verify the saved data
        console.log('\n验证保存的数据...');
        const savedData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        console.log('K线数据条数:', savedData.candleData['15m'].length);
        console.log('盈利机会数量:', savedData.candleData['15m'].filter(c => c.isProfit).length);

        console.log('\n可以通过以下步骤查看可视化结果:');
        console.log('1. 启动HTTP服务器 (例如: python -m http.server 8000)');
        console.log('2. 访问 http://localhost:8000/src/visualization/training_analysis.html');

    } catch (error) {
        console.error('错误:', error);
    }
}

main();
