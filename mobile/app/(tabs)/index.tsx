import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';
import { useWorkouts } from '../../hooks/useWorkouts';
import { WorkoutCard } from '../../components/WorkoutCard';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

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

export default function HomeScreen() {
  const { displayName } = useAuth();
  const {
    recentWorkouts,
    lastWorkout,
    currentStreak,
    totalWorkoutsThisWeek,
    trainingPlan,
    isLoading,
    refetch,
  } = useWorkouts();

  const today = format(new Date(), 'EEEE, MMMM d');
  const dayOfWeek = new Date().getDay();

  const todaysPlan = trainingPlan?.days?.find(
    (d) => d.day_of_week === dayOfWeek
  ) ?? null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor="#1B3A6B"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="bg-primary px-5 pt-4 pb-8">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-white/70 text-sm">{today}</Text>
            <Pressable
              onPress={() => router.push('/live-erg')}
              className="bg-white/20 rounded-full p-2 active:bg-white/30"
            >
              <Feather name="activity" size={20} color="white" />
            </Pressable>
          </View>
          <Text className="text-white text-2xl font-bold">
            Welcome back, {displayName.split(' ')[0]}
          </Text>
          <Text className="text-white/70 text-sm mt-1">
            Ready to get on the water?
          </Text>
        </View>

        {/* Stats Row */}
        <View className="flex-row px-4 -mt-5 gap-3 mb-4">
          <View className="flex-1 bg-white rounded-2xl shadow-sm p-3 items-center border border-gray-100">
            <Text className="text-2xl font-bold text-primary">
              {currentStreak}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">Day Streak</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl shadow-sm p-3 items-center border border-gray-100">
            <Text className="text-2xl font-bold text-primary">
              {totalWorkoutsThisWeek}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">This Week</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl shadow-sm p-3 items-center border border-gray-100">
            <Text className="text-2xl font-bold text-primary">
              {formatSplit(lastWorkout?.avg_split_seconds ?? null)}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">Last Split</Text>
          </View>
        </View>

        <View className="px-4 gap-4">
          {/* Today's Workout Plan */}
          {todaysPlan ? (
            <Card
              title="Today's Plan"
              subtitle={todaysPlan.is_rest_day ? 'Rest Day' : todaysPlan.title}
              headerRight={
                <View className="bg-primary/10 rounded-full px-2 py-0.5">
                  <Text className="text-primary text-xs font-semibold">
                    {todaysPlan.duration_minutes}min
                  </Text>
                </View>
              }
            >
              {todaysPlan.is_rest_day ? (
                <View className="items-center py-4">
                  <Feather name="moon" size={32} color="#9CA3AF" />
                  <Text className="text-gray-500 mt-2">
                    Rest and recover today
                  </Text>
                </View>
              ) : (
                <View>
                  <Text className="text-sm text-gray-600 mb-3">
                    {todaysPlan.description}
                  </Text>
                  {todaysPlan.exercises.slice(0, 3).map((ex, i) => (
                    <View
                      key={i}
                      className="flex-row items-center py-2 border-b border-gray-50"
                    >
                      <View className="w-6 h-6 rounded-full bg-primary/10 items-center justify-center mr-3">
                        <Text className="text-primary text-xs font-bold">
                          {i + 1}
                        </Text>
                      </View>
                      <Text className="text-sm text-gray-700 flex-1">
                        {ex.name}
                      </Text>
                      {ex.distance_meters && (
                        <Text className="text-sm font-semibold text-primary">
                          {formatDistance(ex.distance_meters)}
                        </Text>
                      )}
                    </View>
                  ))}
                  <Button
                    onPress={() => router.push('/training' as never)}
                    variant="outline"
                    size="sm"
                    fullWidth
                    style={{ marginTop: 12 }}
                  >
                    View Full Plan
                  </Button>
                </View>
              )}
            </Card>
          ) : (
            <Card title="Today's Training">
              <View className="items-center py-4">
                <Feather name="calendar" size={32} color="#9CA3AF" />
                <Text className="text-gray-500 mt-2 text-center">
                  No training plan yet
                </Text>
                <Button
                  onPress={() => router.push('/training' as never)}
                  variant="primary"
                  size="sm"
                  style={{ marginTop: 12 }}
                >
                  Generate Plan
                </Button>
              </View>
            </Card>
          )}

          {/* Quick Actions */}
          <View>
            <Text className="text-base font-semibold text-gray-900 mb-3">
              Quick Actions
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => router.push('/live-erg')}
                className="flex-1 bg-primary rounded-2xl p-4 items-center active:opacity-80"
              >
                <Feather name="activity" size={24} color="white" />
                <Text className="text-white font-semibold mt-2 text-sm">
                  Live Erg
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/training' as never)}
                className="flex-1 bg-white border border-gray-100 rounded-2xl p-4 items-center active:opacity-80 shadow-sm"
              >
                <Feather name="edit-3" size={24} color="#1B3A6B" />
                <Text className="text-primary font-semibold mt-2 text-sm">
                  Log Workout
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/performance' as never)}
                className="flex-1 bg-white border border-gray-100 rounded-2xl p-4 items-center active:opacity-80 shadow-sm"
              >
                <Feather name="trending-up" size={24} color="#1B3A6B" />
                <Text className="text-primary font-semibold mt-2 text-sm">
                  Progress
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Recent Workouts */}
          {recentWorkouts.length > 0 && (
            <View>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-base font-semibold text-gray-900">
                  Recent Activity
                </Text>
                <Pressable onPress={() => router.push('/training' as never)}>
                  <Text className="text-primary text-sm font-medium">
                    See all
                  </Text>
                </Pressable>
              </View>
              {recentWorkouts.slice(0, 3).map((workout) => (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  onPress={() => {}}
                />
              ))}
            </View>
          )}

          {recentWorkouts.length === 0 && !isLoading && (
            <Card>
              <View className="items-center py-6">
                <Feather name="award" size={40} color="#D4AF37" />
                <Text className="text-gray-700 font-semibold mt-3 text-base">
                  No workouts yet
                </Text>
                <Text className="text-gray-400 text-sm mt-1 text-center">
                  Log your first workout to start tracking your progress
                </Text>
                <Button
                  onPress={() => router.push('/live-erg')}
                  variant="primary"
                  size="md"
                  style={{ marginTop: 16 }}
                >
                  Start Rowing
                </Button>
              </View>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
