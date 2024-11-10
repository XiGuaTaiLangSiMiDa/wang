let chart;
let candleSeries;
let globalData;

document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayData();
});

async function loadAndDisplayData() {
    try {
        const response = await fetch('analysis_results.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        globalData = await response.json();
        
        if (globalData) {
            displayIndicatorAnalysis();
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

function displayIndicatorAnalysis() {
    const container = document.getElementById('indicatorAnalysis');
    if (!container || !globalData.analysis) return;

    const indicators = {
        rsi: 'RSI',
        macdHistogram: 'MACD柱状图',
        volumeRatio: '成交量比',
        pricePosition: '价格位置',
        volatility: '波动率'
    };

    const html = Object.entries(indicators).map(([key, label]) => {
        const rule = globalData.analysis.rules.find(r => r.indicator === key);
        const profitStats = globalData.analysis.profitable[key];
        const lossStats = globalData.analysis.losing[key];

        return `
            <div class="indicator-card">
                <div class="indicator-header">
                    <div class="indicator-name">${label}</div>
                    <div class="indicator-weight">权重: ${rule.weight}</div>
                </div>
                <div class="stat-grid">
                    <div class="stat-box">
                        <div class="stat-label">盈利交易均值</div>
                        <div class="stat-value profit">${profitStats.mean.toFixed(2)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">亏损交易均值</div>
                        <div class="stat-value loss">${lossStats.mean.toFixed(2)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">盈利标准差</div>
                        <div class="stat-value">${profitStats.stdDev.toFixed(2)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">亏损标准差</div>
                        <div class="stat-value">${lossStats.stdDev.toFixed(2)}</div>
                    </div>
                </div>
                <div class="avoid-range">
                    建议避免范围: ${rule.avoidRange}
                </div>
                <canvas id="${key}Distribution" class="distribution-chart"></canvas>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Create distribution charts
    Object.keys(indicators).forEach(key => {
        createDistributionChart(key);
    });
}

function createDistributionChart(indicator) {
    const ctx = document.getElementById(`${indicator}Distribution`).getContext('2d');
    const profitData = globalData.analysis.profitable[indicator];
    const lossData = globalData.analysis.losing[indicator];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['盈利交易', '亏损交易'],
            datasets: [{
                label: '均值与标准差范围',
                data: [profitData.mean, lossData.mean],
                backgroundColor: ['rgba(47, 158, 68, 0.5)', 'rgba(224, 49, 49, 0.5)'],
                borderColor: ['#2f9e44', '#e03131'],
                borderWidth: 1,
                errorBars: {
                    '0': { plus: profitData.stdDev, minus: profitData.stdDev },
                    '1': { plus: lossData.stdDev, minus: lossData.stdDev }
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
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

    const candleData = globalData.candleData.map(candle => ({
        time: candle.timestamp / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
    }));

    candleSeries.setData(candleData);

    // Add trade markers
    const markers = [];
    let cumulativeProfit = 0;

    globalData.trades.forEach((trade, index) => {
        cumulativeProfit += trade.profit;
        const profitClass = trade.profit >= 0 ? 'profit' : 'loss';
        const indicators = globalData.candleData.find(c => c.timestamp === trade.entry.timestamp)?.indicators;

        // Entry marker
        markers.push({
            time: trade.entry.timestamp / 1000,
            position: 'belowBar',
            color: '#2f9e44',
            shape: 'arrowUp',
            text: `开仓 #${index + 1}
价格: ${trade.entry.price.toFixed(2)}
时间: ${formatDateTime(trade.entry.timestamp)}
RSI: ${indicators?.rsi?.toFixed(2)}
MACD: ${indicators?.macd?.histogram?.toFixed(4)}
成交量比: ${indicators?.volume?.volumeRatio?.toFixed(2)}
价格位置: ${indicators?.pricePosition?.toFixed(2)}
波动率: ${indicators?.volatility?.toFixed(2)}%`,
        });

        // Exit marker
        markers.push({
            time: trade.exit.timestamp / 1000,
            position: 'aboveBar',
            color: '#e03131',
            shape: 'arrowDown',
            text: `平仓 #${index + 1}
价格: ${trade.exit.price.toFixed(2)}
收益: ${trade.profit.toFixed(2)} USDT
累计收益: ${cumulativeProfit.toFixed(2)} USDT`,
        });
    });

    candleSeries.setMarkers(markers);
    setupTooltip(markers);
}

function updateTradeTable() {
    const tableBody = document.getElementById('tradeTableBody');
    if (!tableBody || !globalData.trades) return;

    let cumulativeProfit = 0;
    const rows = globalData.trades.map((trade, index) => {
        cumulativeProfit += trade.profit;
        const profitPercent = ((trade.exit.price - trade.entry.price) / trade.entry.price * 100).toFixed(2);
        const cumulativeProfitPercent = (cumulativeProfit / trade.entry.price * 100).toFixed(2);
        const profitClass = trade.profit >= 0 ? 'profit' : 'loss';
        const indicators = globalData.candleData.find(c => c.timestamp === trade.entry.timestamp)?.indicators;

        return `
            <tr>
                <td class="trade-number">#${index + 1}</td>
                <td>${formatDateTime(trade.entry.timestamp)}</td>
                <td>${trade.entry.price.toFixed(2)}</td>
                <td>${formatDateTime(trade.exit.timestamp)}</td>
                <td>${trade.exit.price.toFixed(2)}</td>
                <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
                <td class="${profitClass}">${profitPercent}%</td>
                <td class="${profitClass} cumulative">${cumulativeProfit.toFixed(2)}</td>
                <td class="${profitClass} cumulative">${cumulativeProfitPercent}%</td>
                <td>${indicators?.rsi?.toFixed(2) || '-'}</td>
                <td>${indicators?.macd?.histogram?.toFixed(4) || '-'}</td>
                <td>${indicators?.volume?.volumeRatio?.toFixed(2) || '-'}</td>
                <td>${indicators?.pricePosition?.toFixed(2) || '-'}</td>
                <td>${indicators?.volatility?.toFixed(2) || '-'}%</td>
                <td>${calculateHoldingTime(trade.entry.timestamp, trade.exit.timestamp)}</td>
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
