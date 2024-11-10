const tf = require('@tensorflow/tfjs-node');
const DataProcessor = require('./data_processor');

class ModelTrainer {
    constructor() {
        this.model = null;
        this.featureNames = null;
        this.featureImportance = null;
    }

    // 创建模型架构
    createModel(inputShape) {
        const model = tf.sequential();
        
        // 输入层
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [inputShape]
        }));
        
        // 添加Dropout以防止过拟合
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // 隐藏层
        model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // 输出层 - 使用sigmoid激活函数输出0-1之间的概率
        model.add(tf.layers.dense({
            units: 1,
            activation: 'sigmoid'
        }));
        
        // 编译模型
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        
        return model;
    }

    // 标准化数据
    normalizeData(data) {
        const mean = data.mean(0);
        const std = data.std(0);
        // 防止除以0，添加一个小的epsilon值
        const epsilon = tf.scalar(1e-7);
        const normalizedData = data.sub(mean).div(std.add(epsilon));
        return { normalizedData, mean, std };
    }

    // 准备训练数据
    prepareData(features, labels) {
        // 保存特征名称
        this.featureNames = Object.keys(features[0]);
        
        // 转换特征为张量
        const featureArray = features.map(f => Object.values(f));
        const xs = tf.tensor2d(featureArray);
        
        // 转换标签为张量
        const ys = tf.tensor2d(labels, [labels.length, 1]);
        
        // 标准化特征
        const { normalizedData, mean, std } = this.normalizeData(xs);
        
        return {
            xs: normalizedData,
            ys,
            dataMean: mean,
            dataStd: std
        };
    }

    // 训练模型
    async trainModel(features, labels) {
        console.log('准备训练数据...');
        const { xs, ys, dataMean, dataStd } = this.prepareData(features, labels);
        
        console.log('创建模型...');
        this.model = this.createModel(this.featureNames.length);
        
        // 划分训练集和验证集
        const splitIdx = Math.floor(features.length * 0.8);
        const trainXs = xs.slice([0, 0], [splitIdx, -1]);
        const trainYs = ys.slice([0, 0], [splitIdx, -1]);
        const valXs = xs.slice([splitIdx, 0], [-1, -1]);
        const valYs = ys.slice([splitIdx, 0], [-1, -1]);
        
        console.log('开始训练模型...');
        const history = await this.model.fit(trainXs, trainYs, {
            epochs: 50,
            batchSize: 32,
            validationData: [valXs, valYs],
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}, val_loss = ${logs.val_loss.toFixed(4)}, val_accuracy = ${logs.val_acc.toFixed(4)}`);
                }
            }
        });

        // 计算特征重要性
        console.log('计算特征重要性...');
        await this.calculateFeatureImportance(xs, ys);

        return {
            model: this.model,
            history,
            featureImportance: this.featureImportance,
            normalization: { dataMean, dataStd }
        };
    }

    // 计算特征重要性
    async calculateFeatureImportance(xs, ys) {
        const baselinePred = this.model.predict(xs);
        const baselineLoss = tf.metrics.binaryCrossentropy(ys, baselinePred);
        const baselineLossValue = await baselineLoss.data();
        
        this.featureImportance = [];
        
        // 对每个特征
        for (let i = 0; i < this.featureNames.length; i++) {
            // 打乱该特征的值
            const shuffledXs = xs.clone();
            const col = shuffledXs.slice([0, i], [-1, 1]);
            const shuffledCol = tf.randomShuffle(col);
            shuffledXs.slice([0, i], [-1, 1]).assign(shuffledCol);
            
            // 计算新的预测和损失
            const newPred = this.model.predict(shuffledXs);
            const newLoss = tf.metrics.binaryCrossentropy(ys, newPred);
            const newLossValue = await newLoss.data();
            
            // 特征重要性 = 打乱后损失 - 基准损失
            const importance = newLossValue[0] - baselineLossValue[0];
            
            this.featureImportance.push({
                feature: this.featureNames[i],
                importance: importance
            });

            // 清理内存
            shuffledXs.dispose();
            col.dispose();
            shuffledCol.dispose();
            newPred.dispose();
            newLoss.dispose();
        }
        
        // 清理内存
        baselinePred.dispose();
        baselineLoss.dispose();
        
        // 按重要性排序
        this.featureImportance.sort((a, b) => b.importance - a.importance);
    }

    // 预测单个样本
    async predict(features) {
        if (!this.model) {
            throw new Error('Model not trained yet');
        }
        
        const featureArray = [Object.values(features)];
        const xs = tf.tensor2d(featureArray);
        
        const prediction = this.model.predict(xs);
        const probability = await prediction.data();
        
        // 清理内存
        xs.dispose();
        prediction.dispose();
        
        return probability[0];
    }

    // 保存模型
    async saveModel(path) {
        if (!this.model) {
            throw new Error('No model to save');
        }
        await this.model.save(`file://${path}`);
    }

    // 加载模型
    async loadModel(path) {
        this.model = await tf.loadLayersModel(`file://${path}`);
        return this.model;
    }

    // 清理资源
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

module.exports = ModelTrainer;
