class ContractData {
    constructor() {
        this.feedbackData = [];
        this.loadFeedbackData();
    }

    loadFeedbackData() {
        const storedData = localStorage.getItem('contractFeedback');
        if (storedData) {
            this.feedbackData = JSON.parse(storedData);
        }
    }

    saveFeedbackData() {
        localStorage.setItem('contractFeedback', JSON.stringify(this.feedbackData));
    }

    async loadData(startDate, endDate, timeframe) {
        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timestamp: endDate.getTime()
                })
            });

            if (!response.ok) {
                throw new Error('加载数据失败');
            }

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            // 过滤时间范围内的数据
            const candleData = result.candleData['15m'].filter(candle => 
                candle.timestamp >= startDate.getTime() && 
                candle.timestamp <= endDate.getTime()
            );

            return {
                candleData,
                indicators: this.calculateIndicators(candleData)
            };

        } catch (error) {
            throw new Error('加载数据失败: ' + error.message);
        }
    }

    calculateIndicators(candleData) {
        return {
            rsi: this.calculateRSI(candleData),
            macd: this.calculateMACD(candleData),
            bollingerBands: this.calculateBollingerBands(candleData),
            atr: this.calculateATR(candleData),
            obv: this.calculateOBV(candleData),
            momentum: this.calculateMomentum(candleData)
        };
    }

    calculateRSI(data, period = 14) {
        const changes = [];
        const gains = [];
        const losses = [];
        
        // 计算价格变化
        for (let i = 1; i < data.length; i++) {
            changes.push(data[i].close - data[i - 1].close);
        }

        // 计算初始平均涨跌幅
        for (let i = 0; i < period; i++) {
            const change = changes[i];
            gains.push(Math.max(0, change));
            losses.push(Math.max(0, -change));
        }

        let avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
        let avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;

        const rsi = [];
        rsi.push({
            timestamp: data[period].timestamp,
            value: 100 - (100 / (1 + avgGain / avgLoss))
        });

        // 计算后续RSI值
        for (let i = period; i < changes.length; i++) {
            avgGain = (avgGain * (period - 1) + Math.max(0, changes[i])) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(0, -changes[i])) / period;
            
            rsi.push({
                timestamp: data[i + 1].timestamp,
                value: 100 - (100 / (1 + avgGain / avgLoss))
            });
        }

        return rsi;
    }

    calculateMACD(data) {
        const shortPeriod = 12;
        const longPeriod = 26;
        const signalPeriod = 9;
        
        const shortEMA = this.calculateEMA(data.map(d => d.close), shortPeriod);
        const longEMA = this.calculateEMA(data.map(d => d.close), longPeriod);
        
        const macdLine = shortEMA.map((short, i) => ({
            timestamp: data[i].timestamp,
            value: short - longEMA[i]
        }));
        
        const signalLine = this.calculateEMA(
            macdLine.map(d => d.value), 
            signalPeriod
        ).map((signal, i) => ({
            timestamp: data[i].timestamp,
            value: signal
        }));
        
        const histogram = macdLine.map((macd, i) => ({
            timestamp: macd.timestamp,
            value: macd.value - signalLine[i].value
        }));

        return {
            macd: macdLine,
            signal: signalLine,
            histogram
        };
    }

    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        const ema = [data[0]];
        
        for (let i = 1; i < data.length; i++) {
            ema.push(data[i] * k + ema[i - 1] * (1 - k));
        }
        
        return ema;
    }

    calculateBollingerBands(data, period = 20, multiplier = 2) {
        const bands = [];
        
        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const sma = slice.reduce((sum, candle) => sum + candle.close, 0) / period;
            
            const squaredDiffs = slice.map(candle => Math.pow(candle.close - sma, 2));
            const standardDeviation = Math.sqrt(
                squaredDiffs.reduce((sum, diff) => sum + diff, 0) / period
            );
            
            bands.push({
                timestamp: data[i].timestamp,
                middle: sma,
                upper: sma + (multiplier * standardDeviation),
                lower: sma - (multiplier * standardDeviation)
            });
        }
        
        return bands;
    }

    calculateATR(data, period = 14) {
        const tr = [];
        const atr = [];
        
        // 计算真实波幅
        for (let i = 1; i < data.length; i++) {
            const high = data[i].high;
            const low = data[i].low;
            const prevClose = data[i - 1].close;
            
            tr.push(Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            ));
        }
        
        // 计算ATR
        let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
        atr.push({
            timestamp: data[period].timestamp,
            value: sum / period
        });
        
        for (let i = period; i < tr.length; i++) {
            const value = (atr[atr.length - 1].value * (period - 1) + tr[i]) / period;
            atr.push({
                timestamp: data[i + 1].timestamp,
                value
            });
        }
        
        return atr;
    }

    calculateOBV(data) {
        const obv = [{
            timestamp: data[0].timestamp,
            value: data[0].volume
        }];
        
        for (let i = 1; i < data.length; i++) {
            const currentClose = data[i].close;
            const previousClose = data[i - 1].close;
            let currentOBV = obv[i - 1].value;
            
            if (currentClose > previousClose) {
                currentOBV += data[i].volume;
            } else if (currentClose < previousClose) {
                currentOBV -= data[i].volume;
            }
            
            obv.push({
                timestamp: data[i].timestamp,
                value: currentOBV
            });
        }
        
        return obv;
    }

    calculateMomentum(data, period = 10) {
        const momentum = [];
        
        for (let i = period; i < data.length; i++) {
            momentum.push({
                timestamp: data[i].timestamp,
                value: (data[i].close - data[i - period].close) / data[i - period].close * 100
            });
        }
        
        return momentum;
    }

    async submitFeedback(feedback) {
        try {
            // 添加到本地存储
            this.feedbackData.push({
                ...feedback,
                id: Date.now(),
                createdAt: new Date().toISOString()
            });
            this.saveFeedbackData();

            // 发送到服务器
            const response = await fetch('/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(feedback)
            });

            if (!response.ok) {
                throw new Error('提交反馈失败');
            }

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            return true;

        } catch (error) {
            throw new Error('提交反馈失败: ' + error.message);
        }
    }

    async trainModel() {
        try {
            const response = await fetch('/retrain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    feedback: this.feedbackData
                })
            });

            if (!response.ok) {
                throw new Error('训练模型失败');
            }

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            return true;

        } catch (error) {
            throw new Error('训练模型失败: ' + error.message);
        }
    }

    getFeedbackData() {
        return this.feedbackData;
    }
}

window.ContractData = ContractData;
