const DataFetcher = require('./fetcher');
const DataProcessor = require('./data_processor');
const TrainingManager = require('./training_manager');
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

        // Train model
        console.log('\n=== 开始训练模型 ===');
        const trainer = new TrainingManager();
        const { model, history, featureImportance, normalization } = await trainer.trainModel(features, labels);

        console.log('\n=== 特征重要性排名 ===');
        featureImportance.forEach((item, index) => {
            console.log(`${index + 1}. ${item.feature}: ${item.importance.toFixed(4)}`);
        });

        // Format candlestick data for visualization
        console.log('\n格式化K线数据用于可视化...');
        const formattedCandleData = DataProcessor.formatCandleData(candleData, profitPoints);

        // Prepare output data
        const outputData = {
            features,
            labels,
            candleData: { '15m': formattedCandleData },
            metadata: {
                ...stats,
                targetReturn: '1%',
                lookAheadPeriod: '1小时',
                features: Object.keys(features[0])
            },
            modelResults: {
                featureImportance,
                trainingHistory: history.history,
                normalization: {
                    mean: normalization.dataMean.arraySync(),
                    std: normalization.dataStd.arraySync()
                }
            }
        };

        // Save model and results
        const modelDir = path.join(process.cwd(), 'data', 'model');
        await trainer.saveResults(modelDir, outputData);

        // Print final metrics
        console.log('\n=== 模型训练结果 ===');
        const lastEpoch = history.history;
        console.log(`训练集准确率: ${(lastEpoch.acc[lastEpoch.acc.length - 1] * 100).toFixed(2)}%`);
        console.log(`验证集准确率: ${(lastEpoch.val_acc[lastEpoch.val_acc.length - 1] * 100).toFixed(2)}%`);
        console.log(`训练集损失: ${lastEpoch.loss[lastEpoch.loss.length - 1].toFixed(4)}`);
        console.log(`验证集损失: ${lastEpoch.val_loss[lastEpoch.val_loss.length - 1].toFixed(4)}`);

        console.log('\n可以通过以下步骤查看可视化结果:');
        console.log('1. 启动HTTP服务器 (例如: python -m http.server 8000)');
        console.log('2. 访问 http://localhost:8000/src/visualization/training_analysis.html');

        // Clean up
        trainer.dispose();

    } catch (error) {
        console.error('错误:', error);
    }
}

main();
