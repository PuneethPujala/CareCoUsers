import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;

// Expected format of `vitalsHistory` and `predictionData`: Array of { value, label }
export default function AIPredictionChart({ vitalsHistory, predictionData, metricName, unit }) {
  if (!vitalsHistory || !vitalsHistory.length) return null;

  // Stitch the chart data so that prediction seamlessly starts from the last history point
  const lastHistoryPoint = vitalsHistory[vitalsHistory.length - 1];

  // We add the last history point to the beginning of the prediction so the lines connect.
  const stitchedPrediction = [lastHistoryPoint, ...(predictionData || [])];

  const labels = [
    ...vitalsHistory.map((item) => item.label),
    ...(predictionData || []).map((item) => item.label)
  ];

  const historyValues = [
      ...vitalsHistory.map(item => item.value),
      ...(predictionData || []).map(() => null)
  ];

  const predictionValues = [
      ...vitalsHistory.slice(0, -1).map(() => null),
      ...stitchedPrediction.map(item => item.value)
  ];

  const data = {
    labels: labels.map((l, i) => (i % 2 === 0 ? l : '')), // Show every other label to save space
    datasets: [
      {
        data: historyValues,
        color: (opacity = 1) => `rgba(14, 165, 233, ${opacity})`, // Blue for solid history
        strokeWidth: 3
      },
      {
        data: predictionValues,
        color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`, // Orange Dashed for predictions
        strokeWidth: 3,
        strokeDashArray: [10, 5] // Creating dashed effect if chart-kit version supports it.
      }
    ],
    legend: ['History', 'AI Forecast']
  };

  const chartConfig = {
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    strokeWidth: 3, 
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: '#FFF'
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{metricName} Forecast</Text>
      <View style={styles.chartWrapper}>
        <LineChart
          data={data}
          width={screenWidth - 40}
          height={220}
          chartConfig={chartConfig}
          bezier={false} // Better for showing exact predicted drops/spikes 
          style={styles.chart}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { y: 4, x: 0 },
    elevation: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 10,
  },
  chartWrapper: {
    alignItems: 'center',
    marginLeft: -10
  },
  chart: {
    borderRadius: 16,
  }
});
