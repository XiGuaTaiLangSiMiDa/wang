// 图表实例
let mainChart, volumeChart, indicatorChart;

// 初始化图表
function initCharts() {
    mainChart = echarts.init(document.getElementById('candlestickChart'));
    volumeChart = echarts.init(document.getElementById('volumeChart'));
    indicatorChart = echarts.init(document.getElementById('indicatorChart'));
    
    // 设置图表联动
    echarts.connect([mainChart, volumeChart, indicatorChart]);

    // 监听图表点击事件
    mainChart.on('click', function(params) {
        if (params.componentType === 'series') {
            window.feedbackTime.setDate(new Date(params.value[0]));
        }
    });
}

// 更新主图表
function updateMainChart(candleData, predictions) {
    const option = {
        animation: false,
        legend: {
            data: ['K线', 'MA5', 'MA10', 'MA20', '预测点']
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
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
        series: [
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
            },
            {
                name: '预测点',
                type: 'scatter',
                data: predictions.map(p => ({
                    value: [p.timestamp, p.currentPrice],
                    itemStyle: {
                        color: p.probability >= 0.7 ? '#28a745' : 
                              p.probability >= 0.5 ? '#ffc107' : '#dc3545'
                    }
                }))
            }
        ]
    };

    // 添加技术指标
    if (document.getElementById('showMA').checked) {
        option.series.push(
            calculateMA(5, candleData),
            calculateMA(10, candleData),
            calculateMA(20, candleData)
        );
    }

    if (document.getElementById('showBB').checked) {
        const bb = calculateBollingerBands(candleData);
        option.series.push(
            { name: 'BB上轨', type: 'line', data: bb.upper },
            { name: 'BB中轨', type: 'line', data: bb.middle },
            { name: 'BB下轨', type: 'line', data: bb.lower }
        );
    }

    mainChart.setOption(option, true);
}

// 更新成交量图表
function updateVolumeChart(candleData) {
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

    volumeChart.setOption(option, true);
}

// 更新指标图表
function updateIndicatorChart(candleData) {
    const series = [];
    
    if (document.getElementById('showMACD').checked) {
        const macd = calculateMACD(candleData);
        series.push(
            {
                name: 'MACD',
                type: 'line',
                data: macd.macd,
                yAxisIndex: 0
            },
            {
                name: 'Signal',
                type: 'line',
                data: macd.signal,
                yAxisIndex: 0
            },
            {
                name: 'Histogram',
                type: 'bar',
                data: macd.histogram,
                yAxisIndex: 0
            }
        );
    }

    if (document.getElementById('showRSI').checked) {
        const rsi = calculateRSI(candleData);
        series.push({
            name: 'RSI',
            type: 'line',
            data: rsi,
            yAxisIndex: 1
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

    indicatorChart.setOption(option, true);
}

// 计算技术指标
function calculateMA(period, data) {
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

function calculateBollingerBands(data) {
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

function calculateMACD(data) {
    const shortPeriod = 12;
    const longPeriod = 26;
    const signalPeriod = 9;
    const macd = [];
    const signal = [];
    const histogram = [];

    // Calculate EMAs
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

        // Update EMAs
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

function calculateRSI(data) {
    const period = 14;
    const rsi = [];
    let gains = 0;
    let losses = 0;

    // First pass: calculate initial averages
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

    // Calculate RSI for the first point
    let rs = avgGain / avgLoss;
    let rsiValue = 100 - (100 / (1 + rs));
    rsi.push([data[period].timestamp, rsiValue]);

    // Second pass: calculate RSI using Wilder's smoothing method
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

// 调整图表大小
function resizeCharts() {
    mainChart && mainChart.resize();
    volumeChart && volumeChart.resize();
    indicatorChart && indicatorChart.resize();
}

// 导出函数
window.ChartUtils = {
    initCharts,
    updateMainChart,
    updateVolumeChart,
    updateIndicatorChart,
    resizeCharts
};
