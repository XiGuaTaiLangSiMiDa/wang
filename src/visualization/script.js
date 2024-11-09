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
        } else {
            throw new Error('Invalid data format');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

function calculateIndicators(data) {
    // Calculate RSI
    function calculateRSI(prices, period = 14) {
        let gains = 0;
        let losses = 0;
        
        // First pass to get initial averages
        for (let i = 1; i < period; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        
        gains /= period;
        losses /= period;
        
        const rsi = [];
        let rs = gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
        
        // Calculate remaining RSI values
        for (let i = period; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff >= 0) {
                gains = (gains * (period - 1) + diff) / period;
                losses = (losses * (period - 1)) / period;
            } else {
                gains = (gains * (period - 1)) / period;
                losses = (losses * (period - 1) - diff) / period;
            }
            rs = gains / losses;
            rsi.push(100 - (100 / (1 + rs)));
        }
        
        return rsi;
    }

    // Calculate MACD
    function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        function ema(data, period) {
            const k = 2 / (period + 1);
            let emaData = [data[0]];
            
            for (let i = 1; i < data.length; i++) {
                emaData.push(data[i] * k + emaData[i - 1] * (1 - k));
            }
            
            return emaData;
        }
        
        const fastEMA = ema(prices, fastPeriod);
        const slowEMA = ema(prices, slowPeriod);
        const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
        const signalLine = ema(macdLine, signalPeriod);
        
        return {
            macdLine,
            signalLine,
            histogram: macdLine.map((macd, i) => macd - signalLine[i])
        };
    }

    const closePrices = data.map(candle => candle.close);
    const rsi = calculateRSI(closePrices);
    const macd = calculateMACD(closePrices);
    
    return { rsi, macd };
}

function findPivotPoints(data, lookback = 3) {
    const pivots = [];
    const { rsi, macd } = calculateIndicators(data);
    
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
                type: 'high',
                indicators: {
                    rsi: rsi[i],
                    macd: macd.macdLine[i],
                    macdSignal: macd.signalLine[i],
                    macdHistogram: macd.histogram[i]
                }
            });
        }
        
        if (isLowPivot) {
            pivots.push({
                time: data[i].timestamp / 1000,
                price: currentLow,
                type: 'low',
                indicators: {
                    rsi: rsi[i],
                    macd: macd.macdLine[i],
                    macdSignal: macd.signalLine[i],
                    macdHistogram: macd.histogram[i]
                }
            });
        }
    }
    
    // Analyze patterns in pivot points
    analyzePivotPatterns(pivots);
    
    return pivots;
}

function analyzePivotPatterns(pivots) {
    // Separate high and low pivots
    const highPivots = pivots.filter(p => p.type === 'high');
    const lowPivots = pivots.filter(p => p.type === 'low');
    
    // Calculate average indicators at pivot points
    const avgHighRSI = average(highPivots.map(p => p.indicators.rsi));
    const avgLowRSI = average(lowPivots.map(p => p.indicators.rsi));
    const avgHighMACD = average(highPivots.map(p => p.indicators.macd));
    const avgLowMACD = average(lowPivots.map(p => p.indicators.macd));
    
    // Update pivot points with pattern analysis
    pivots.forEach(pivot => {
        const isHigh = pivot.type === 'high';
        const avgRSI = isHigh ? avgHighRSI : avgLowRSI;
        const avgMACD = isHigh ? avgHighMACD : avgLowMACD;
        
        pivot.pattern = {
            rsiStrength: (pivot.indicators.rsi - avgRSI) / avgRSI,
            macdStrength: (pivot.indicators.macd - avgMACD) / avgMACD,
            probability: calculateProbability(pivot, isHigh ? avgHighRSI : avgLowRSI, isHigh ? avgHighMACD : avgLowMACD)
        };
    });
}

