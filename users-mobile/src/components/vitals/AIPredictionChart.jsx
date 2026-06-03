import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

export default function AIPredictionChart({ vitalsHistory, predictionData, metricName, unit }) {
  const [chartWidth, setChartWidth] = useState(screenWidth - 100);
  const safeHistory = vitalsHistory || [];
  
  // ── Client-side fallback prediction (Physiological Mean Reversion) ──
  // When the backend AI service has no predictions, generate a 3-day
  // forecast that models homeostasis (reverting towards the patient's
  // baseline and general physiological averages) rather than linear runaway.
  const effectivePrediction = (() => {
    if (predictionData && predictionData.length > 0) return predictionData;
    if (safeHistory.length < 3) return []; // Need at least 3 points
    
    const vals = safeHistory.map(h => h.value).filter(v => v > 0);
    if (vals.length < 3) return [];
    
    const n = vals.length;
    const xMean = (n - 1) / 2;
    const yMean = vals.reduce((a, b) => a + b, 0) / n;
    
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (vals[i] - yMean);
      den += (i - xMean) * (i - xMean);
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    
    // Determine physiological baseline based on metric name
    const getBaseline = (name) => {
      const lower = (name || '').toLowerCase();
      if (lower.includes('heart')) return 75; // 75 bpm HR average
      if (lower.includes('pressure') || lower.includes('bp') || lower.includes('systolic')) return 120; // 120 mmHg Systolic
      if (lower.includes('oxygen') || lower.includes('spo')) return 98; // 98% SpO2 average
      if (lower.includes('hydration')) return 65; // 65% Hydration baseline
      return 80;
    };

    const userAverage = yMean;
    const baseline = getBaseline(metricName);
    const target = (userAverage + baseline) / 2; // Blend user history and medical standard
    
    const lastVal = vals[vals.length - 1];
    let current = lastVal;
    let currentSlope = slope * 0.45; // Dampen the initial trend momentum
    
    const forecasts = [];
    const today = new Date();
    
    for (let i = 1; i <= 3; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + i);
      
      // Predict using momentum and reversion to baseline
      const predicted = current + currentSlope + 0.35 * (target - current);
      
      // Decay momentum for subsequent days
      currentSlope *= 0.5;
      
      // physiological safety clamps
      let clamped = predicted;
      const lowerName = (metricName || '').toLowerCase();
      if (lowerName.includes('oxygen') || lowerName.includes('spo')) {
        clamped = Math.max(92, Math.min(predicted, 100)); // Cap SpO2 between 92% and 100%
      } else if (lowerName.includes('hydration')) {
        clamped = Math.max(20, Math.min(predicted, 100)); // Cap hydration
      } else if (lowerName.includes('pressure') || lowerName.includes('bp') || lowerName.includes('systolic')) {
        clamped = Math.max(85, Math.min(predicted, 180)); // BP limits
      } else {
        clamped = Math.max(45, Math.min(predicted, 160)); // HR limits
      }
      
      const rounded = Math.round(clamped);
      forecasts.push({
        label: futureDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        value: rounded,
      });
      current = clamped;
    }
    return forecasts;
  })();
  
  const safePrediction = effectivePrediction;
  const isBackendAI = predictionData && predictionData.length > 0;
  
  const filteredHistory = safeHistory.filter(item => item.value != null && !isNaN(Number(item.value)));
  const filteredPrediction = safePrediction.filter(item => item.value != null && !isNaN(Number(item.value)));

  const labels = [
    ...filteredHistory.map((item) => item.label),
    ...filteredPrediction.map((item) => item.label)
  ];

  const allValues = [
    ...filteredHistory.map(item => item.value),
    ...filteredPrediction.map(item => item.value)
  ];

  // AI Models need prediction data to exist to render an actual forecast chart
  if (!safePrediction || safePrediction.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Health Outlook</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={styles.emptyTitle}>AI Model Learning...</Text>
          <Text style={styles.emptyDesc}>Log at least 3 vitals readings to see your estimated health trends. Our AI improves with more data!</Text>
        </View>
      </View>
    );
  }

  // A line chart needs at least 2 points to draw a path without glitching/forming triangles
  if (allValues.length < 2) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Health Outlook</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>Insufficient Data</Text>
          <Text style={styles.emptyDesc}>Log at least two vitals readings to activate the AI health forecast.</Text>
        </View>
      </View>
    );
  }

  // chart-kit crashes if all values are perfectly identical and 0
  const validValues = allValues.length ? allValues : [0];

  // Max 5 labels to prevent overlap
  const labelInterval = Math.max(1, Math.ceil(labels.length / 5));

  const data = {
    labels: labels.map((l, i) => (i % labelInterval === 0 ? l : '')), 
    datasets: [
      {
        data: allValues.map(Number),
        color: (opacity = 1) => `rgba(14, 165, 233, ${opacity})`, // Light blue connecting line
        strokeWidth: 2
      }
    ]
  };

  const chartConfig = {
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    color: (opacity = 1) => `rgba(226, 232, 240, ${opacity})`, // grid line color
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`, // text label color
    strokeWidth: 2, 
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: '#FFF'
    },
    getDotColor: (dataPoint, index) => {
      // Connect line is solid, but dots change color for predictions
      return index >= safeHistory.length ? (isBackendAI ? '#F59E0B' : '#A78BFA') : '#0EA5E9';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{metricName} Outlook</Text>
      
      {/* Honesty subtitle */}
      <Text style={styles.honestyLabel}>
        {isBackendAI 
          ? 'Powered by AI analysis of your vitals history'
          : 'Estimated trend based on recent readings'
        }
      </Text>
      
      {/* Custom Legend */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#0EA5E9' }]} />
          <Text style={styles.legendText}>History</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[
            styles.legendDot, 
            isBackendAI 
              ? { backgroundColor: '#F59E0B' } 
              : { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#A78BFA', borderStyle: 'dashed' }
          ]} />
          <Text style={styles.legendText}>{isBackendAI ? 'AI Forecast' : 'Estimated Trend'}</Text>
        </View>
      </View>

      <View style={styles.chartWrapper} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 16)}>
        <LineChart
          data={data}
          width={chartWidth}
          height={200}
          chartConfig={chartConfig}
          bezier={false} 
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={false}
          fromZero={true}
          formatYLabel={(y) => Math.round(Number(y)).toString()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  honestyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  chartWrapper: {
    alignItems: 'center',
    marginVertical: 4,
    overflow: 'hidden',
    width: '100%',
    borderRadius: 12,
  },
  chart: {
    borderRadius: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderStyle: 'dashed',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  }
});
