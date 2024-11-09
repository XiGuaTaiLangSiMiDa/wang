let chart;
let candleSeries;
let globalData;

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
            updateTradeTable();
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
    const bbLower = chart.addLineSeries({
        color: 'rgba(45, 85, 255, 0.5)',
        lineWidth: 1,
        title: '布林带下轨',
    });

    updateCandlestickChart(bbLower);
}

function updateCandlestickChart(bbLower) {
    if (!globalData || !chart) return;

    const candleData = globalData.candleData['15m'].map(candle => ({
        time: candle.timestamp / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
    }));

    candleSeries.setData(candleData);
    
    // Set Bollinger Bands lower band data
    const bbData = globalData.candleData['15m'].map(candle => ({
        time: candle.timestamp / 1000,
        value: candle.bb.lower
    })).filter(d => d.value !== null);

    bbLower.setData(bbData);

    // Add trade markers
    const markers = [];
    globalData.trades.forEach((trade, index) => {
        // Entry marker
        markers.push({
            time: trade.entry.timestamp / 1000,
            position: 'belowBar',
            color: '#2f9e44',
            shape: 'arrowUp',
            text: `开仓 #${index + 1}
价格: ${trade.entry.price.toFixed(2)}
时间: ${formatDateTime(trade.entry.timestamp)}`,
        });

        // Exit marker
        markers.push({
            time: trade.exit.timestamp / 1000,
            position: 'aboveBar',
            color: '#e03131',
            shape: 'arrowDown',
            text: `平仓 #${index + 1}
价格: ${trade.exit.price.toFixed(2)}
时间: ${formatDateTime(trade.exit.timestamp)}
收益: ${trade.profit.toFixed(2)} USDT`,
        });
    });

    candleSeries.setMarkers(markers);
    setupTooltip(markers);
}

function updateTradeTable() {
    const tableBody = document.getElementById('tradeTableBody');
    if (!tableBody || !globalData.trades) return;

    let cumulativeProfit = 0;
    const initialCapital = globalData.metrics.initialCapital;

    const rows = globalData.trades.map((trade, index) => {
        const entryTime = formatDateTime(trade.entry.timestamp);
        const exitTime = formatDateTime(trade.exit.timestamp);
        const holdingTime = calculateHoldingTime(trade.entry.timestamp, trade.exit.timestamp);
        
        // Calculate single trade profit
        const profitPercent = ((trade.exit.price - trade.entry.price) / trade.entry.price * 100).toFixed(2);
        const profitClass = trade.profit >= 0 ? 'profit' : 'loss';
        
        // Calculate cumulative profit
        cumulativeProfit += trade.profit;
        const cumulativeProfitPercent = (cumulativeProfit / initialCapital * 100).toFixed(2);
        const cumulativeClass = cumulativeProfit >= 0 ? 'profit' : 'loss';

        return `
            <tr>
                <td class="trade-number">#${index + 1}</td>
                <td>${entryTime}</td>
                <td>${trade.entry.price.toFixed(2)}</td>
                <td>${exitTime}</td>
                <td>${trade.exit.price.toFixed(2)}</td>
                <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
                <td class="${profitClass}">${profitPercent}%</td>
                <td class="${cumulativeClass} cumulative">${cumulativeProfit.toFixed(2)}</td>
                <td class="${cumulativeClass} cumulative">${cumulativeProfitPercent}%</td>
                <td>${holdingTime}</td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rows;
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function calculateHoldingTime(entryTime, exitTime) {
    const duration = exitTime - entryTime;
    const minutes = Math.floor(duration / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
        return `${hours}小时${remainingMinutes}分钟`;
    }
    return `${minutes}分钟`;
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
