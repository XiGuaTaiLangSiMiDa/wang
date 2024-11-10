// 计算准确率随时间变化
function calculateAccuracyOverTime(predictions, feedbackData) {
    const accuracyData = [];
    const windowSize = 20; // 滑动窗口大小

    for (let i = windowSize; i < predictions.length; i++) {
        const windowPredictions = predictions.slice(i - windowSize, i);
        const windowFeedback = feedbackData.filter(f => {
            const timestamp = f.timestamp;
            return timestamp >= windowPredictions[0].timestamp && 
                   timestamp <= windowPredictions[windowPredictions.length - 1].timestamp;
        });

        let correct = 0;
        let total = windowFeedback.length;
        
        windowFeedback.forEach(feedback => {
            const prediction = windowPredictions.find(p => p.timestamp === feedback.timestamp);
            if (prediction && 
                ((prediction.probability >= 0.6 && feedback.result) || 
                 (prediction.probability < 0.6 && !feedback.result))) {
                correct++;
            }
        });

        if (total > 0) {
            accuracyData.push([
                predictions[i].timestamp,
                (correct / total) * 100
            ]);
        }
    }

    return accuracyData;
}

// 计算信号分布
function calculateSignalDistribution(predictions) {
    const distribution = {
        '强烈做多': 0,
        '建议做多': 0,
        '观望为主': 0,
        '不建议做多': 0
    };

    predictions.forEach(p => {
        distribution[p.recommendation.signal]++;
    });

    return Object.entries(distribution).map(([name, value]) => ({
        name,
        value
    }));
}

// 计算性能趋势
function calculatePerformanceTrend(predictions, feedbackData) {
    const windowSize = 20;
    const accuracy = [];
    const returns = [];

    for (let i = windowSize; i < predictions.length; i++) {
        const windowPredictions = predictions.slice(i - windowSize, i);
        const windowFeedback = feedbackData.filter(f => {
            const timestamp = f.timestamp;
            return timestamp >= windowPredictions[0].timestamp && 
                   timestamp <= windowPredictions[windowPredictions.length - 1].timestamp;
        });

        let correct = 0;
        let totalReturn = 0;
        let total = windowFeedback.length;

        windowFeedback.forEach(feedback => {
            const prediction = windowPredictions.find(p => p.timestamp === feedback.timestamp);
            if (prediction) {
                if ((prediction.probability >= 0.6 && feedback.result) || 
                    (prediction.probability < 0.6 && !feedback.result)) {
                    correct++;
                }
                totalReturn += feedback.returnRate || 0;
            }
        });

        if (total > 0) {
            accuracy.push([
                predictions[i].timestamp,
                (correct / total) * 100
            ]);
            returns.push([
                predictions[i].timestamp,
                totalReturn / total
            ]);
        }
    }

    return { accuracy, returns };
}

// 更新统计信息
function updateStatistics(predictions, feedbackData) {
    let totalPredictions = feedbackData.length;
    let correctPredictions = 0;
    let totalReturn = 0;

    feedbackData.forEach(feedback => {
        const prediction = predictions.find(p => p.timestamp === feedback.timestamp);
        if (prediction) {
            if ((prediction.probability >= 0.6 && feedback.result) || 
                (prediction.probability < 0.6 && !feedback.result)) {
                correctPredictions++;
            }
            totalReturn += feedback.returnRate || 0;
        }
    });

    document.getElementById('totalPredictions').textContent = totalPredictions;
    document.getElementById('correctPredictions').textContent = correctPredictions;
    document.getElementById('accuracy').textContent = 
        totalPredictions > 0 ? ((correctPredictions / totalPredictions) * 100).toFixed(2) + '%' : '-';
    document.getElementById('avgReturn').textContent = 
        totalPredictions > 0 ? (totalReturn / totalPredictions).toFixed(2) + '%' : '-';

    // 更新预测历史记录
    const historyTable = document.getElementById('predictionHistory');
    historyTable.innerHTML = feedbackData.map(feedback => {
        const prediction = predictions.find(p => p.timestamp === feedback.timestamp);
        return prediction ? `
            <tr>
                <td>${new Date(feedback.timestamp).toLocaleString()}</td>
                <td>${prediction.recommendation.signal}</td>
                <td>${(prediction.probability * 100).toFixed(2)}%</td>
                <td>${feedback.result ? '盈利' : '亏损'}</td>
                <td>${feedback.returnRate.toFixed(2)}%</td>
            </tr>
        ` : '';
    }).join('');
}

// 导出函数
window.AnalysisUtils = {
    calculateAccuracyOverTime,
    calculateSignalDistribution,
    calculatePerformanceTrend,
    updateStatistics
};
