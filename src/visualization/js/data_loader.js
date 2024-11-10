// 数据加载和处理
class DataLoader {
    constructor() {
        this.currentData = [];
        this.feedbackData = [];
    }

    // 加载数据
    async loadData(startDate, endDate, timeframe) {
        try {
            // 获取结束时间点的预测
            const response = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timestamp: endDate.getTime()
                })
            });

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            // 获取开始时间点的预测
            const historyResponse = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timestamp: startDate.getTime()
                })
            });

            const historyResult = await historyResponse.json();

            if (historyResult.error) {
                throw new Error(historyResult.error);
            }

            // 合并数据
            this.currentData = result.candleData['15m'];
            const predictions = result.predictions;

            return {
                candleData: this.currentData,
                predictions,
                featureImportance: result.featureImportance
            };

        } catch (error) {
            throw new Error('加载数据失败: ' + error.message);
        }
    }

    // 加载反馈数据
    async loadFeedback() {
        try {
            const response = await fetch('/feedback', {
                method: 'GET'
            });

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            this.feedbackData = result.feedback;
            return this.feedbackData;

        } catch (error) {
            throw new Error('加载反馈数据失败: ' + error.message);
        }
    }

    // 提交反馈
    async submitFeedback(feedback) {
        try {
            const response = await fetch('/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(feedback)
            });

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            // 更新本地反馈数据
            this.feedbackData.unshift(feedback);
            return true;

        } catch (error) {
            throw new Error('提交反馈失败: ' + error.message);
        }
    }

    // 重新训练模型
    async retrainModel() {
        try {
            const response = await fetch('/retrain', {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            return true;

        } catch (error) {
            throw new Error('重新训练失败: ' + error.message);
        }
    }

    // 获取当前数据
    getCurrentData() {
        return this.currentData;
    }

    // 获取反馈数据
    getFeedbackData() {
        return this.feedbackData;
    }
}

// 导出类
window.DataLoader = DataLoader;
