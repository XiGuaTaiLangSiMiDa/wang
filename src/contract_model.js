const tf = require('@tensorflow/tfjs-node');

class ContractModel {
    constructor() {
        this.model = null;
        this.normalization = null;
    }

    createModel(inputShape) {
        const model = tf.sequential();
        
        // 输入层
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [inputShape]
        }));
        
        model.add(tf.layers.dropout({ rate: 0.3 }));
        
        // 隐藏层1
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu'
        }));
        
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // 隐藏层2
        model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // 输出层 - 3个神经元分别表示做多、做空、不操作
        model.add(tf.layers.dense({
            units: 3,
            activation: 'softmax'
        }));
        
        // 编译模型
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        
        return model;
    }

    // 准备特征数据
    prepareFeatures(candleData) {
        const features = [];
        const requiredLength = 100; // 计算指标需要的最小K线数量
        
        // 确保有足够的历史数据计算指标
        if (candleData.length < requiredLength) {
            console.log(`数据长度不足: ${candleData.length} < ${requiredLength}`);
            return features;
        }

        // 从第100根K线开始计算特征
        for (let i = requiredLength - 1; i < candleData.length; i++) {
            const window = candleData.slice(i - (requiredLength - 1), i + 1);
            const feature = this.calculateFeatures(window);
            features.push(feature);
        }

        return features;
    }

    // 计算技术指标特征
    calculateFeatures(window) {
        const features = [];
        const current = window[window.length - 1];
        const prev = window[window.length - 2];

        try {
            // 价格变化
            features.push((current.close - prev.close) / prev.close); // 价格变化率
            features.push((current.high - current.low) / current.low); // 当前K线波动率
            features.push((current.volume - prev.volume) / prev.volume); // 成交量变化率

            // 移动平均线
            const ma5 = this.calculateMA(window, 5);
            const ma10 = this.calculateMA(window, 10);
            const ma20 = this.calculateMA(window, 20);
            features.push((current.close - ma5) / ma5); // 与MA5的偏离度
            features.push((current.close - ma10) / ma10); // 与MA10的偏离度
            features.push((current.close - ma20) / ma20); // 与MA20的偏离度
            features.push((ma5 - ma10) / ma10); // MA5与MA10的差距
            features.push((ma5 - ma20) / ma20); // MA5与MA20的差距

            // 布林带指标
            const bb = this.calculateBollingerBands(window);
            features.push((current.close - bb.middle) / bb.middle); // 价格相对中轨位置
            features.push((bb.upper - bb.lower) / bb.middle); // 带宽
            features.push((current.close - bb.lower) / (bb.upper - bb.lower)); // 价格在带中的相对位置

            // MACD指标
            const macd = this.calculateMACD(window);
            features.push(macd.macd); // MACD值
            features.push(macd.signal); // 信号线
            features.push(macd.histogram); // 柱状图
            features.push(macd.histogram - macd.prevHistogram); // 柱状图变化

            // RSI指标
            const rsi = this.calculateRSI(window);
            features.push(rsi / 100); // RSI值归一化
            features.push((rsi - 50) / 50); // RSI相对中值偏离度

            // 动量指标
            const momentum = this.calculateMomentum(window);
            features.push(momentum); // 动量值
            features.push(momentum - this.calculateMomentum(window.slice(0, -1))); // 动量变化

            // ATR指标
            const atr = this.calculateATR(window);
            features.push(atr / current.close); // ATR相对价格
            features.push(atr / this.calculateATR(window.slice(0, -1)) - 1); // ATR变化率

            // 成交量分析
            const volumeMA5 = this.calculateVolumeMA(window, 5);
            const volumeMA20 = this.calculateVolumeMA(window, 20);
            features.push(current.volume / volumeMA5); // 量相对5日均量
            features.push(current.volume / volumeMA20); // 量相对20日均量
            features.push(volumeMA5 / volumeMA20); // 短期量能相对长期量能

        } catch (error) {
            console.error('计算特征时出错:', error);
            throw new Error('计算技术指标失败');
        }

        return features;
    }

    // 计算移动平均线
    calculateMA(data, period) {
        const prices = data.slice(-period).map(d => d.close);
        return prices.reduce((sum, price) => sum + price, 0) / period;
    }

    // 计算布林带
    calculateBollingerBands(data) {
        const period = 20;
        const prices = data.slice(-period).map(d => d.close);
        const ma = prices.reduce((sum, price) => sum + price, 0) / period;
        
        const squaredDiffs = prices.map(price => Math.pow(price - ma, 2));
        const std = Math.sqrt(squaredDiffs.reduce((sum, diff) => sum + diff, 0) / period);
        
        return {
            upper: ma + (2 * std),
            middle: ma,
            lower: ma - (2 * std)
        };
    }

    // 计算MACD
    calculateMACD(data) {
        const closes = data.map(d => d.close);
        const shortPeriod = 12;
        const longPeriod = 26;
        const signalPeriod = 9;

        const shortEMA = this.calculateEMA(closes, shortPeriod);
        const longEMA = this.calculateEMA(closes, longPeriod);
        const macdLine = shortEMA - longEMA;
        const signalLine = this.calculateEMA([...Array(closes.length - longPeriod).fill(0), macdLine], signalPeriod);
        const histogram = macdLine - signalLine;

        // 计算前一个柱状图值用于计算变化
        const prevCloses = closes.slice(0, -1);
        const prevShortEMA = this.calculateEMA(prevCloses, shortPeriod);
        const prevLongEMA = this.calculateEMA(prevCloses, longPeriod);
        const prevMacdLine = prevShortEMA - prevLongEMA;
        const prevSignalLine = this.calculateEMA([...Array(prevCloses.length - longPeriod).fill(0), prevMacdLine], signalPeriod);
        const prevHistogram = prevMacdLine - prevSignalLine;

        return {
            macd: macdLine,
            signal: signalLine,
            histogram: histogram,
            prevHistogram: prevHistogram
        };
    }

    // 计算EMA
    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        let ema = data[0];
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i] * k) + (ema * (1 - k));
        }
        
        return ema;
    }

    // 计算RSI
    calculateRSI(data, period = 14) {
        const changes = [];
        for (let i = 1; i < data.length; i++) {
            changes.push(data[i].close - data[i - 1].close);
        }
        
        const gains = changes.map(c => c > 0 ? c : 0);
        const losses = changes.map(c => c < 0 ? -c : 0);
        
        const avgGain = gains.slice(-period).reduce((sum, g) => sum + g, 0) / period;
        const avgLoss = losses.slice(-period).reduce((sum, l) => sum + l, 0) / period;
        
        return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }

    // 计算成交量MA
    calculateVolumeMA(data, period) {
        const volumes = data.slice(-period).map(d => d.volume);
        return volumes.reduce((sum, vol) => sum + vol, 0) / period;
    }

    // 计算ATR
    calculateATR(data, period = 14) {
        const trs = [];
        for (let i = 1; i < data.length; i++) {
            const high = data[i].high;
            const low = data[i].low;
            const prevClose = data[i - 1].close;
            
            trs.push(Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            ));
        }
        
        return trs.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    }

    // 计算动量
    calculateMomentum(data, period = 10) {
        const current = data[data.length - 1].close;
        const past = data[data.length - 1 - period].close;
        return (current - past) / past;
    }

    // 标准化特征
    normalizeFeatures(features) {
        if (!this.normalization) {
            const featuresTensor = tf.tensor2d(features);
            const { mean, variance } = tf.moments(featuresTensor, 0);
            this.normalization = {
                mean: mean,
                std: tf.sqrt(variance.add(tf.scalar(1e-7)))
            };
            featuresTensor.dispose();
        }
        
        return tf.tidy(() => {
            const featuresTensor = tf.tensor2d(features);
            return featuresTensor.sub(this.normalization.mean)
                               .div(this.normalization.std);
        });
    }

    // 训练模型
    async train(features, labels, validationSplit = 0.2) {
        if (!this.model) {
            this.model = this.createModel(features[0].length);
        }

        const normalizedFeatures = this.normalizeFeatures(features);
        const labelsTensor = tf.tensor2d(labels);

        const history = await this.model.fit(normalizedFeatures, labelsTensor, {
            epochs: 100,
            batchSize: 32,
            validationSplit,
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}, val_loss = ${logs.val_loss.toFixed(4)}, val_accuracy = ${logs.val_acc.toFixed(4)}`);
                }
            }
        });

        normalizedFeatures.dispose();
        labelsTensor.dispose();

        return history;
    }

    // 预测
    predict(features) {
        return tf.tidy(() => {
            const normalizedFeatures = this.normalizeFeatures([features]);
            const predictions = this.model.predict(normalizedFeatures);
            return predictions.arraySync()[0];
        });
    }

    // 保存模型
    async saveModel(path) {
        if (!this.model) {
            throw new Error('No model to save');
        }
        await this.model.save(`file://${path}`);
        
        // 保存归一化参数
        const normalization = {
            mean: this.normalization.mean.arraySync(),
            std: this.normalization.std.arraySync()
        };
        
        return normalization;
    }

    // 加载模型
    async loadModel(path, normalization) {
        this.model = await tf.loadLayersModel(`file://${path}/model.json`);
        this.normalization = {
            mean: tf.tensor1d(normalization.mean),
            std: tf.tensor1d(normalization.std)
        };
    }

    // 清理资源
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
        if (this.normalization) {
            this.normalization.mean.dispose();
            this.normalization.std.dispose();
        }
    }
}

module.exports = ContractModel;
