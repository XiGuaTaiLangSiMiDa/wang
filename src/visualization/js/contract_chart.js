class ContractChart {
    constructor() {
        this.mainChart = echarts.init(document.getElementById('mainChart'));
        this.volumeChart = echarts.init(document.getElementById('volumeChart'));
        this.indicatorChart = echarts.init(document.getElementById('indicatorChart'));
        this.selectedBar = null;
        
        // 设置图表联动
        echarts.connect([this.mainChart, this.volumeChart, this.indicatorChart]);

        // 监听点击事件
        this.mainChart.on('click', this.handleChartClick.bind(this));
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.mainChart.resize();
            this.volumeChart.resize();
            this.indicatorChart.resize();
        });

        // 初始化操作按钮
        this.initActionButtons();
    }

    initActionButtons() {
        // 创建操作按钮容器
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'action-buttons';
        buttonsContainer.id = 'actionButtons';

        // 创建做多按钮
        const longButton = document.createElement('button');
        longButton.className = 'action-button long-button';
        longButton.textContent = '开多/平空';
        longButton.onclick = () => this.handleAction('long');

        // 创建做空按钮
        const shortButton = document.createElement('button');
        shortButton.className = 'action-button short-button';
        shortButton.textContent = '开空/平多';
        shortButton.onclick = () => this.handleAction('short');

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
    }

    handleChartClick(params) {
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
        const point = this.mainChart.convertToPixel({xAxisIndex: 0}, params.value);
        
        // 设置标记位置和高度
        bar.style.left = point[0] + 'px';
        bar.style.top = '0';
        bar.style.height = '100%';

        // 添加标记到图表容器
        document.getElementById('chartContainer').appendChild(bar);
        this.selectedBar = bar;

        // 显示操作按钮
        this.showActionButtons(point[0], point[1]);
    }

    showActionButtons(x, y) {
        const buttons = document.getElementById('actionButtons');
        if (buttons) {
            buttons.style.display = 'flex';
            buttons.style.left = (x + 20) + 'px';
            buttons.style.top = (y - 60) + 'px';
        }
    }

    hideActionButtons() {
        const buttons = document.getElementById('actionButtons');
        if (buttons) {
            buttons.style.display = 'none';
        }
        if (this.selectedBar) {
            this.selectedBar.remove();
            this.selectedBar = null;
        }
    }

    handleAction(action) {
        if (!this.selectedBar) return;

        const timestamp = parseInt(this.selectedBar.dataset.timestamp);
        window.app.addFeedback(action, timestamp);
        this.hideActionButtons();
    }

    updateCharts(candleData, feedbacks, options) {
        this.updateMainChart(candleData, feedbacks, options);
        this.updateVolumeChart(candleData);
        this.updateIndicatorChart(candleData, options);
    }

    updateMainChart(candleData, feedbacks, options) {
        const series = [
            {
                name: 'K线',
                type: 'candlestick',
                data: candleData.map(candle => [
                    candle.timestamp,
                    candle.open,
                    candle.close,
                    candle.low,
                    candle.high
                ])
            }
        ];

        // 添加技术指标
        if (options.showMA) {
            series.push(
                this.calculateMA(5, candleData),
                this.calculateMA(10, candleData),
                this.calculateMA(20, candleData)
            );
        }

        if (options.showBB) {
            const bb = this.calculateBollingerBands(candleData);
            series.push(
                { name: 'BB上轨', type: 'line', data: bb.upper },
                { name: 'BB中轨', type: 'line', data: bb.middle },
                { name: 'BB下轨', type: 'line', data: bb.lower }
            );
        }

        // 添加标记点
        series.push({
            name: '做多标记',
            type: 'scatter',
            data: feedbacks.filter(f => f.action === 'long').map(f => ({
                value: [f.timestamp, candleData.find(c => c.timestamp === f.timestamp)?.high || 0],
                itemStyle: { color: '#28a745' },
                symbol: 'arrow',
                symbolSize: 15,
                symbolRotate: 180
            }))
        });

        series.push({
            name: '做空标记',
            type: 'scatter',
            data: feedbacks.filter(f => f.action === 'short').map(f => ({
                value: [f.timestamp, candleData.find(c => c.timestamp === f.timestamp)?.low || 0],
                itemStyle: { color: '#dc3545' },
                symbol: 'arrow',
                symbolSize: 15
            }))
        });

        const option = {
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
            ],
            series: series
        };

        this.mainChart.setOption(option, true);
    }

    updateVolumeChart(candleData) {
        const option = {
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            grid: {
                left: '10%',
                right: '10%',
                top: '10%',
                height: '70%'
            },
            xAxis: {
                type: 'time',
                scale: true
            },
            yAxis: {
                scale: true
            },
            series: [
                {
                    name: '成交量',
                    type: 'bar',
                    data: candleData.map(candle => [
                        candle.timestamp,
                        candle.volume,
                        candle.close > candle.open ? 1 : -1
                    ]),
                    itemStyle: {
                        color: function(params) {
                            return params.data[2] > 0 ? '#c23531' : '#314656';
                        }
                    }
                }
            ]
        };

        this.volumeChart.setOption(option, true);
    }

    updateIndicatorChart(candleData, options) {
        const series = [];
        
        if (options.showMACD) {
            const macd = this.calculateMACD(candleData);
            series.push(
                {
                    name: 'MACD',
                    type: 'line',
                    yAxisIndex: 0,
                    data: macd.macd
                },
                {
                    name: 'Signal',
                    type: 'line',
                    yAxisIndex: 0,
                    data: macd.signal
                },
                {
                    name: 'Histogram',
                    type: 'bar',
                    yAxisIndex: 0,
                    data: macd.histogram.map(item => ({
                        value: item[1],
                        itemStyle: {
                            color: item[1] >= 0 ? '#c23531' : '#314656'
                        }
                    }))
                }
            );
        }

        if (options.showRSI) {
            const rsi = this.calculateRSI(candleData);
            series.push({
                name: 'RSI',
                type: 'line',
                yAxisIndex: 1,
                data: rsi,
                markLine: {
                    data: [
                        { yAxis: 70, lineStyle: { color: '#dc3545' } },
                        { yAxis: 30, lineStyle: { color: '#28a745' } }
                    ]
                }
            });
        }

        const option = {
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            legend: {
                data: series.map(s => s.name)
            },
            grid: {
                left: '10%',
                right: '10%',
                top: '10%',
                height: '70%'
            },
            xAxis: {
                type: 'time',
                scale: true
            },
            yAxis: [
                {
                    scale: true,
                    splitArea: { show: true }
                },
                {
                    scale: true,
                    splitArea: { show: true }
                }
            ],
            series: series
        };

        this.indicatorChart.setOption(option, true);
    }

    calculateMA(period, data) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push([data[i].timestamp, null]);
                continue;
            }
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            result.push([data[i].timestamp, sum / period]);
        }
        return {
            name: 'MA' + period,
            type: 'line',
            data: result
        };
    }

    calculateBollingerBands(data) {
        const period = 20;
        const multiplier = 2;
        const upper = [];
        const middle = [];
        const lower = [];

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                upper.push([data[i].timestamp, null]);
                middle.push([data[i].timestamp, null]);
                lower.push([data[i].timestamp, null]);
                continue;
            }

            let sum = 0;
            let sumSq = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
                sumSq += data[i - j].close * data[i - j].close;
            }
            const ma = sum / period;
            const std = Math.sqrt(sumSq / period - ma * ma);

            middle.push([data[i].timestamp, ma]);
            upper.push([data[i].timestamp, ma + multiplier * std]);
            lower.push([data[i].timestamp, ma - multiplier * std]);
        }

        return { upper, middle, lower };
    }

    calculateMACD(data) {
        const shortPeriod = 12;
        const longPeriod = 26;
        const signalPeriod = 9;
        const macd = [];
        const signal = [];
        const histogram = [];

        let shortEMA = 0;
        let longEMA = 0;
        let signalEMA = 0;

        for (let i = 0; i < data.length; i++) {
            const close = data[i].close;
            const timestamp = data[i].timestamp;

            if (i === 0) {
                shortEMA = close;
                longEMA = close;
                continue;
            }

            shortEMA = (close - shortEMA) * (2 / (shortPeriod + 1)) + shortEMA;
            longEMA = (close - longEMA) * (2 / (longPeriod + 1)) + longEMA;

            if (i >= longPeriod - 1) {
                const macdValue = shortEMA - longEMA;
                macd.push([timestamp, macdValue]);

                if (i === longPeriod - 1) {
                    signalEMA = macdValue;
                } else {
                    signalEMA = (macdValue - signalEMA) * (2 / (signalPeriod + 1)) + signalEMA;
                    signal.push([timestamp, signalEMA]);
                    histogram.push([timestamp, macdValue - signalEMA]);
                }
            }
        }

        return { macd, signal, histogram };
    }

    calculateRSI(data) {
        const period = 14;
        const rsi = [];
        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const change = data[i].close - data[i - 1].close;
            if (change >= 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        let rs = avgGain / avgLoss;
        let rsiValue = 100 - (100 / (1 + rs));
        rsi.push([data[period].timestamp, rsiValue]);

        for (let i = period + 1; i < data.length; i++) {
            const change = data[i].close - data[i - 1].close;
            let currentGain = 0;
            let currentLoss = 0;

            if (change >= 0) {
                currentGain = change;
            } else {
                currentLoss = -change;
            }

            avgGain = ((avgGain * (period - 1)) + currentGain) / period;
            avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;

            rs = avgGain / avgLoss;
            rsiValue = 100 - (100 / (1 + rs));
            rsi.push([data[i].timestamp, rsiValue]);
        }

        return rsi;
    }
}

window.ContractChart = ContractChart;
