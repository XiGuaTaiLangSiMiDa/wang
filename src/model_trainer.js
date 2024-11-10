const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

class ModelTrainer {
    constructor() {
        this.model = null;
        this.featureNames = null;
        this.normalization = null;
    }

    // 标准化数据
    normalizeData(data, mean, std) {
        return data.sub(mean).div(std);
    }

    // 准备预测数据
    preparePredictionData(features) {
        // 保存特征名称
        this.featureNames = Object.keys(features[0]);
        
        // 转换特征为张量
        const featureArray = features.map(f => Object.values(f));
        const xs = tf.tensor2d(featureArray);
        
        return xs;
    }

    // 预测单个样本
    async predict(features) {
        if (!this.model) {
            throw new Error('Model not trained yet');
        }
        
        const xs = this.preparePredictionData([features]);
        
        // 如果有归一化参数，则使用它们
        let normalizedXs = xs;
        if (this.normalization) {
            normalizedXs = this.normalizeData(xs, this.normalization.mean, this.normalization.std);
        }
        
        const prediction = this.model.predict(normalizedXs);
        const probability = await prediction.array();
        
        // 清理内存
        xs.dispose();
        normalizedXs.dispose();
        prediction.dispose();
        
        return probability[0][0];
    }

    // 加载模型和归一化参数
    async loadModel(modelPath, normalizationPath) {
        try {
            // 加载模型
            this.model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
            console.log('模型加载成功');

            // 加载归一化参数
            if (normalizationPath && fs.existsSync(normalizationPath)) {
                const normData = JSON.parse(fs.readFileSync(normalizationPath, 'utf-8'));
                if (normData.modelResults && normData.modelResults.normalization) {
                    this.normalization = {
                        mean: tf.tensor1d(normData.modelResults.normalization.mean),
                        std: tf.tensor1d(normData.modelResults.normalization.std)
                    };
                    console.log('归一化参数加载成功');
                }
            }

            return true;
        } catch (error) {
            console.error('加载模型失败:', error);
            return false;
        }
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

module.exports = ModelTrainer;
