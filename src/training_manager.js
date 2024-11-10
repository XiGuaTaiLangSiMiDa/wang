const tf = require('@tensorflow/tfjs-node');
const DataProcessor = require('./data_processor');
const fs = require('fs');
const path = require('path');

class TrainingManager {
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
        const { mean, variance } = tf.moments(data, 0);
        const std = tf.sqrt(variance.add(tf.scalar(1e-7))); // 添加小的epsilon防止除以0
        const normalizedData = data.sub(mean).div(std);
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

    // 计算特征重要性
    async calculateFeatureImportance(model, xs, ys) {
        const baselinePred = model.predict(xs);
        const baselineLoss = tf.mean(tf.losses.sigmoidCrossEntropy(ys, baselinePred));
        const baselineLossValue = await baselineLoss.array();

        const featureImportance = [];
        const values = xs.arraySync();
        
        // 对每个特征计算重要性
        for (let i = 0; i < this.featureNames.length; i++) {
            // 打乱特征列
            const shuffledValues = [...values];
            const column = shuffledValues.map(row => row[i]);
            for (let j = column.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [column[j], column[k]] = [column[k], column[j]];
            }
            shuffledValues.forEach((row, idx) => row[i] = column[idx]);
            
            // 计算新损失
            const shuffledXs = tf.tensor2d(shuffledValues);
            const newPred = model.predict(shuffledXs);
            const newLoss = tf.mean(tf.losses.sigmoidCrossEntropy(ys, newPred));
            const newLossValue = await newLoss.array();
            
            // 特征重要性 = 打乱后损失 - 基准损失
            featureImportance.push({
                feature: this.featureNames[i],
                importance: newLossValue - baselineLossValue
            });
            
            // 清理内存
            shuffledXs.dispose();
            newPred.dispose();
            newLoss.dispose();
        }
        
        // 清理内存
        baselinePred.dispose();
        baselineLoss.dispose();
        
        // 按重要性排序
        return featureImportance.sort((a, b) => b.importance - a.importance);
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
        this.featureImportance = await this.calculateFeatureImportance(this.model, xs, ys);

        // 清理内存
        trainXs.dispose();
        trainYs.dispose();
        valXs.dispose();
        valYs.dispose();

        return {
            model: this.model,
            history,
            featureImportance: this.featureImportance,
            normalization: { dataMean, dataStd }
        };
    }

    // 保存模型和训练结果
    async saveResults(modelDir, trainingData) {
        if (!this.model) {
            throw new Error('No model to save');
        }

        // 确保目录存在
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        // 保存模型
        await this.model.save(`file://${modelDir}`);
        console.log(`模型已保存至: ${modelDir}`);

        // 保存训练数据和结果
        const outputPath = path.join(path.dirname(modelDir), 'training_data.json');
        fs.writeFileSync(outputPath, JSON.stringify(trainingData, null, 2));
        console.log(`训练数据已保存至: ${outputPath}`);
    }

    // 清理资源
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

module.exports = TrainingManager;
