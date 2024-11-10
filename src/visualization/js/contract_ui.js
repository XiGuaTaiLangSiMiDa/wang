class ContractUI {
    constructor() {
        this.chart = echarts.init(document.getElementById('mainChart'));
        this.dateRange = null;
        this.selectedBar = null;
        this.actionButtons = null;
        this.initializeDatePicker();
        this.initializeActionButtons();
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

    initializeActionButtons() {
        // 创建操作按钮容器
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'action-buttons';
        buttonsContainer.id = 'actionButtons';

        // 创建做多按钮
        const longButton = document.createElement('button');
        longButton.className = 'action-button long-button';
        longButton.textContent = '开多/平空';
        longButton.onclick = () => {
            const timestamp = parseInt(this.selectedBar.dataset.timestamp);
            window.app.addFeedback('long', timestamp);
            this.hideActionButtons();
        };

        // 创建做空按钮
        const shortButton = document.createElement('button');
        shortButton.className = 'action-button short-button';
        shortButton.textContent = '开空/平多';
        shortButton.onclick = () => {
            const timestamp = parseInt(this.selectedBar.dataset.timestamp);
            window.app.addFeedback('short', timestamp);
            this.hideActionButtons();
        };

        // 创建取消按钮
        const cancelButton = document.createElement('button');
        cancelButton.className = 'action-button close-button';
        cancelButton.textContent = '取消';
        cancelButton.onclick = () => this.hideActionButtons();

        // 添加按钮到容器
        buttonsContainer.appendChild(longButton);
        buttonsContainer.appendChild(shortButton);
        buttonsContainer.appendChild(cancelButton);

        // 添加到图表容器
        document.getElementById('chartContainer').appendChild(buttonsContainer);
        this.actionButtons = buttonsContainer;
    }

    setupEventListeners() {
        // 监听技术指标切换
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                window.app.updateChartIndicators();
            });
        });

        // 监听图表点击
        this.chart.on('click', (params) => {
            if (params.componentType !== 'series') return;

            // 移除旧的选中标记
            if (this.selectedBar) {
                this.selectedBar.remove();
            }

            // 创建新的选中标记
            const bar = document.createElement('div');
            bar.className = 'selected-bar';
            bar.dataset.timestamp = params.value[0];

            // 获取点击位置的坐标
            const point = this.chart.convertToPixel({xAxisIndex: 0}, params.value);
            
            // 设置标记位置和高度
            bar.style.left = point[0] + 'px';
            bar.style.top = '0';
            bar.style.height = '100%';

            // 添加标记到图表容器
            document.getElementById('chartContainer').appendChild(bar);
            this.selectedBar = bar;

            // 显示操作按钮
            this.showActionButtons(point[0], point[1]);
        });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.chart.resize();
        });
    }

    showActionButtons(x, y) {
        if (this.actionButtons) {
            this.actionButtons.style.display = 'flex';
            this.actionButtons.style.left = (x + 20) + 'px';
            this.actionButtons.style.top = (y - 60) + 'px';
        }
    }

    hideActionButtons() {
        if (this.actionButtons) {
            this.actionButtons.style.display = 'none';
        }
        if (this.selectedBar) {
            this.selectedBar.remove();
            this.selectedBar = null;
        }
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
