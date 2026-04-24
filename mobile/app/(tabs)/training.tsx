import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format, addDays, startOfWeek, parseISO, isSameDay } from 'date-fns';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useAuth } from '../../hooks/useAuth';
import { useUiStore } from '../../store/uiStore';
import { WorkoutCard } from '../../components/WorkoutCard';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import type { DayPlan, WorkoutType, LogWorkoutInput } from '../../types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WORKOUT_TYPES: { value: WorkoutType; label: string }[] = [
  { value: 'steady_state', label: 'Steady State' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'race_pace', label: 'Race Pace' },
  { value: 'power_10', label: 'Power 10' },
  { value: 'technique', label: 'Technique' },
  { value: 'test', label: 'Test' },
  { value: 'strength', label: 'Strength' },
  { value: 'cross_training', label: 'Cross Training' },
];

function WeekCalendar({
  selectedDate,
  onSelectDate,
  workoutDates,
  plan,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  workoutDates: Set<string>;
  plan: DayPlan[] | null;
}) {
  const weekStart = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
      <View className="flex-row gap-2 px-4 py-2">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          const hasWorkout = workoutDates.has(dateStr);
          const dayPlan = plan?.find((d) => d.day_of_week === day.getDay());

          return (
            <Pressable
              key={dateStr}
              onPress={() => onSelectDate(day)}
              className={[
                'w-12 rounded-2xl py-2 items-center',
                isSelected ? 'bg-primary' : isToday ? 'bg-primary/10' : 'bg-white border border-gray-100',
              ].join(' ')}
            >
              <Text
                className={[
                  'text-xs font-medium mb-1',
                  isSelected ? 'text-white/70' : 'text-gray-400',
                ].join(' ')}
              >
                {DAY_LABELS[day.getDay()]}
              </Text>
              <Text
                className={[
                  'text-base font-bold',
                  isSelected ? 'text-white' : isToday ? 'text-primary' : 'text-gray-900',
                ].join(' ')}
              >
                {format(day, 'd')}
              </Text>
              <View className="mt-1 h-1.5 w-1.5 rounded-full">
                {hasWorkout && (
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-accent'}`}
                  />
                )}
                {!hasWorkout && dayPlan && !dayPlan.is_rest_day && (
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white/40' : 'bg-gray-200'}`}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function TrainingScreen() {
  const { user } = useAuth();
  const { workouts, trainingPlan, isLoading, refetch, logWorkout, isLogging } =
    useWorkouts();
  const showToast = useUiStore((s) => s.showToast);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [workoutType, setWorkoutType] = useState<WorkoutType>('steady_state');
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [split, setSplit] = useState('');
  const [notes, setNotes] = useState('');

  const workoutDates = new Set(workouts.map((w) => w.date));
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const workoutsForSelectedDate = workouts.filter(
    (w) => w.date === selectedDateStr
  );

  const dayPlan = trainingPlan?.days?.find(
    (d) => d.day_of_week === selectedDate.getDay()
  );

  const handleLogWorkout = async () => {
    if (!workoutTitle.trim()) {
      Alert.alert('Missing Info', 'Please enter a workout title.');
      return;
    }

    const splitSeconds = (() => {
      if (!split.trim()) return undefined;
      const parts = split.split(':');
      if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
      }
      return parseFloat(split);
    })();

    const input: LogWorkoutInput = {
      user_id: user!.id,
      date: selectedDateStr,
      type: workoutType,
      title: workoutTitle.trim(),
      total_distance_meters: distance ? parseInt(distance) : undefined,
      total_duration_seconds: duration ? parseInt(duration) * 60 : undefined,
      avg_split_seconds: splitSeconds,
      notes: notes.trim() || undefined,
    };

    try {
      await logWorkout(input);
      showToast('Workout logged successfully!', 'success');
      setLogModalVisible(false);
      setWorkoutTitle('');
      setDistance('');
      setDuration('');
      setSplit('');
      setNotes('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to log workout', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-gray-900">Training</Text>
          <Button
            onPress={() => setLogModalVisible(true)}
            variant="primary"
            size="sm"
            leftIcon={<Feather name="plus" size={16} color="white" />}
          >
            Log Workout
          </Button>
        </View>
      </View>

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
        {/* Week Calendar */}
        <View className="bg-white pt-3 border-b border-gray-50 mb-4">
          <WeekCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            workoutDates={workoutDates}
            plan={trainingPlan?.days ?? null}
          />
        </View>

        <View className="px-4 gap-4">
          {/* Selected Day Header */}
          <Text className="text-base font-semibold text-gray-900">
            {isSameDay(selectedDate, new Date())
              ? "Today's Training"
              : format(selectedDate, 'EEEE, MMMM d')}
          </Text>

          {/* Day Plan */}
          {dayPlan && (
            <Card
              title={dayPlan.is_rest_day ? 'Rest Day' : dayPlan.title}
              subtitle={dayPlan.is_rest_day ? 'Recovery & rest' : `${dayPlan.duration_minutes} min planned`}
            >
              {dayPlan.is_rest_day ? (
                <View className="items-center py-4">
                  <Feather name="moon" size={32} color="#D4AF37" />
                  <Text className="text-gray-500 mt-2 text-center">
                    {dayPlan.description}
                  </Text>
                </View>
              ) : (
                <View>
                  <Text className="text-sm text-gray-600 mb-3">
                    {dayPlan.description}
                  </Text>
                  {dayPlan.exercises.map((ex, i) => (
                    <View
                      key={i}
                      className="py-3 border-b border-gray-50 last:border-0"
                    >
                      <View className="flex-row items-start">
                        <View className="bg-primary/10 rounded-full w-6 h-6 items-center justify-center mr-3 mt-0.5">
                          <Text className="text-primary text-xs font-bold">
                            {i + 1}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-gray-800">
                            {ex.name}
                          </Text>
                          <Text className="text-xs text-gray-500 mt-0.5">
                            {ex.description}
                          </Text>
                          <View className="flex-row gap-2 mt-1.5">
                            {ex.distance_meters && (
                              <View className="bg-gray-100 rounded-full px-2 py-0.5">
                                <Text className="text-xs text-gray-600">
                                  {ex.distance_meters >= 1000
                                    ? `${ex.distance_meters / 1000}k`
                                    : `${ex.distance_meters}m`}
                                </Text>
                              </View>
                            )}
                            {ex.target_split && (
                              <View className="bg-primary/10 rounded-full px-2 py-0.5">
                                <Text className="text-xs text-primary">
                                  @{ex.target_split}/500m
                                </Text>
                              </View>
                            )}
                            {ex.target_rate && (
                              <View className="bg-blue-50 rounded-full px-2 py-0.5">
                                <Text className="text-xs text-blue-600">
                                  r{ex.target_rate}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          )}

          {/* Workouts logged on this date */}
          {workoutsForSelectedDate.length > 0 ? (
            <View>
              <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Logged Workouts
              </Text>
              {workoutsForSelectedDate.map((workout) => (
                <WorkoutCard key={workout.id} workout={workout} />
              ))}
            </View>
          ) : (
            !dayPlan && (
              <Card>
                <View className="items-center py-6">
                  <Feather name="calendar" size={36} color="#E5E7EB" />
                  <Text className="text-gray-400 mt-2 text-center">
                    No workouts logged for this day
                  </Text>
                  <Button
                    onPress={() => setLogModalVisible(true)}
                    variant="outline"
                    size="sm"
                    style={{ marginTop: 12 }}
                  >
                    Log a Workout
                  </Button>
                </View>
              </Card>
            )
          )}
        </View>
      </ScrollView>

      {/* Log Workout Modal */}
      <Modal
        visible={logModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLogModalVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
          <View className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white">
            <Pressable onPress={() => setLogModalVisible(false)} className="mr-3 p-1">
              <Feather name="x" size={22} color="#374151" />
            </Pressable>
            <Text className="text-lg font-bold text-gray-900 flex-1">
              Log Workout
            </Text>
            <Button
              onPress={handleLogWorkout}
              loading={isLogging}
              variant="primary"
              size="sm"
            >
              Save
            </Button>
          </View>

          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
            <View className="gap-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">
                  Workout Type
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {WORKOUT_TYPES.map((wt) => (
                      <Pressable
                        key={wt.value}
                        onPress={() => setWorkoutType(wt.value)}
                        className={[
                          'px-3 py-2 rounded-xl border',
                          workoutType === wt.value
                            ? 'bg-primary border-primary'
                            : 'bg-white border-gray-200',
                        ].join(' ')}
                      >
                        <Text
                          className={[
                            'text-sm font-medium',
                            workoutType === wt.value ? 'text-white' : 'text-gray-600',
                          ].join(' ')}
                        >
                          {wt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">
                  Title *
                </Text>
                <TextInput
                  value={workoutTitle}
                  onChangeText={setWorkoutTitle}
                  placeholder="e.g. 5x2000m Intervals"
                  placeholderTextColor="#9CA3AF"
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 mb-1.5">
                    Distance (m)
                  </Text>
                  <TextInput
                    value={distance}
                    onChangeText={setDistance}
                    placeholder="10000"
                    placeholderTextColor="#9CA3AF"
                    inputMode="numeric"
                    className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 mb-1.5">
                    Duration (min)
                  </Text>
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    placeholder="45"
                    placeholderTextColor="#9CA3AF"
                    inputMode="numeric"
                    className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                  />
                </View>
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">
                  Avg Split /500m (m:ss)
                </Text>
                <TextInput
                  value={split}
                  onChangeText={setSplit}
                  placeholder="2:05"
                  placeholderTextColor="#9CA3AF"
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">
                  Notes
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="How did it feel? Any observations..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                  style={{ textAlignVertical: 'top', minHeight: 100 }}
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
