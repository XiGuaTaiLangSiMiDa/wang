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
            updateStats();
            createCapitalChart();
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
    globalData.trades.forEach(trade => {
        // Entry marker
        markers.push({
            time: trade.entry.timestamp / 1000,
            position: 'belowBar',
            color: '#2f9e44',
            shape: 'arrowUp',
            text: `开仓信号 (第${trade.tradeNumber}笔)
最低价: ${trade.entry.lowPrice.toFixed(2)}
下轨: ${trade.entry.bbLower.toFixed(2)}
开仓价: ${trade.entry.price.toFixed(2)}
仓位大小: ${trade.entry.positionSize.toFixed(2)} USDT`,
        });

        // Exit marker
        markers.push({
            time: trade.exit.timestamp / 1000,
            position: 'aboveBar',
            color: '#e03131',
            shape: 'arrowDown',
            text: `平仓 - ${trade.exit.reason} (第${trade.tradeNumber}笔)
价格: ${trade.exit.price.toFixed(2)}
收益: ${trade.profit.toFixed(2)} USDT
剩余资金: ${trade.remainingCapital.toFixed(2)} USDT`,
        });
    });

    candleSeries.setMarkers(markers);
    setupTooltip(markers);
}

function createCapitalChart() {
    const ctx = document.getElementById('capitalChart').getContext('2d');
    const trades = globalData.trades;
    
    // Create capital history including initial capital
    const capitalHistory = [{
        x: trades[0]?.entry.timestamp || Date.now(),
        y: globalData.metrics.initialCapital
    }];
    
    trades.forEach(trade => {
        capitalHistory.push({
            x: trade.exit.timestamp,
            y: trade.remainingCapital
        });
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '账户余额',
                data: capitalHistory,
                borderColor: '#339af0',
                fill: false,
                stepped: true
            }]
        },
        options: {
            responsive: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return `余额: ${context.raw.y.toFixed(2)} USDT`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'MM-DD HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: '时间'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'USDT'
                    },
                    min: 0
                }
            }
        }
    });
}

function updateStats() {
    const statsContainer = document.getElementById('statsContainer');
    if (statsContainer && globalData.metrics) {
        statsContainer.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">初始资金:</span>
                <span class="stat-value">${globalData.metrics.initialCapital.toFixed(2)} USDT</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">最终资金:</span>
                <span class="stat-value ${globalData.metrics.finalCapital >= globalData.metrics.initialCapital ? 'profit' : 'loss'}">
                    ${globalData.metrics.finalCapital.toFixed(2)} USDT
                </span>
            </div>
            <div class="stat-item">
                <span class="stat-label">总交易次数:</span>
                <span class="stat-value">${globalData.metrics.totalTrades}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">胜率:</span>
                <span class="stat-value">${globalData.metrics.winRate.toFixed(2)}%</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">总收益:</span>
                <span class="stat-value ${globalData.metrics.totalProfit >= 0 ? 'profit' : 'loss'}">
                    ${globalData.metrics.totalProfit.toFixed(2)} USDT
                </span>
            </div>
            <div class="stat-item">
                <span class="stat-label">收益率:</span>
                <span class="stat-value ${globalData.metrics.profitPercent >= 0 ? 'profit' : 'loss'}">
                    ${globalData.metrics.profitPercent.toFixed(2)}%
                </span>
            </div>
        `;

        // Update trade history
        const tradeList = document.getElementById('tradeList');
        if (tradeList) {
            tradeList.innerHTML = globalData.trades.map(trade => `
                <div class="trade-item ${trade.profit >= 0 ? 'profit' : 'loss'}">
                    <div class="trade-header">
                        <span class="trade-number">第${trade.tradeNumber}笔交易</span>
                        <span class="trade-result">${trade.profit >= 0 ? '盈利' : '亏损'}: ${trade.profit.toFixed(2)} USDT</span>
                    </div>
                    <div class="trade-details">
                        <div>开仓价: ${trade.entry.price.toFixed(2)}</div>
                        <div>平仓价: ${trade.exit.price.toFixed(2)}</div>
                        <div>原因: ${trade.exit.reason}</div>
                        <div>剩余资金: ${trade.remainingCapital.toFixed(2)} USDT</div>
                    </div>
                </div>
            `).join('');
        }
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
