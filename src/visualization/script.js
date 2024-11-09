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
        
        // Initialize tabs first
        initializeTabs();
        
        // Display data only if we have valid data
        if (globalData && globalData.metrics) {
            displayMetrics(globalData);
            createExitTypeChart(globalData.metrics);
            createAvgProfitChart(globalData.profitDistribution);
            createEquityCurve(globalData.trades);
            displayRecentTrades(globalData.trades);
            displayResistanceBreakdown(globalData.metrics, globalData.profitDistribution);
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
            <div class="card">
                <h3>数据加载错误</h3>
                <p>请确保已运行回测并生成结果文件。</p>
                <p>错误信息: ${message}</p>
            </div>
        `;
    }
}

function initializeTabs() {
    const tabs = document.querySelectorAll('.tab-content');
    if (tabs.length > 0) {
        tabs.forEach(tab => {
            tab.style.display = 'none';
        });
        
        const firstTab = document.getElementById('charts');
        if (firstTab) {
            firstTab.style.display = 'block';
        }
    }
}

function showTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');
    
    if (tabs.length > 0 && buttons.length > 0) {
        tabs.forEach(tab => {
            if (tab) tab.style.display = 'none';
        });
        
        buttons.forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        
        const selectedTab = document.getElementById(tabId);
        const selectedButton = document.querySelector(`button[onclick="showTab('${tabId}')"]`);
        
        if (selectedTab) selectedTab.style.display = 'block';
        if (selectedButton) selectedButton.classList.add('active');
    }
}

function displayMetrics(data) {
    const elements = {
        analysisPeriod: document.getElementById('analysisPeriod'),
        totalTrades: document.getElementById('totalTrades'),
        totalProfit: document.getElementById('totalProfit'),
        winRate: document.getElementById('winRate')
    };

    // Check if all required elements exist
    const missingElements = Object.entries(elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);

    if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements);
        return;
    }

    try {
        elements.analysisPeriod.textContent = 
            `${data.startDate} 至 ${data.endDate} (${data.period}天)`;
        
        elements.totalTrades.textContent = 
            data.metrics.totalTrades;
        
        elements.totalProfit.innerHTML = 
            `<span class="${data.metrics.totalProfit >= 0 ? 'profit' : 'loss'}">
                ${data.metrics.totalProfit.toFixed(2)} USDT (${data.metrics.totalProfitPercent.toFixed(2)}%)
            </span>`;
        
        elements.winRate.textContent = 
            `${data.metrics.winRate.toFixed(2)}%`;
    } catch (error) {
        console.error('Error displaying metrics:', error);
    }
}

function createExitTypeChart(metrics) {
    const canvas = document.getElementById('exitTypeChart');
    if (!canvas) {
        console.error('Exit type chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
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
    } catch (error) {
        console.error('Error creating exit type chart:', error);
    }
}

function createAvgProfitChart(profitDist) {
    const canvas = document.getElementById('avgProfitChart');
    if (!canvas) {
        console.error('Average profit chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['止损', '止盈', '阻力位退出'],
                datasets: [{
                    label: '平均收益 (USDT)',
                    data: [
                        profitDist.stopLoss.count > 0 ? profitDist.stopLoss.totalProfit / profitDist.stopLoss.count : 0,
                        profitDist.takeProfit.count > 0 ? profitDist.takeProfit.totalProfit / profitDist.takeProfit.count : 0,
                        profitDist.resistance.total.count > 0 ? profitDist.resistance.total.totalProfit / profitDist.resistance.total.count : 0
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
    } catch (error) {
        console.error('Error creating average profit chart:', error);
    }
}

function createEquityCurve(trades) {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) {
        console.error('Equity curve chart canvas not found');
        return;
    }

    try {
        const ctx = canvas.getContext('2d');
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
    } catch (error) {
        console.error('Error creating equity curve:', error);
    }
}

function displayRecentTrades(trades) {
    const container = document.getElementById('recentTrades');
    if (!container) {
        console.error('Recent trades container not found');
        return;
    }

    try {
        const recentTrades = trades.slice(-20).reverse();
        container.innerHTML = `
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
    } catch (error) {
        console.error('Error displaying recent trades:', error);
        container.innerHTML = '<p>加载交易记录时出错</p>';
    }
}

function formatEntryTimeframes(timeframes) {
    if (!timeframes) return 'N/A';
    return timeframes.map(tf => `${tf.timeframe}(${tf.band})`).join(', ');
}

function displayResistanceBreakdown(metrics, profitDist) {
    const container = document.getElementById('resistanceBreakdown');
    if (!container) {
        console.error('Resistance breakdown container not found');
        return;
    }

    try {
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
    } catch (error) {
        console.error('Error displaying resistance breakdown:', error);
        container.innerHTML = '<p>加载阻力位分析时出错</p>';
    }
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
