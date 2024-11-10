class ContractIndicators {
    constructor(candleData) {
        this.candleData = candleData;
    }

    calculateMA(period) {
        const result = [];
        for (let i = 0; i < this.candleData.length; i++) {
            if (i < period - 1) {
                result.push([this.candleData[i].timestamp, null]);
                continue;
            }
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += this.candleData[i - j].close;
            }
            result.push([this.candleData[i].timestamp, sum / period]);
        }
        return {
            name: 'MA' + period,
            type: 'line',
            data: result
        };
    }

    calculateBollingerBands() {
        const period = 20;
        const multiplier = 2;
        const upper = [];
        const middle = [];
        const lower = [];

        for (let i = 0; i < this.candleData.length; i++) {
            if (i < period - 1) {
                upper.push([this.candleData[i].timestamp, null]);
                middle.push([this.candleData[i].timestamp, null]);
                lower.push([this.candleData[i].timestamp, null]);
                continue;
            }

            let sum = 0;
            let sumSq = 0;
            for (let j = 0; j < period; j++) {
                sum += this.candleData[i - j].close;
                sumSq += this.candleData[i - j].close * this.candleData[i - j].close;
            }
            const ma = sum / period;
            const std = Math.sqrt(sumSq / period - ma * ma);

            middle.push([this.candleData[i].timestamp, ma]);
            upper.push([this.candleData[i].timestamp, ma + multiplier * std]);
            lower.push([this.candleData[i].timestamp, ma - multiplier * std]);
        }

        return { upper, middle, lower };
    }

    getSeriesData(showMA, showBB, feedbacks) {
        const series = [
            {
                name: 'K线',
                type: 'candlestick',
                data: this.candleData.map(candle => [
                    candle.timestamp,
                    candle.open,
                    candle.close,
                    candle.low,
                    candle.high
                ])
            }
        ];

        // 添加技术指标
        if (showMA) {
            series.push(
                this.calculateMA(5),
                this.calculateMA(10),
                this.calculateMA(20)
            );
        }

        if (showBB) {
            const bb = this.calculateBollingerBands();
            series.push(
                { name: 'BB上轨', type: 'line', data: bb.upper },
                { name: 'BB中轨', type: 'line', data: bb.middle },
                { name: 'BB下轨', type: 'line', data: bb.lower }
            );
        }

        // 添加标记点
        series.push(
            {
                name: '做多标记',
                type: 'scatter',
                data: feedbacks.filter(f => f.action === 'long').map(f => ({
                    value: [f.timestamp, this.candleData.find(c => c.timestamp === f.timestamp)?.high || 0],
                    itemStyle: { color: '#28a745' },
                    symbol: 'arrow',
                    symbolSize: 15,
                    symbolRotate: 180
                }))
            },
            {
                name: '做空标记',
                type: 'scatter',
                data: feedbacks.filter(f => f.action === 'short').map(f => ({
                    value: [f.timestamp, this.candleData.find(c => c.timestamp === f.timestamp)?.low || 0],
                    itemStyle: { color: '#dc3545' },
                    symbol: 'arrow',
                    symbolSize: 15
                }))
            }
        );

        return series;
    }
}

window.ContractIndicators = ContractIndicators;
