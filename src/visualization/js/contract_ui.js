class ContractUI {
    constructor() {
        this.chart = echarts.init(document.getElementById('mainChart'));
        this.dateRange = null;
        this.initializeDatePicker();
        this.setupEventListeners();
    }

    initializeDatePicker() {
        this.dateRange = flatpickr("#dateRange", {
            mode: "range",
            enableTime: true,
            dateFormat: "Y-m-d H:i",
            time_24hr: true,
            maxDate: new Date(),
            defaultDate: [
                moment().subtract(7, 'days').toDate(),
                new Date()
            ]
        });
    }

    setupEventListeners() {
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                window.app.updateChartIndicators();
            });
        });

        window.addEventListener('resize', () => {
            this.chart.resize();
        });
    }

    getChartOption() {
        return {
            animation: false,
            legend: {
                data: ['K线', 'MA5', 'MA10', 'MA20', 'BB上轨', 'BB中轨', 'BB下轨', '做多标记', '做空标记']
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: (params) => {
                    const date = new Date(params[0].value[0]);
                    let result = `${date.toLocaleString()}<br/>`;
                    params.forEach(param => {
                        if (param.seriesName === 'K线') {
                            result += `开盘: ${param.value[1]}<br/>`;
                            result += `收盘: ${param.value[2]}<br/>`;
                            result += `最低: ${param.value[3]}<br/>`;
                            result += `最高: ${param.value[4]}<br/>`;
                        } else {
                            result += `${param.seriesName}: ${param.value[1]?.toFixed(4) || param.value}<br/>`;
                        }
                    });
                    return result;
                }
            },
            grid: {
                left: '10%',
                right: '10%',
                bottom: '15%'
            },
            xAxis: {
                type: 'time',
                scale: true
            },
            yAxis: {
                scale: true,
                splitArea: { show: true }
            },
            dataZoom: [
                {
                    type: 'inside',
                    start: 50,
                    end: 100
                },
                {
                    show: true,
                    type: 'slider',
                    bottom: '5%'
                }
            ]
        };
    }

    updateStats(feedbacks, totalCandles) {
        const totalFeedbacks = feedbacks.length;
        const longCount = feedbacks.filter(f => f.action === 'long').length;
        const shortCount = feedbacks.filter(f => f.action === 'short').length;
        const coverage = totalCandles ? 
            ((totalFeedbacks / totalCandles) * 100).toFixed(2) : 0;

        document.getElementById('totalFeedbacks').textContent = totalFeedbacks;
        document.getElementById('longCount').textContent = longCount;
        document.getElementById('shortCount').textContent = shortCount;
        document.getElementById('coverage').textContent = coverage + '%';

        this.updateFeedbackList(feedbacks);
    }

    updateFeedbackList(feedbacks) {
        const list = document.getElementById('feedbackList');
        list.innerHTML = feedbacks.map(feedback => `
            <div class="feedback-item ${feedback.action === 'long' ? 'long' : 'short'}">
                <div><strong>时间:</strong> ${new Date(feedback.timestamp).toLocaleString()}</div>
                <div><strong>价格:</strong> ${feedback.price}</div>
                <div><strong>操作:</strong> ${feedback.action === 'long' ? '开多/平空' : '开空/平多'}</div>
            </div>
        `).join('');
    }

    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
    }

    showError(message) {
        alert(message);
    }

    updateTrainStatus(message) {
        const status = document.getElementById('trainStatus');
        status.textContent = message;
        if (message === '模型训练完成！') {
            setTimeout(() => status.textContent = '', 3000);
        }
    }

    getSelectedTimeRange() {
        return this.dateRange.selectedDates;
    }

    getSelectedIndicators() {
        return {
            showMA: document.getElementById('showMA').checked,
            showBB: document.getElementById('showBB').checked,
            showMACD: document.getElementById('showMACD').checked,
            showRSI: document.getElementById('showRSI').checked
        };
    }

    getTimeframe() {
        return document.getElementById('timeframe').value;
    }
}

window.ContractUI = ContractUI;
