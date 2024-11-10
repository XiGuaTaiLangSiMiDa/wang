const express = require('express');
const path = require('path');
const moment = require('moment');
const fs = require('fs');
const DataFetcher = require('./fetcher');
const ContractModel = require('./contract_model');

const app = express();
app.use(express.json());

// 配置静态文件服务
app.use('/visualization', express.static(path.join(__dirname, 'visualization'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.set('Content-Type', 'text/css');
        }
    }
}));
app.use('/data', express.static(path.join(__dirname, '..', 'data')));
app.use('/', express.static(path.join(__dirname)));

// 加载模型
const contractModel = new ContractModel();
const modelDir = path.join(__dirname, '..', 'data', 'contract_model');
const feedbackPath = path.join(__dirname, '..', 'data', 'contract_feedback.json');

let feedbackData = [];

// 加载反馈数据
try {
    if (fs.existsSync(feedbackPath)) {
        feedbackData = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
    }
} catch (error) {
    console.error('加载反馈数据失败:', error);
}

// 初始化模型
async function initModel() {
    try {
        if (fs.existsSync(path.join(modelDir, 'model.json'))) {
            const normalization = JSON.parse(
                fs.readFileSync(path.join(modelDir, 'normalization.json'), 'utf-8')
            );
            await contractModel.loadModel(modelDir, normalization);
            console.log('模型加载成功');
        }
    } catch (error) {
        console.error('初始化模型失败:', error);
    }
}

// 获取历史K线数据
async function fetchHistoricalData(endTime) {
    const fetcher = new DataFetcher();
    // 获取更多历史数据以确保有足够的数据计算指标
    const startTime = moment(endTime).subtract(60, 'days').valueOf();
    
    console.log('获取历史数据...');
    console.log(`时间范围: ${moment(startTime).format('YYYY-MM-DD HH:mm')} 到 ${moment(endTime).format('YYYY-MM-DD HH:mm')}`);
    
    const rawData = await fetcher.fetchAllTimeframes('SOL-USDT-SWAP', startTime);
    const candleData = rawData['15m'].filter(candle => candle.timestamp <= endTime);
    
    console.log(`获取到 ${candleData.length} 根K线数据`);
    return candleData;
}

// 预测端点
app.post('/predict', async (req, res) => {
    try {
        const { timestamp } = req.body;
        if (!timestamp) {
            return res.status(400).json({ error: '缺少时间戳参数' });
        }

        const candleData = await fetchHistoricalData(timestamp);

        if (candleData.length < 100) {
            return res.status(400).json({ error: '历史数据不足，无法计算技术指标' });
        }

        // 获取最近100个时间点的预测
        const predictions = [];
        const features = contractModel.prepareFeatures(candleData);
        
        for (let i = 0; i < features.length; i++) {
            const prediction = contractModel.predict(features[i]);
            predictions.push({
                timestamp: candleData[i + 99].timestamp,
                currentPrice: candleData[i + 99].close,
                probability: prediction[0], // 做多概率
                shortProbability: prediction[1], // 做空概率
                neutralProbability: prediction[2], // 观望概率
                action: prediction.indexOf(Math.max(...prediction)),
                confidence: Math.max(...prediction)
            });
        }

        res.json({
            candleData,
            predictions
        });

    } catch (error) {
        console.error('预测错误:', error);
        res.status(500).json({ error: '预测失败: ' + error.message });
    }
});

// 反馈端点
app.post('/feedback', (req, res) => {
    try {
        const feedback = req.body;
        if (!feedback.timestamp || !feedback.action) {
            return res.status(400).json({ error: '缺少必要参数' });
        }

        feedbackData.push({
            ...feedback,
            createdAt: Date.now()
        });

        fs.writeFileSync(feedbackPath, JSON.stringify(feedbackData, null, 2));
        res.json({ success: true });

    } catch (error) {
        console.error('保存反馈错误:', error);
        res.status(500).json({ error: '保存反馈失败: ' + error.message });
    }
});

// 获取反馈数据
app.get('/feedback', (req, res) => {
    res.json({ feedback: feedbackData });
});

// 训练模型
app.post('/retrain', async (req, res) => {
    try {
        if (feedbackData.length < 10) {
            return res.status(400).json({ error: '反馈数据不足，至少需要10个标记点' });
        }

        // 准备训练数据
        const trainingData = [];
        const labels = [];

        // 为每个反馈获取历史数据并计算特征
        for (const feedback of feedbackData) {
            const candleData = await fetchHistoricalData(feedback.timestamp);
            
            if (candleData.length >= 100) {
                const features = contractModel.prepareFeatures(candleData);
                if (features.length > 0) {
                    trainingData.push(features[features.length - 1]);
                    
                    // 转换为one-hot编码
                    const label = [0, 0, 0];
                    label[feedback.action === 'long' ? 0 : feedback.action === 'short' ? 1 : 2] = 1;
                    labels.push(label);
                }
            }
        }

        if (trainingData.length < 10) {
            return res.status(400).json({ error: '有效训练数据不足' });
        }

        // 训练模型
        console.log('开始训练模型...');
        console.log(`训练数据: ${trainingData.length} 条`);
        
        const history = await contractModel.train(trainingData, labels);

        // 保存模型
        const normalization = await contractModel.saveModel(modelDir);
        fs.writeFileSync(
            path.join(modelDir, 'normalization.json'),
            JSON.stringify(normalization, null, 2)
        );

        res.json({
            success: true,
            history: history.history
        });

    } catch (error) {
        console.error('训练错误:', error);
        res.status(500).json({ error: '训练失败: ' + error.message });
    }
});

// 重定向根路径到训练页面
app.get('/', (req, res) => {
    res.redirect('/visualization/contract_training.html');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await initModel();
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('可用页面:');
    console.log(`- 合约训练: http://localhost:${PORT}/visualization/contract_training.html`);
});
