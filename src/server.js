const express = require('express');
const path = require('path');
const moment = require('moment');
const fs = require('fs');
const DataFetcher = require('./fetcher');
const DataProcessor = require('./data_processor');
const ModelTrainer = require('./model_trainer');

const app = express();
app.use(express.json());

// 静态文件服务
app.use('/visualization', express.static(path.join(__dirname, 'visualization')));
app.use('/data', express.static(path.join(__dirname, '..', 'data')));
app.use('/', express.static(path.join(__dirname)));

// 加载模型
const trainer = new ModelTrainer();
const modelDir = path.join(__dirname, '..', 'data', 'model');
const trainingDataPath = path.join(__dirname, '..', 'data', 'training_data.json');

let featureImportance = [];
// 加载特征重要性数据
try {
    const trainingData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf-8'));
    if (trainingData.modelResults && trainingData.modelResults.featureImportance) {
        featureImportance = trainingData.modelResults.featureImportance;
    }
} catch (error) {
    console.error('加载特征重要性数据失败:', error);
}

// 初始化模型
async function initModel() {
    try {
        const modelLoaded = await trainer.loadModel(modelDir, trainingDataPath);
        if (!modelLoaded) {
            throw new Error('模型加载失败');
        }
        console.log('模型加载成功');
    } catch (error) {
        console.error('初始化模型失败:', error);
        process.exit(1);
    }
}

// 预测端点
app.post('/predict', async (req, res) => {
    try {
        const { timestamp } = req.body;
        if (!timestamp) {
            return res.status(400).json({ error: '缺少时间戳参数' });
        }

        // 获取历史数据
        const fetcher = new DataFetcher();
        const startTime = moment(timestamp).subtract(30, 'days').valueOf();
        const endTime = moment(timestamp).valueOf();
        
        console.log('获取历史数据...');
        const rawData = await fetcher.fetchAllTimeframes('SOL-USDT-SWAP', startTime);
        const candleData = rawData['15m'].filter(candle => candle.timestamp <= endTime);

        if (candleData.length === 0) {
            return res.status(404).json({ error: '没有找到指定时间点的数据' });
        }

        // 使用最后100根K线计算技术指标
        const recentCandles = candleData.slice(-100);
        console.log(`使用 ${recentCandles.length} 根K线计算技术指标`);

        // 准备预测数据
        const { features } = DataProcessor.prepareTrainingData(recentCandles);
        
        if (features.length === 0) {
            return res.status(400).json({ error: '无法计算技术指标，数据不足' });
        }

        // 获取最后一个时间点的特征进行预测
        const latestFeature = features[features.length - 1];
        const probability = await trainer.predict(latestFeature);
        const currentPrice = recentCandles[recentCandles.length - 1].close;

        // 返回预测结果
        res.json({
            timestamp: recentCandles[recentCandles.length - 1].timestamp,
            currentPrice,
            probability,
            indicators: latestFeature,
            featureImportance
        });

    } catch (error) {
        console.error('预测错误:', error);
        res.status(500).json({ error: '预测失败: ' + error.message });
    }
});

// 重定向根路径到预测页面
app.get('/', (req, res) => {
    res.redirect('/visualization/predict.html');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await initModel();
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('可用页面:');
    console.log(`- 预测页面: http://localhost:${PORT}/visualization/predict.html`);
    console.log(`- 训练分析: http://localhost:${PORT}/visualization/training_analysis.html`);
});
