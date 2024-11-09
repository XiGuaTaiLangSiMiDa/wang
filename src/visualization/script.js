let chart;
let candleSeries;
let globalData;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayData();
});

async function loadAndDisplayData() {
    try {
        const response = await fetch('latest_results.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        globalData = await response.json();
        
        if (globalData && globalData.candleData) {
            initializeCandlestickChart();
        } else {
            throw new Error('Invalid data format');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

function showError(message) {
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = `
            <div style="padding: 20px; color: #e03131;">
                <h3>数据加载错误</h3>
                <p>请确保已运行回测并生成结果文件。</p>
                <p>错误信息: ${message}</p>
            </div>
        `;
    }
}

function initializeCandlestickChart() {
    const chartContainer = document.getElementById('candlestickChart');
    
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 600,
        layout: {
            backgroundColor: '#ffffff',
            textColor: '#333',
        },
        grid: {
            vertLines: { color: '#f0f0f0' },
            horzLines: { color: '#f0f0f0' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#ddd',
        },
        timeScale: {
            borderColor: '#ddd',
            timeVisible: true,
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#2f9e44',
        downColor: '#e03131',
        borderUpColor: '#2f9e44',
        borderDownColor: '#e03131',
        wickUpColor: '#2f9e44',
        wickDownColor: '#e03131',
    });

    // Add Bollinger Bands
    const upperBandSeries = chart.addLineSeries({
        color: 'rgba(45, 85, 255, 0.5)',
        lineWidth: 1,
        title: '上轨',
    });

    const middleBandSeries = chart.addLineSeries({
        color: 'rgba(45, 85, 255, 1)',
        lineWidth: 1,
        title: '中轨',
    });

    const lowerBandSeries = chart.addLineSeries({
        color: 'rgba(45, 85, 255, 0.5)',
        lineWidth: 1,
        title: '下轨',
    });

    updateCandlestickChart();
}

function updateCandlestickChart() {
    if (!globalData || !chart) return;

    const timeframe = document.getElementById('timeframeSelect').value;
    const candleData = globalData.candleData[timeframe].map(candle => ({
        time: candle.timestamp / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
    }));

    candleSeries.setData(candleData);

    // Update Bollinger Bands
    const bbData = globalData.indicators.bollinger[timeframe];
    const upperBandData = bbData.map((d, i) => ({
        time: globalData.candleData[timeframe][i].timestamp / 1000,
        value: d.upper
    }));
    const middleBandData = bbData.map((d, i) => ({
        time: globalData.candleData[timeframe][i].timestamp / 1000,
        value: d.middle
    }));
    const lowerBandData = bbData.map((d, i) => ({
        time: globalData.candleData[timeframe][i].timestamp / 1000,
        value: d.lower
    }));

    // Get all line series from the chart
    const series = chart.getAllLineSeries();
    series[0].setData(upperBandData);
    series[1].setData(middleBandData);
    series[2].setData(lowerBandData);

    // Add trade markers
    const markers = [];
    globalData.trades.forEach(trade => {
        // Entry marker
        markers.push({
            time: trade.entry.timestamp / 1000,
            position: 'belowBar',
            color: '#2f9e44',
            shape: 'arrowUp',
            text: `开仓 - ${formatEntryTimeframes(trade.entry.timeframes)}`,
        });

        // Exit marker
        markers.push({
            time: trade.exit.timestamp / 1000,
            position: 'aboveBar',
            color: '#e03131',
            shape: 'arrowDown',
            text: `平仓 - ${formatExitReason(trade)}`,
        });
    });

    candleSeries.setMarkers(markers);
    setupTooltip(markers);
}

function formatEntryTimeframes(timeframes) {
    if (!timeframes) return 'N/A';
    return timeframes.map(tf => `${tf.timeframe}(${tf.band})`).join(', ');
}

function formatExitReason(trade) {
    const profitPercent = trade.profitPercent.toFixed(2);
    const profitStr = `${trade.profit >= 0 ? '+' : ''}${profitPercent}%`;
    
    switch (trade.exit.reason) {
        case 'Stop Loss':
            return `止损 (${profitStr})`;
        case 'Take Profit':
            return `止盈 (${profitStr})`;
        case 'Resistance':
            const trigger = trade.exit.exitTriggers[0];
            return `阻力位${trigger.band === 'upper' ? '上轨' : '中轨'} ${trigger.timeframe} (${profitStr})`;
        default:
            return `${trade.exitReason} (${profitStr})`;
    }
}

function setupTooltip(markers) {
    const tooltip = document.getElementById('tooltip');
    
    chart.subscribeCrosshairMove(param => {
        if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
            tooltip.style.display = 'none';
            return;
        }

        const marker = markers.find(m => m.time === param.time);
        if (marker) {
            tooltip.style.display = 'block';
            tooltip.style.left = param.point.x + 15 + 'px';
            tooltip.style.top = param.point.y + 15 + 'px';
            tooltip.innerHTML = marker.text;
        } else {
            tooltip.style.display = 'none';
        }
    });
}

// Event Listeners
const timeframeSelect = document.getElementById('timeframeSelect');
if (timeframeSelect) {
    timeframeSelect.addEventListener('change', updateCandlestickChart);
}

window.addEventListener('resize', () => {
    if (chart) {
        const chartContainer = document.getElementById('candlestickChart');
        if (chartContainer) {
            chart.applyOptions({
                width: chartContainer.clientWidth,
            });
        }
    }
});
