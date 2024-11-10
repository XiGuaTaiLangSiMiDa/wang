class ContractApp {
    constructor() {
        this.ui = new ContractUI();
        this.dataLoader = new ContractData();
        this.currentData = null;
        this.indicators = null;
    }

    async loadData() {
        this.ui.showLoading();

        try {
            const [startDate, endDate] = this.ui.getSelectedTimeRange();
            const timeframe = this.ui.getTimeframe();
            
            const data = await this.dataLoader.loadData(startDate, endDate, timeframe);
            this.currentData = data;
            this.indicators = new ContractIndicators(data.candleData);
            
            // 初始化图表
            const option = this.ui.getChartOption();
            option.series = this.indicators.getSeriesData(
                this.ui.getSelectedIndicators().showMA,
                this.ui.getSelectedIndicators().showBB,
                this.dataLoader.getFeedbackData()
            );

            this.ui.chart.setOption(option);
            this.updateStats();
        } catch (error) {
            this.ui.showError(error.message);
        } finally {
            this.ui.hideLoading();
        }
    }

    updateChartIndicators() {
        if (!this.currentData || !this.indicators) return;

        // 获取当前图表配置
        const option = this.ui.chart.getOption();
        const { showMA, showBB } = this.ui.getSelectedIndicators();

        // 更新技术指标系列
        option.series = this.indicators.getSeriesData(
            showMA,
            showBB,
            this.dataLoader.getFeedbackData()
        );

        // 保持当前缩放状态
        const dataZoom = option.dataZoom;
        this.ui.chart.setOption({
            series: option.series,
            dataZoom: dataZoom
        });
    }

    async addFeedback(action, timestamp) {
        try {
            const candle = this.currentData.candleData.find(c => c.timestamp === timestamp);
            if (!candle) return;

            const feedback = {
                timestamp,
                action,
                price: candle.close
            };

            await this.dataLoader.submitFeedback(feedback);
            
            // 获取当前图表配置
            const option = this.ui.chart.getOption();
            
            // 只更新标记点系列
            const feedbacks = this.dataLoader.getFeedbackData();
            const longMarkers = feedbacks.filter(f => f.action === 'long').map(f => ({
                value: [f.timestamp, this.currentData.candleData.find(c => c.timestamp === f.timestamp)?.high || 0],
                itemStyle: { color: '#28a745' },
                symbol: 'arrow',
                symbolSize: 15,
                symbolRotate: 180
            }));
            const shortMarkers = feedbacks.filter(f => f.action === 'short').map(f => ({
                value: [f.timestamp, this.currentData.candleData.find(c => c.timestamp === f.timestamp)?.low || 0],
                itemStyle: { color: '#dc3545' },
                symbol: 'arrow',
                symbolSize: 15
            }));

            // 找到并更新标记点系列
            const longIndex = option.series.findIndex(s => s.name === '做多标记');
            const shortIndex = option.series.findIndex(s => s.name === '做空标记');

            if (longIndex !== -1 && shortIndex !== -1) {
                // 只更新标记点系列，保持其他系列不变
                this.ui.chart.setOption({
                    series: [
                        {
                            name: '做多标记',
                            type: 'scatter',
                            data: longMarkers
                        },
                        {
                            name: '做空标记',
                            type: 'scatter',
                            data: shortMarkers
                        }
                    ]
                });
            }

            this.updateStats();
        } catch (error) {
            this.ui.showError(error.message);
        }
    }

    updateStats() {
        if (!this.currentData) return;
        
        this.ui.updateStats(
            this.dataLoader.getFeedbackData(),
            this.currentData.candleData.length
        );
    }

    async trainModel() {
        this.ui.updateTrainStatus('正在训练模型...');

        try {
            await this.dataLoader.trainModel();
            this.ui.updateTrainStatus('模型训练完成！');
        } catch (error) {
            this.ui.updateTrainStatus(error.message);
        }
    }
}

window.ContractApp = ContractApp;
