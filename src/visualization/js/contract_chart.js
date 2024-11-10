class ContractChart {
    constructor() {
        this.mainChart = echarts.init(document.getElementById('mainChart'));
        this.volumeChart = echarts.init(document.getElementById('volumeChart'));
        this.indicatorChart = echarts.init(document.getElementById('indicatorChart'));
        this.selectedBar = null;
        this.zoomState = {
            start: 50,
            end: 100
        };
        
        // 设置图表联动
        echarts.connect([this.mainChart, this.volumeChart, this.indicatorChart]);

        // 监听点击事件
        this.mainChart.on('click', this.handleChartClick.bind(this));
        
        // 监听缩放事件
        this.mainChart.on('datazoom', this.handleDataZoom.bind(this));
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.mainChart.resize();
            this.volumeChart.resize();
            this.indicatorChart.resize();
        });

        // 初始化操作按钮
        this.initActionButtons();
    }

    handleDataZoom(params) {
        // 保存缩放状态
        if (params.batch) {
            this.zoomState = {
                start: params.batch[0].start,
                end: params.batch[0].end
            };
        } else {
            this.zoomState = {
                start: params.start,
                end: params.end
            };
        }

        // 同步其他图表的缩放状态
        [this.volumeChart, this.indicatorChart].forEach(chart => {
            chart.dispatchAction({
                type: 'dataZoom',
                start: this.zoomState.start,
                end: this.zoomState.end
            });
        });
    }

    // 其他方法保持不变...

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
                    start: this.zoomState.start,
                    end: this.zoomState.end
                },
                {
                    show: true,
                    type: 'slider',
                    bottom: '5%',
                    start: this.zoomState.start,
                    end: this.zoomState.end
                }
            ],
            series: series
        };

        this.mainChart.setOption(option, true);

        // 在更新完主图表后，同步其他图表的缩放状态
        this.updateVolumeChart(candleData);
        this.updateIndicatorChart(candleData, options);
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
            dataZoom: [
                {
                    type: 'inside',
                    start: this.zoomState.start,
                    end: this.zoomState.end
                },
                {
                    show: true,
                    type: 'slider',
                    bottom: '5%',
                    start: this.zoomState.start,
                    end: this.zoomState.end
                }
            ],
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
            dataZoom: [
                {
                    type: 'inside',
                    start: this.zoomState.start,
                    end: this.zoomState.end
                },
                {
                    show: true,
                    type: 'slider',
                    bottom: '5%',
                    start: this.zoomState.start,
                    end: this.zoomState.end
                }
            ],
            series: series
        };

        this.indicatorChart.setOption(option, true);
    }

    // 其他方法保持不变...
}

window.ContractChart = ContractChart;
