// Chart creation functions
function createCandlestickChart(candleData) {
    const chart = echarts.init(document.getElementById('candlestickChart'));
    
    if (!candleData || !candleData['15m'] || !Array.isArray(candleData['15m'])) {
        console.error('Invalid candle data:', candleData);
        return;
    }

    const klineData = candleData['15m'].map(candle => ({
        value: [
            candle.timestamp,
            candle.open,
            candle.close,
            candle.low,
            candle.high
        ],
        itemStyle: candle.isProfit ? {
            color: '#c23531',
            color0: '#314656',
            borderColor: '#c23531',
            borderColor0: '#314656',
            borderWidth: 2
        } : null
    }));

    const option = {
        title: {
            text: 'SOL-USDT-SWAP 15分钟K线图与盈利机会',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            formatter: function (params) {
                const date = new Date(params[0].value[0]);
                return [
                    `时间: ${date.toLocaleString()}`,
                    `开盘: ${params[0].value[1]}`,
                    `收盘: ${params[0].value[2]}`,
                    `最低: ${params[0].value[3]}`,
                    `最高: ${params[0].value[4]}`
                ].join('<br/>');
            }
        },
        legend: { data: ['K线'] },
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
                data: klineData,
                itemStyle: {
                    color: '#c23531',
                    color0: '#314656',
                    borderColor: '#c23531',
                    borderColor0: '#314656'
                },
                markPoint: {
                    symbol: 'circle',
                    symbolSize: 8,
                    data: candleData['15m']
                        .filter(candle => candle.isProfit)
                        .map(candle => ({
                            coord: [candle.timestamp, candle.high],
                            itemStyle: { color: '#2ecc71' },
                            tooltip: {
                                formatter: () => '盈利机会点'
                            }
                        }))
                }
            }
        ]
    };

    chart.setOption(option);
}

function createFeatureDistributionChart(features) {
    const chart = echarts.init(document.getElementById('featureDistribution'));
    
    const featureStats = {};
    Object.keys(features[0]).forEach(feature => {
        const values = features.map(f => f[feature]);
        featureStats[feature] = {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            std: Math.sqrt(values.reduce((a, b) => a + Math.pow(b - values.reduce((c, d) => c + d, 0) / values.length, 2), 0) / values.length)
        };
    });

    const option = {
        title: {
            text: '特征统计分布',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: { type: 'value' },
        yAxis: {
            type: 'category',
            data: Object.keys(featureStats)
        },
        series: [
            {
                name: '平均值',
                type: 'bar',
                data: Object.values(featureStats).map(stat => stat.mean.toFixed(4))
            }
        ]
    };

    chart.setOption(option);
}

function createProfitDistributionChart(labels) {
    const chart = echarts.init(document.getElementById('profitDistribution'));
    
    const profitCount = labels.filter(l => l === 1).length;
    const lossCount = labels.length - profitCount;

    const option = {
        title: {
            text: '盈利/亏损样本分布',
            left: 'center'
        },
        tooltip: { trigger: 'item' },
        legend: {
            orient: 'vertical',
            left: 'left'
        },
        series: [
            {
                name: '样本分布',
                type: 'pie',
                radius: '50%',
                data: [
                    { value: profitCount, name: '盈利样本' },
                    { value: lossCount, name: '非盈利样本' }
                ],
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }
        ]
    };

    chart.setOption(option);
}

// Export the functions
window.ChartUtils = {
    createCandlestickChart,
    createFeatureDistributionChart,
    createProfitDistributionChart
};
