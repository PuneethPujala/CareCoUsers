import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

export default function AIPredictionChart({ vitalsHistory, predictionData, metricName, unit }) {
  const safeHistory = vitalsHistory || [];
  const safePrediction = predictionData || [];
  
  const labels = [
    ...safeHistory.map((item) => item.label),
    ...safePrediction.map((item) => item.label)
  ];

  const allValues = [
    ...safeHistory.map(item => item.value),
    ...safePrediction.map(item => item.value)
  ];

  // AI Models need prediction data to exist to render an actual forecast chart
  if (!safePrediction || safePrediction.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Health Outlook</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={styles.emptyTitle}>AI Model Learning...</Text>
          <Text style={styles.emptyDesc}>Our AI needs at least 7 historical readings to identify your baseline and forecast future trends. Keep logging!</Text>
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

  const data = {
    labels: labels.map((l, i) => (i % 2 === 0 ? l : '')), 
    datasets: [
      {
        data: validValues,
        color: (opacity = 1) => `rgba(186, 230, 253, ${opacity})`, // Light blue connecting line
        strokeWidth: 2
      }
    ]
  };

  const chartConfig = {
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    color: (opacity = 1) => `rgba(226, 232, 240, ${opacity})`, // grid line color
    strokeWidth: 2, 
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: '#FFF'
    },
    getDotColor: (dataPoint, index) => {
      return index >= vitalsHistory.length ? '#F59E0B' : '#0EA5E9';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{metricName} Outlook</Text>
      
      {/* Custom Legend */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#0EA5E9' }]} />
          <Text style={styles.legendText}>History</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>AI Forecast</Text>
        </View>
      </View>

      <View style={styles.chartWrapper}>
        <LineChart
          data={data}
          width={screenWidth - 40}
          height={220}
          chartConfig={chartConfig}
          bezier={false} 
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={false}
          fromZero={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { y: 8, x: 0 },
    elevation: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
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
    marginLeft: -10,
    overflow: 'hidden',
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
