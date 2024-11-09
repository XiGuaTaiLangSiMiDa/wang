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

function findPivotPoints(data, lookback = 3) {
    const pivots = [];
    
    // Need at least 2*lookback + 1 candles to find a pivot
    for (let i = lookback; i < data.length - lookback; i++) {
        const currentHigh = data[i].high;
        const currentLow = data[i].low;
        
        // Check for high pivot (peak)
        let isHighPivot = true;
        for (let j = 1; j <= lookback; j++) {
            if (data[i - j].high >= currentHigh || data[i + j].high >= currentHigh) {
                isHighPivot = false;
                break;
            }
        }
        
        // Check for low pivot (trough)
        let isLowPivot = true;
        for (let j = 1; j <= lookback; j++) {
            if (data[i - j].low <= currentLow || data[i + j].low <= currentLow) {
                isLowPivot = false;
                break;
            }
        }
        
        if (isHighPivot) {
            pivots.push({
                time: data[i].timestamp / 1000,
                price: currentHigh,
                type: 'high'
            });
        }
        
        if (isLowPivot) {
            pivots.push({
                time: data[i].timestamp / 1000,
                price: currentLow,
                type: 'low'
            });
        }
    }
    
    return pivots;
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

    updateCandlestickChart();
}

function updateCandlestickChart() {
    if (!globalData || !chart) return;

    // Always use 15m timeframe for pivot points
    const candleData = globalData.candleData['15m'].map(candle => ({
        time: candle.timestamp / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
    }));

    candleSeries.setData(candleData);

    // Find pivot points
    const pivots = findPivotPoints(globalData.candleData['15m']);
    
    // Convert pivot points to markers
    const markers = pivots.map(pivot => ({
        time: pivot.time,
        position: pivot.type === 'high' ? 'aboveBar' : 'belowBar',
        color: pivot.type === 'high' ? '#e03131' : '#2f9e44',
        shape: pivot.type === 'high' ? 'arrowDown' : 'arrowUp',
        text: pivot.type === 'high' ? '高点' : '低点'
    }));

    candleSeries.setMarkers(markers);
    setupTooltip(markers);
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
