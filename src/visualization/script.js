let chart;
let candleSeries;
let globalData;

async function loadAndDisplayData() {
    try {
        const response = await fetch('latest_results.json');
        globalData = await response.json();
        
        displayMetrics(globalData);
        createExitTypeChart(globalData.metrics);
        createAvgProfitChart(globalData.profitDistribution);
        createEquityCurve(globalData.trades);
        displayRecentTrades(globalData.trades);
        displayResistanceBreakdown(globalData.metrics, globalData.profitDistribution);
        initializeCandlestickChart();
    } catch (error) {
        console.error('Error loading data:', error);
        document.querySelector('.container').innerHTML = `
            <div class="card">
                <h3>数据加载错误</h3>
                <p>请确保已运行回测并生成结果文件。</p>
                <p>错误信息: ${error.message}</p>
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
        markers.push({
            time: trade.entry.timestamp / 1000,
            position: 'belowBar',
            color: '#2f9e44',
            shape: 'arrowUp',
            text: `入场 - ${formatEntryTimeframes(trade.entry.timeframes)}`,
        });

        markers.push({
            time: trade.exit.timestamp / 1000,
            position: 'aboveBar',
            color: '#e03131',
            shape: 'arrowDown',
            text: `出场 - ${trade.exitReason}`,
        });
    });

    candleSeries.setMarkers(markers);
}

function displayMetrics(data) {
    document.getElementById('analysisPeriod').textContent = 
        `${data.startDate} 至 ${data.endDate} (${data.period}天)`;
    document.getElementById('totalTrades').textContent = 
        data.metrics.totalTrades;
    document.getElementById('totalProfit').innerHTML = 
        `<span class="${data.metrics.totalProfit >= 0 ? 'profit' : 'loss'}">
            ${data.metrics.totalProfit.toFixed(2)} USDT (${data.metrics.totalProfitPercent.toFixed(2)}%)
        </span>`;
    document.getElementById('winRate').textContent = 
        `${data.metrics.winRate.toFixed(2)}%`;
}

function createExitTypeChart(metrics) {
    const ctx = document.getElementById('exitTypeChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['止损', '止盈', '阻力位退出'],
            datasets: [{
                data: [
                    metrics.stopLossTrades,
                    metrics.takeProfitTrades,
                    metrics.resistanceExitTrades.total
                ],
                backgroundColor: ['#ff6b6b', '#51cf66', '#339af0']
            }]
        }
    });
}

function createAvgProfitChart(profitDist) {
    const ctx = document.getElementById('avgProfitChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['止损', '止盈', '阻力位退出'],
            datasets: [{
                label: '平均收益 (USDT)',
                data: [
                    profitDist.stopLoss.totalProfit / profitDist.stopLoss.count,
                    profitDist.takeProfit.totalProfit / profitDist.takeProfit.count,
                    profitDist.resistance.total.totalProfit / profitDist.resistance.total.count
                ],
                backgroundColor: ['#ff6b6b', '#51cf66', '#339af0']
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function createEquityCurve(trades) {
    const ctx = document.getElementById('equityCurveChart').getContext('2d');
    let equity = 0;
    const equityPoints = trades.map(trade => {
        equity += trade.profit;
        return {
            x: new Date(trade.exitTime),
            y: equity
        };
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '累计收益',
                data: equityPoints,
                borderColor: '#339af0',
                fill: false
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day' }
                }
            }
        }
    });
}

function displayRecentTrades(trades) {
    const recentTrades = trades.slice(-20).reverse();
    const table = `
        <table class="trades-table">
            <tr>
                <th>时间</th>
                <th>入场时间周期</th>
                <th>退出类型</th>
                <th>退出详情</th>
                <th>收益</th>
                <th>持仓时间</th>
            </tr>
            ${recentTrades.map(trade => `
                <tr>
                    <td>${trade.exitTime}</td>
                    <td>${formatEntryTimeframes(trade.entry.timeframes)}</td>
                    <td>${trade.exitReason.split(':')[0]}</td>
                    <td>${trade.exitReason.includes(':') ? trade.exitReason.split(':')[1] : '-'}</td>
                    <td class="${trade.profit >= 0 ? 'profit' : 'loss'}">${trade.profit.toFixed(2)} USDT</td>
                    <td>${trade.durationHuman}</td>
                </tr>
            `).join('')}
        </table>
    `;
    document.getElementById('recentTrades').innerHTML = table;
}

function formatEntryTimeframes(timeframes) {
    if (!timeframes) return 'N/A';
    return timeframes.map(tf => `${tf.timeframe}(${tf.band})`).join(', ');
}

function displayResistanceBreakdown(metrics, profitDist) {
    const container = document.getElementById('resistanceBreakdown');
    const timeframes = ['15m', '1h', '4h'];
    
    let html = '';
    timeframes.forEach(tf => {
        const stats = metrics.resistanceExitTrades.byTimeframe[tf];
        const profits = profitDist.resistance.byTimeframe[tf];
        const total = stats.upper + stats.middle;
        
        if (total > 0) {
            html += `
                <div class="metric-card">
                    <h3>${tf}周期</h3>
                    <div class="stat-row">
                        <span class="stat-label">上轨触发:</span>
                        <span class="stat-value">${stats.upper} (${((stats.upper/metrics.resistanceExitTrades.total)*100).toFixed(1)}%)</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">上轨平均收益:</span>
                        <span class="stat-value ${profits.upper.profit >= 0 ? 'profit' : 'loss'}">
                            ${(profits.upper.profit/profits.upper.count || 0).toFixed(2)} USDT
                        </span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">中轨触发:</span>
                        <span class="stat-value">${stats.middle} (${((stats.middle/metrics.resistanceExitTrades.total)*100).toFixed(1)}%)</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">中轨平均收益:</span>
                        <span class="stat-value ${profits.middle.profit >= 0 ? 'profit' : 'loss'}">
                            ${(profits.middle.profit/profits.middle.count || 0).toFixed(2)} USDT
                        </span>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
}

// Event Listeners
document.getElementById('timeframeSelect').addEventListener('change', updateCandlestickChart);

window.addEventListener('resize', () => {
    if (chart) {
        chart.applyOptions({
            width: document.getElementById('candlestickChart').clientWidth,
        });
    }
});

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', loadAndDisplayData);
