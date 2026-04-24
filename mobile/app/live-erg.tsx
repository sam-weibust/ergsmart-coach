import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWorkouts } from '../hooks/useWorkouts';
import { useAuth } from '../hooks/useAuth';
import { useUiStore } from '../store/uiStore';
import { MetricTile } from '../components/MetricTile';
import { useErgBle } from '../hooks/useErgBle';
import type { ErgMetrics } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSplit(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '--:--';
  if (seconds > 999) return '--:--'; // Not yet rowing
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number | null): string {
  if (!meters) return '0';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)}k`;
  return meters.toFixed(0);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LiveErgScreen() {
  const { connectionState, metrics, deviceName, scan, disconnect } = useErgBle();
  const { logWorkout } = useWorkouts();
  const { user } = useAuth();
  const showToast = useUiStore((s) => s.showToast);

  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [workoutStartTime, setWorkoutStartTime] = useState<Date | null>(null);
  const [finalMetrics, setFinalMetrics] = useState<ErgMetrics | null>(null);

  const handleConnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scan();
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from the PM5?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnect },
    ]);
  };

  const startWorkout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsWorkoutActive(true);
    setWorkoutStartTime(new Date());
    setFinalMetrics(null);
  };

  const stopWorkout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setFinalMetrics({ ...metrics });
    setIsWorkoutActive(false);
  };

  const saveWorkout = async () => {
    if (!finalMetrics || !user) return;

    try {
      await logWorkout({
        user_id: user.id,
        date: new Date().toISOString().split('T')[0],
        type: 'steady_state',
        title: 'Live Erg Session',
        total_distance_meters: finalMetrics.distance_meters ?? undefined,
        total_duration_seconds: finalMetrics.elapsed_seconds ?? undefined,
        avg_split_seconds: finalMetrics.split_seconds ?? undefined,
        avg_stroke_rate: finalMetrics.stroke_rate ?? undefined,
        avg_watts: finalMetrics.watts ?? undefined,
        total_calories: finalMetrics.calories ?? undefined,
      });
      showToast('Workout saved!', 'success');
      setFinalMetrics(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    }
  };

  const discardWorkout = () => {
    Alert.alert('Discard', 'Discard this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => setFinalMetrics(null),
      },
    ]);
  };

  const isConnected = connectionState === 'connected';
  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2 rounded-xl bg-white/10 active:bg-white/20 mr-3"
        >
          <Feather name="x" size={20} color="white" />
        </Pressable>
        <Text className="text-white text-lg font-bold flex-1">Live Erg</Text>

        {/* Connection Status */}
        <Pressable
          onPress={isConnected ? handleDisconnect : handleConnect}
          className={[
            'flex-row items-center gap-2 px-3 py-2 rounded-xl',
            isConnected ? 'bg-green-800/50' : 'bg-white/10',
          ].join(' ')}
          disabled={isScanning || isConnecting}
        >
          <View
            className={[
              'w-2 h-2 rounded-full',
              isConnected
                ? 'bg-green-400'
                : isScanning || isConnecting
                ? 'bg-yellow-400'
                : 'bg-gray-500',
            ].join(' ')}
          />
          <Text className="text-white text-xs font-medium">
            {isConnected
              ? deviceName ?? 'Connected'
              : isScanning
              ? 'Scanning...'
              : isConnecting
              ? 'Connecting...'
              : 'Connect PM5'}
          </Text>
        </Pressable>
      </View>

      {/* Post-workout Summary */}
      {finalMetrics && (
        <View className="mx-4 mb-4 bg-primary rounded-2xl p-4">
          <Text className="text-white font-bold text-base mb-3">
            Workout Complete
          </Text>
          <View className="flex-row gap-4 mb-4">
            <View className="flex-1">
              <Text className="text-white/60 text-xs">Distance</Text>
              <Text className="text-white text-xl font-bold">
                {formatDistance(finalMetrics.distance_meters)}m
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-white/60 text-xs">Avg Split</Text>
              <Text className="text-white text-xl font-bold">
                {formatSplit(finalMetrics.split_seconds)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-white/60 text-xs">Calories</Text>
              <Text className="text-white text-xl font-bold">
                {finalMetrics.calories ?? '--'}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <Pressable
              onPress={saveWorkout}
              className="flex-1 bg-white rounded-xl py-3 items-center active:bg-white/90"
            >
              <Text className="text-primary font-bold">Save</Text>
            </Pressable>
            <Pressable
              onPress={discardWorkout}
              className="flex-1 bg-white/10 rounded-xl py-3 items-center active:bg-white/20"
            >
              <Text className="text-white/70 font-medium">Discard</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Main Metrics Grid */}
      <View className="flex-1 px-4">
        {!isConnected ? (
          <View className="flex-1 items-center justify-center gap-6">
            <View className="items-center">
              <View className="w-24 h-24 rounded-full bg-white/10 items-center justify-center mb-4">
                <Feather name="bluetooth" size={44} color="#4B78B0" />
              </View>
              <Text className="text-white text-xl font-bold">Not Connected</Text>
              <Text className="text-gray-400 text-sm mt-2 text-center">
                Connect to your Concept2 PM5 to see live metrics
              </Text>
            </View>

            <Pressable
              onPress={handleConnect}
              disabled={isScanning || isConnecting}
              className="bg-primary rounded-2xl px-8 py-4 active:bg-primary-600"
            >
              <View className="flex-row items-center gap-3">
                <Feather
                  name={isScanning || isConnecting ? 'loader' : 'bluetooth'}
                  size={20}
                  color="white"
                />
                <Text className="text-white text-base font-bold">
                  {isScanning ? 'Scanning for PM5...' : isConnecting ? 'Connecting...' : 'Scan for PM5'}
                </Text>
              </View>
            </Pressable>

            <Text className="text-gray-600 text-xs text-center px-6">
              Make sure your Concept2 PM5 is powered on and Bluetooth is enabled on your device
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* Primary: Split */}
            <View className="mb-3">
              <MetricTile
                label="Split"
                value={formatSplit(metrics.split_seconds)}
                unit="/500m"
                dark
                large
                style={{ minHeight: 140 }}
              />
            </View>

            {/* Secondary Row: Rate + Distance */}
            <View className="flex-row gap-3 mb-3">
              <MetricTile
                label="Rate"
                value={metrics.stroke_rate?.toString() ?? '--'}
                unit="spm"
                dark
              />
              <MetricTile
                label="Distance"
                value={formatDistance(metrics.distance_meters)}
                unit="meters"
                dark
              />
            </View>

            {/* Tertiary Row: Calories + Watts */}
            <View className="flex-row gap-3 mb-3">
              <MetricTile
                label="Calories"
                value={metrics.calories?.toString() ?? '--'}
                unit="cal"
                dark
              />
              <MetricTile
                label="Watts"
                value={metrics.watts?.toString() ?? '--'}
                unit="W"
                dark
              />
            </View>

            {/* Time + HR */}
            <View className="flex-row gap-3 mb-4">
              <MetricTile
                label="Time"
                value={formatTime(metrics.elapsed_seconds ?? 0)}
                dark
              />
              {metrics.heart_rate && (
                <MetricTile
                  label="Heart Rate"
                  value={metrics.heart_rate.toString()}
                  unit="bpm"
                  dark
                  valueColor="#F87171"
                />
              )}
            </View>

            {/* Start / Stop Button */}
            <Pressable
              onPress={isWorkoutActive ? stopWorkout : startWorkout}
              className={[
                'rounded-2xl py-5 items-center active:opacity-80',
                isWorkoutActive ? 'bg-red-600' : 'bg-green-600',
              ].join(' ')}
            >
              <View className="flex-row items-center gap-3">
                <Feather
                  name={isWorkoutActive ? 'square' : 'play'}
                  size={22}
                  color="white"
                />
                <Text className="text-white text-xl font-bold">
                  {isWorkoutActive ? 'Stop Workout' : 'Start Workout'}
                </Text>
              </View>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
