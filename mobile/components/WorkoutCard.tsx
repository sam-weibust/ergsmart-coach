import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { Workout } from '../types';

interface WorkoutCardProps {
  workout: Workout;
  onPress?: (workout: Workout) => void;
}

function formatSplit(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number | null): string {
  if (!meters) return '--';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}k`;
  return `${meters}m`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

const workoutTypeColors: Record<string, string> = {
  steady_state: 'bg-blue-100 text-blue-700',
  intervals: 'bg-orange-100 text-orange-700',
  race_pace: 'bg-red-100 text-red-700',
  power_10: 'bg-purple-100 text-purple-700',
  technique: 'bg-green-100 text-green-700',
  test: 'bg-yellow-100 text-yellow-700',
  strength: 'bg-indigo-100 text-indigo-700',
  cross_training: 'bg-pink-100 text-pink-700',
};

const workoutTypeLabel: Record<string, string> = {
  steady_state: 'Steady State',
  intervals: 'Intervals',
  race_pace: 'Race Pace',
  power_10: 'Power 10',
  technique: 'Technique',
  test: 'Test',
  strength: 'Strength',
  cross_training: 'Cross Training',
};

export function WorkoutCard({ workout, onPress }: WorkoutCardProps) {
  const [expanded, setExpanded] = useState(false);

  const typeColorClass = workoutTypeColors[workout.type] ?? 'bg-gray-100 text-gray-700';
  const typeLabel = workoutTypeLabel[workout.type] ?? workout.type;

  const handlePress = () => {
    if (onPress) {
      onPress(workout);
    } else {
      setExpanded((prev) => !prev);
    }
  };

  const formattedDate = (() => {
    try {
      return format(parseISO(workout.date), 'EEE, MMM d');
    } catch {
      return workout.date;
    }
  })();

  return (
    <Pressable
      onPress={handlePress}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-3 overflow-hidden active:opacity-80"
    >
      {/* Header */}
      <View className="flex-row items-start p-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <View className={`px-2 py-0.5 rounded-full ${typeColorClass.split(' ')[0]}`}>
              <Text className={`text-xs font-medium ${typeColorClass.split(' ')[1]}`}>
                {typeLabel}
              </Text>
            </View>
            <Text className="text-xs text-gray-400">{formattedDate}</Text>
          </View>
          <Text className="text-base font-semibold text-gray-900">{workout.title}</Text>
          {workout.description && !expanded && (
            <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
              {workout.description}
            </Text>
          )}
        </View>

        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#9CA3AF"
        />
      </View>

      {/* Stats Row */}
      <View className="flex-row border-t border-gray-50 divide-x divide-gray-50">
        <View className="flex-1 py-3 items-center">
          <Text className="text-lg font-bold text-gray-900">
            {formatDistance(workout.total_distance_meters)}
          </Text>
          <Text className="text-xs text-gray-400">Distance</Text>
        </View>
        <View className="flex-1 py-3 items-center">
          <Text className="text-lg font-bold text-gray-900">
            {formatSplit(workout.avg_split_seconds)}
          </Text>
          <Text className="text-xs text-gray-400">/500m</Text>
        </View>
        <View className="flex-1 py-3 items-center">
          <Text className="text-lg font-bold text-gray-900">
            {formatDuration(workout.total_duration_seconds)}
          </Text>
          <Text className="text-xs text-gray-400">Duration</Text>
        </View>
        {workout.avg_stroke_rate && (
          <View className="flex-1 py-3 items-center">
            <Text className="text-lg font-bold text-gray-900">
              {workout.avg_stroke_rate}
            </Text>
            <Text className="text-xs text-gray-400">SPM</Text>
          </View>
        )}
      </View>

      {/* Expanded Details */}
      {expanded && (
        <View className="px-4 pb-4 pt-2 border-t border-gray-50">
          {workout.description && (
            <Text className="text-sm text-gray-600 mb-3">{workout.description}</Text>
          )}

          {workout.sets && workout.sets.length > 0 && (
            <View>
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Sets
              </Text>
              {workout.sets.map((set, i) => (
                <View
                  key={set.id ?? i}
                  className="flex-row items-center py-2 border-b border-gray-50"
                >
                  <Text className="text-xs text-gray-400 w-8">#{i + 1}</Text>
                  <Text className="text-sm text-gray-700 flex-1">
                    {formatDistance(set.distance_meters)} @ {formatSplit(set.avg_split_seconds)}
                  </Text>
                  {set.rest_seconds && (
                    <Text className="text-xs text-gray-400">
                      {formatDuration(set.rest_seconds)} rest
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View className="flex-row flex-wrap gap-2 mt-3">
            {workout.avg_watts && (
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-xs text-gray-600">{workout.avg_watts}W avg</Text>
              </View>
            )}
            {workout.total_calories && (
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-xs text-gray-600">{workout.total_calories} cal</Text>
              </View>
            )}
            {workout.rpe && (
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-xs text-gray-600">RPE {workout.rpe}/10</Text>
              </View>
            )}
            {workout.heart_rate_avg && (
              <View className="bg-red-50 rounded-full px-3 py-1">
                <Text className="text-xs text-red-600">
                  {workout.heart_rate_avg} bpm avg
                </Text>
              </View>
            )}
          </View>

          {workout.notes && (
            <View className="mt-3 bg-gray-50 rounded-xl p-3">
              <Text className="text-xs text-gray-500">{workout.notes}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