function calculateProbability(pivot, avgRSI, avgMACD) {
    // RSI divergence check
    const rsiScore = Math.abs(pivot.indicators.rsi - avgRSI) / avgRSI;
    
    // MACD divergence check
    const macdScore = Math.abs(pivot.indicators.macd - avgMACD) / avgMACD;
    
    // MACD histogram trend
    const histogramTrend = pivot.indicators.macdHistogram > 0 ? 1 : -1;
    
    // Combine scores
    let probability = 0.5; // Base probability
    
    if (pivot.type === 'high') {
        if (pivot.indicators.rsi > 70) probability += 0.1;
        if (pivot.indicators.macd < 0) probability += 0.1;
        if (histogramTrend < 0) probability += 0.1;
    } else {
        if (pivot.indicators.rsi < 30) probability += 0.1;
        if (pivot.indicators.macd > 0) probability += 0.1;
        if (histogramTrend > 0) probability += 0.1;
    }
    
    // Adjust based on divergence scores
    probability += (rsiScore + macdScore) * 0.1;
    
    return Math.min(Math.max(probability, 0), 1);
}

function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
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

    const candleData = globalData.candleData['15m'].map(candle => ({
        time: candle.timestamp / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
    }));

    candleSeries.setData(candleData);

    const pivots = findPivotPoints(globalData.candleData['15m']);
    
    const markers = pivots.map(pivot => ({
        time: pivot.time,
        position: pivot.type === 'high' ? 'aboveBar' : 'belowBar',
        color: pivot.type === 'high' ? '#e03131' : '#2f9e44',
        shape: pivot.type === 'high' ? 'arrowDown' : 'arrowUp',
        text: formatPivotText(pivot)
    }));

    candleSeries.setMarkers(markers);
    setupTooltip(markers);
    
    // Predict next pivot point
    const prediction = predictNextPivot(pivots);
    if (prediction) {
        displayPrediction(prediction);
    }
}

function formatPivotText(pivot) {
    const probability = (pivot.pattern.probability * 100).toFixed(1);
    return `${pivot.type === 'high' ? '高点' : '低点'} (${probability}% 置信度)
RSI: ${pivot.indicators.rsi.toFixed(1)}
MACD: ${pivot.indicators.macd.toFixed(4)}`;
}

function predictNextPivot(pivots) {
    if (pivots.length < 2) return null;
    
    // Get the last two pivots
    const lastPivot = pivots[pivots.length - 1];
    const prevPivot = pivots[pivots.length - 2];
    
    // Predict next pivot type (opposite of last pivot)
    const nextType = lastPivot.type === 'high' ? 'low' : 'high';
    
    // Calculate average price movement between pivots
    const priceMovements = [];
    for (let i = 1; i < pivots.length; i++) {
        priceMovements.push(Math.abs(pivots[i].price - pivots[i-1].price));
    }
    const avgMovement = average(priceMovements);
    
    // Predict next pivot price
    const predictedPrice = nextType === 'high' 
        ? lastPivot.price + avgMovement
        : lastPivot.price - avgMovement;
    
    // Calculate time between pivots
    const timeDiffs = [];
    for (let i = 1; i < pivots.length; i++) {
        timeDiffs.push(pivots[i].time - pivots[i-1].time);
    }
    const avgTimeDiff = average(timeDiffs);
    
    // Predict next pivot time
    const predictedTime = lastPivot.time + avgTimeDiff;
    
    return {
        type: nextType,
        price: predictedPrice,
        time: predictedTime,
        confidence: lastPivot.pattern.probability
    };
}

function displayPrediction(prediction) {
    const predictionMarker = {
        time: prediction.time,
        position: prediction.type === 'high' ? 'aboveBar' : 'belowBar',
        color: '#339af0',
        shape: 'circle',
        text: `预测${prediction.type === 'high' ? '高点' : '低点'}
价格: ${prediction.price.toFixed(2)}
置信度: ${(prediction.confidence * 100).toFixed(1)}%`
    };
    
    candleSeries.setMarkers([...candleSeries.markers(), predictionMarker]);
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
