const DataFetcher = require('./fetcher');
const DataProcessor = require('./data_processor');
const ModelTrainer = require('./model_trainer');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // 加载已训练的模型
        const modelDir = path.join(process.cwd(), 'data', 'model');
        const trainingDataPath = path.join(process.cwd(), 'data', 'training_data.json');
        
        const trainer = new ModelTrainer();
        console.log('加载已训练模型...');
        const modelLoaded = await trainer.loadModel(modelDir, trainingDataPath);
        
        if (!modelLoaded) {
            console.error('无法加载模型，请确保已完成训练');
            return;
        }

        // 获取最新数据进行预测
        const fetcher = new DataFetcher();
        const endTime = Date.now();
        const startTime = moment(endTime).subtract(1, 'day').valueOf(); // 获取最近一天的数据
        const symbol = 'SOL-USDT-SWAP';

        console.log('获取最新K线数据...');
        const rawData = await fetcher.fetchAllTimeframes(symbol, startTime);
        const candleData = rawData['15m'];
        
        if (candleData.length === 0) {
            console.log('没有获取到最新数据');
            return;
        }

        // 准备最新的K线数据
        const { features } = DataProcessor.prepareTrainingData([candleData[candleData.length - 1]]);
        
        if (features.length === 0) {
            console.log('无法计算技术指标，可能数据不足');
            return;
        }

        // 预测当前时间点的盈利机会
        const probability = await trainer.predict(features[0]);
        const currentPrice = candleData[candleData.length - 1].close;
        
        console.log('\n=== 预测结果 ===');
        console.log('当前时间:', moment(candleData[candleData.length - 1].timestamp).format('YYYY-MM-DD HH:mm:ss'));
        console.log('当前价格:', currentPrice);
        console.log('预测在未来1小时内涨幅超过1%的概率:', (probability * 100).toFixed(2) + '%');
        
        // 输出预测建议
        if (probability >= 0.7) {
            console.log('\n建议: 强烈做多信号');
            console.log('- 预期目标: 1%涨幅');
            console.log('- 止损设置: 0.5%跌幅');
            console.log('- 建议仓位: 100U');
            console.log('- 杠杆倍数: 100倍');
        } else if (probability >= 0.5) {
            console.log('\n建议: 可能的做多机会');
            console.log('- 建议观察市场变化');
            console.log('- 等待更强的信号');
        } else {
            console.log('\n建议: 不建议做多');
            console.log('- 当前不适合开仓');
            console.log('- 建议等待更好的机会');
        }

        // 输出技术指标值
        console.log('\n当前技术指标:');
        Object.entries(features[0]).forEach(([indicator, value]) => {
            console.log(`${indicator}: ${value.toFixed(4)}`);
        });

        // 加载训练数据以获取特征重要性
        if (fs.existsSync(trainingDataPath)) {
            const trainingData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf-8'));
            if (trainingData.modelResults && trainingData.modelResults.featureImportance) {
                console.log('\n特征重要性排名:');
                trainingData.modelResults.featureImportance.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.feature}: ${item.importance.toFixed(4)}`);
                });
            }
        }

        // 清理资源
        trainer.dispose();

    } catch (error) {
        console.error('预测错误:', error);
    }
}

main();
