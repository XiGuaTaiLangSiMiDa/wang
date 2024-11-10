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

// 分析市场条件
function analyzeMarketConditions(features) {
    const conditions = {
        trendStrength: 0,
        volatility: 0,
        volume: 0,
        momentum: 0
    };

    // 分析趋势强度
    if (features.bbPosition > 0.7) conditions.trendStrength += 1;
    if (features.macdHistogram > 0) conditions.trendStrength += 1;
    if (features.rsi > 50) conditions.trendStrength += 1;

    // 分析波动性
    if (features.bbWidth > 0.02) conditions.volatility += 1;
    if (features.highLowRange > 0.005) conditions.volatility += 1;

    // 分析成交量
    if (features.volumeTrend > 1.2) conditions.volume += 1;
    if (features.volumeProfile > 0.6) conditions.volume += 1;

    // 分析动量
    if (features.momentum > 100) conditions.momentum += 1;
    if (features.priceChange > 0) conditions.momentum += 1;

    return conditions;
}

// 生成详细建议
function generateDetailedRecommendation(probability, conditions, currentPrice) {
    const recommendation = {
        signal: '',
        confidence: '',
        details: [],
        riskLevel: '',
        stopLoss: 0,
        takeProfit: 0,
        position: 0,
        leverage: 0
    };

    // 基础止损止盈设置
    const baseStopLoss = 0.005; // 0.5%
    const baseTakeProfit = 0.01; // 1%

    // 根据概率和市场条件调整建议
    if (probability >= 0.6) {
        const totalScore = Object.values(conditions).reduce((a, b) => a + b, 0);
        
        if (totalScore >= 6 && probability >= 0.8) {
            recommendation.signal = '强烈做多信号';
            recommendation.confidence = '高';
            recommendation.position = 100;
            recommendation.leverage = 100;
            recommendation.stopLoss = baseStopLoss;
            recommendation.takeProfit = baseTakeProfit;
            recommendation.riskLevel = '中等';
            recommendation.details = [
                '多个技术指标显示强烈上涨趋势',
                '市场动量强劲',
                '成交量支撑趋势',
                '建议积极入场'
            ];
        } else if (totalScore >= 4) {
            recommendation.signal = '建议做多';
            recommendation.confidence = '中';
            recommendation.position = 70;
            recommendation.leverage = 75;
            recommendation.stopLoss = baseStopLoss * 1.2;
            recommendation.takeProfit = baseTakeProfit * 0.8;
            recommendation.riskLevel = '中低';
            recommendation.details = [
                '技术指标显示上涨趋势',
                '市场条件相对有利',
                '建议谨慎入场'
            ];
        } else {
            recommendation.signal = '观望为主，偏多';
            recommendation.confidence = '低';
            recommendation.position = 50;
            recommendation.leverage = 50;
            recommendation.stopLoss = baseStopLoss * 1.5;
            recommendation.takeProfit = baseTakeProfit * 0.7;
            recommendation.riskLevel = '低';
            recommendation.details = [
                '有上涨可能但信号不够强',
                '建议等待更好的入场点',
                '如需入场建议小仓位'
            ];
        }

        // 添加具体的市场分析
        if (conditions.trendStrength >= 2) recommendation.details.push('当前趋势较强');
        if (conditions.volatility >= 1) recommendation.details.push('市场波动适中');
        if (conditions.volume >= 1) recommendation.details.push('成交量支撑良好');
        if (conditions.momentum >= 1) recommendation.details.push('上涨动能充足');

        // 计算具体的价格点位
        recommendation.entryPrice = currentPrice;
        recommendation.stopLossPrice = currentPrice * (1 - recommendation.stopLoss);
        recommendation.takeProfitPrice = currentPrice * (1 + recommendation.takeProfit);
    } else {
        recommendation.signal = '不建议做多';
        recommendation.confidence = '低';
        recommendation.riskLevel = '高';
        recommendation.details = [
            '当前不适合做多',
            '建议等待更好的市场条件',
            '可以关注其他交易机会'
        ];
    }

    return recommendation;
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

        // 分析市场条件
        const marketConditions = analyzeMarketConditions(latestFeature);
        
        // 生成详细建议
        const recommendation = generateDetailedRecommendation(
            probability,
            marketConditions,
            currentPrice
        );

        // 返回预测结果
        res.json({
            timestamp: recentCandles[recentCandles.length - 1].timestamp,
            currentPrice,
            probability,
            indicators: latestFeature,
            featureImportance,
            marketConditions,
            recommendation
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
