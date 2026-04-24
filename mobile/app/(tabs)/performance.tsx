import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { VictoryChart, VictoryLine, VictoryAxis, VictoryScatter, VictoryTheme } from 'victory-native';
import { format, subDays } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { getPersonalRecords, getPerformanceData } from '../../api/performance';
import { Card } from '../../components/ui/Card';
import type { PRDistance } from '../../types';

const PR_DISTANCES: { label: string; value: PRDistance }[] = [
  { label: '2k', value: '2000m' },
  { label: '6k', value: '6000m' },
  { label: '10k', value: '10000m' },
  { label: '30min', value: '30min' },
  { label: '1k', value: '1000m' },
  { label: '5k', value: '5000m' },
];

function formatSplit(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type MetricKey = 'avg_split_seconds' | 'avg_watts' | 'total_distance_meters';

const METRICS: { label: string; value: MetricKey; unit: string }[] = [
  { label: 'Split', value: 'avg_split_seconds', unit: '/500m' },
  { label: 'Watts', value: 'avg_watts', unit: 'W' },
  { label: 'Distance', value: 'total_distance_meters', unit: 'm' },
];

export default function PerformanceScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('avg_split_seconds');

  const prsQuery = useQuery({
    queryKey: ['personal-records', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await getPersonalRecords(userId);
      if (error) throw new Error(error);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const dateRange = {
    from: format(subDays(new Date(), 90), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  };

  const performanceQuery = useQuery({
    queryKey: ['performance-data', userId, selectedMetric, dateRange],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await getPerformanceData(userId, dateRange, selectedMetric);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!userId,
  });

  const prs = prsQuery.data ?? [];

  // Build PR map: best PR per distance
  const prMap = prs.reduce<Record<string, typeof prs[0]>>((acc, pr) => {
    if (!acc[pr.distance] || pr.split_seconds < acc[pr.distance].split_seconds) {
      acc[pr.distance] = pr;
    }
    return acc;
  }, {});

  const chartData = (performanceQuery.data?.data ?? []).map((pt, i) => ({
    x: i,
    y: pt.value,
    date: pt.date,
  }));

  const trend = performanceQuery.data?.trend;
  const trendColor =
    trend === 'improving'
      ? '#16A34A'
      : trend === 'declining'
      ? '#DC2626'
      : '#6B7280';
  const trendIcon =
    trend === 'improving'
      ? 'trending-up'
      : trend === 'declining'
      ? 'trending-down'
      : 'minus';

  const changePercent = performanceQuery.data?.change_percent;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="bg-white px-5 pt-4 pb-4 border-b border-gray-100">
          <Text className="text-xl font-bold text-gray-900">Performance</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            Your records and progress
          </Text>
        </View>

        <View className="px-4 pt-4 gap-4">
          {/* Personal Records Grid */}
          <View>
            <Text className="text-base font-semibold text-gray-900 mb-3">
              Personal Records
            </Text>

            {prsQuery.isLoading ? (
              <ActivityIndicator color="#1B3A6B" />
            ) : (
              <View className="flex-row flex-wrap gap-3">
                {PR_DISTANCES.map((dist) => {
                  const pr = prMap[dist.value];
                  return (
                    <View
                      key={dist.value}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
                      style={{ width: '47%' }}
                    >
                      <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                        {dist.label}
                      </Text>
                      {pr ? (
                        <>
                          <Text className="text-2xl font-bold text-primary">
                            {formatSplit(pr.split_seconds)}
                          </Text>
                          <Text className="text-xs text-gray-400 mt-0.5">
                            /500m
                          </Text>
                          {pr.total_time_seconds && (
                            <Text className="text-sm text-gray-600 mt-1">
                              {formatTime(pr.total_time_seconds)} total
                            </Text>
                          )}
                          <Text className="text-xs text-gray-400 mt-1">
                            {format(new Date(pr.date), 'MMM d, yyyy')}
                          </Text>
                        </>
                      ) : (
                        <View className="mt-1">
                          <Text className="text-gray-300 text-lg font-bold">
                            --:--
                          </Text>
                          <Text className="text-xs text-gray-300 mt-1">
                            No record yet
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Progress Chart */}
          <Card title="90-Day Progress">
            {/* Metric Selector */}
            <View className="flex-row gap-2 mb-4">
              {METRICS.map((m) => (
                <Pressable
                  key={m.value}
                  onPress={() => setSelectedMetric(m.value)}
                  className={[
                    'flex-1 py-2 rounded-xl border items-center',
                    selectedMetric === m.value
                      ? 'bg-primary border-primary'
                      : 'bg-white border-gray-200',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'text-xs font-semibold',
                      selectedMetric === m.value ? 'text-white' : 'text-gray-500',
                    ].join(' ')}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Trend Badge */}
            {trend && changePercent !== null && (
              <View className="flex-row items-center gap-2 mb-3">
                <View
                  className="flex-row items-center gap-1 px-3 py-1 rounded-full"
                  style={{ backgroundColor: trendColor + '15' }}
                >
                  <Feather name={trendIcon as never} size={14} color={trendColor} />
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: trendColor }}
                  >
                    {trend.charAt(0).toUpperCase() + trend.slice(1)}{' '}
                    {Math.abs(changePercent).toFixed(1)}%
                  </Text>
                </View>
                <Text className="text-xs text-gray-400">over 90 days</Text>
              </View>
            )}

            {performanceQuery.isLoading ? (
              <View className="h-48 items-center justify-center">
                <ActivityIndicator color="#1B3A6B" />
              </View>
            ) : chartData.length < 2 ? (
              <View className="h-48 items-center justify-center">
                <Feather name="bar-chart-2" size={32} color="#E5E7EB" />
                <Text className="text-gray-400 mt-2 text-sm">
                  Not enough data yet
                </Text>
                <Text className="text-gray-300 text-xs mt-1">
                  Log workouts to see your progress
                </Text>
              </View>
            ) : (
              <VictoryChart
                theme={VictoryTheme.clean}
                height={200}
                padding={{ top: 20, bottom: 40, left: 55, right: 20 }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: '#E5E7EB' },
                    tickLabels: { fontSize: 10, fill: '#9CA3AF' },
                  }}
                  tickFormat={(_, i) => {
                    const point = chartData[i];
                    if (!point) return '';
                    try {
                      return format(new Date(point.date), 'M/d');
                    } catch {
                      return '';
                    }
                  }}
                  tickCount={5}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: '#E5E7EB' },
                    tickLabels: { fontSize: 10, fill: '#9CA3AF' },
                  }}
                  tickFormat={(val) => {
                    if (selectedMetric === 'avg_split_seconds') return formatSplit(val);
                    if (selectedMetric === 'total_distance_meters')
                      return val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val;
                    return Math.round(val);
                  }}
                />
                <VictoryLine
                  data={chartData}
                  style={{
                    data: { stroke: '#1B3A6B', strokeWidth: 2 },
                  }}
                  interpolation="monotoneX"
                />
                <VictoryScatter
                  data={chartData}
                  size={4}
                  style={{
                    data: { fill: '#1B3A6B', stroke: 'white', strokeWidth: 2 },
                  }}
                />
              </VictoryChart>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
