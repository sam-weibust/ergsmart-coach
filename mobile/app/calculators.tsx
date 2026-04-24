import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSplit(input: string): number | null {
  const trimmed = input.trim();
  const colonMatch = trimmed.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 60 + parseFloat(colonMatch[2]);
  }
  const plain = parseFloat(trimmed);
  return isNaN(plain) ? null : plain;
}

function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  const hmsMatch = trimmed.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (hmsMatch) {
    return parseInt(hmsMatch[1]) * 3600 + parseInt(hmsMatch[2]) * 60 + parseFloat(hmsMatch[3]);
  }
  const mmssMatch = trimmed.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (mmssMatch) {
    return parseInt(mmssMatch[1]) * 60 + parseFloat(mmssMatch[2]);
  }
  const plain = parseFloat(trimmed);
  return isNaN(plain) ? null : plain;
}

function formatSplit(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function splitToWatts(splitSeconds: number): number {
  // Concept2 formula: P = 2.8 / (t/500)^3  where t = split in seconds
  return Math.round(2.8 * Math.pow(500 / splitSeconds, 3));
}

function wattsToSplit(watts: number): number {
  // Inverse: t = 500 * (2.8 / P)^(1/3)
  return 500 * Math.pow(2.8 / watts, 1 / 3);
}

// Paul's Law 2k predictor (Riegel formula: T2 = T1 * (D2/D1)^1.07)
function predictPace(
  knownDistanceMeters: number,
  knownTimeSeconds: number,
  targetDistanceMeters: number,
): number {
  return knownTimeSeconds * Math.pow(targetDistanceMeters / knownDistanceMeters, 1.07);
}

// ─── Section components ────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-4">
      <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
        <Feather name={icon as never} size={16} color="#1B3A6B" />
      </View>
      <Text className="text-base font-bold text-gray-900">{title}</Text>
    </View>
  );
}

function ResultBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4 items-center">
      <Text className="text-xs text-primary/60 uppercase tracking-wide mb-1">{label}</Text>
      <Text className="text-3xl font-bold text-primary">{value}</Text>
      {sub ? <Text className="text-xs text-primary/50 mt-0.5">{sub}</Text> : null}
    </View>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'decimal-pad',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: 'decimal-pad' | 'numeric';
}) {
  return (
    <View className="flex-1">
      <Text className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#D1D5DB"
        keyboardType={keyboardType}
        returnKeyType="done"
        className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900 font-medium"
      />
    </View>
  );
}

// ─── Calculator 1: Split from Distance + Time ─────────────────────────────────

function SplitCalculator() {
  const [distance, setDistance] = useState('');
  const [time, setTime] = useState('');

  const distM = parseFloat(distance);
  const timeSec = parseTimeInput(time);

  const split = distM > 0 && timeSec && timeSec > 0
    ? (timeSec / distM) * 500
    : null;

  const watts = split ? splitToWatts(split) : null;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <SectionHeader title="Split Calculator" icon="clock" />

      <View className="flex-row gap-3 mb-4">
        <FieldInput
          label="Distance (m)"
          value={distance}
          onChange={setDistance}
          placeholder="5000"
        />
        <FieldInput
          label="Time (m:ss)"
          value={time}
          onChange={setTime}
          placeholder="21:00"
        />
      </View>

      {split !== null ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ResultBox label="Split /500m" value={formatSplit(split)} />
          </View>
          <View className="flex-1">
            <ResultBox label="Watts" value={watts?.toString() ?? '--'} sub="average" />
          </View>
        </View>
      ) : (
        <View className="bg-gray-50 rounded-xl py-4 items-center">
          <Text className="text-gray-400 text-sm">Enter distance and time above</Text>
        </View>
      )}
    </View>
  );
}

// ─── Calculator 2: Watts ↔ Split ─────────────────────────────────────────────

function WattsCalculator() {
  const [mode, setMode] = useState<'splitToWatts' | 'wattsToSplit'>('splitToWatts');
  const [input, setInput] = useState('');

  const result = (() => {
    if (!input.trim()) return null;
    if (mode === 'splitToWatts') {
      const sec = parseSplit(input);
      if (!sec || sec <= 0) return null;
      return { label: 'Watts', value: splitToWatts(sec).toString(), sub: 'average power' };
    } else {
      const w = parseFloat(input);
      if (!w || w <= 0) return null;
      const sec = wattsToSplit(w);
      return { label: 'Split /500m', value: formatSplit(sec), sub: 'pace' };
    }
  })();

  return (
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <SectionHeader title="Watts ↔ Split" icon="zap" />

      {/* Toggle */}
      <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
        <Pressable
          onPress={() => { setMode('splitToWatts'); setInput(''); }}
          className={[
            'flex-1 py-2 rounded-lg items-center',
            mode === 'splitToWatts' ? 'bg-white shadow-sm' : '',
          ].join(' ')}
        >
          <Text
            className={`text-sm font-semibold ${mode === 'splitToWatts' ? 'text-primary' : 'text-gray-400'}`}
          >
            Split → Watts
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setMode('wattsToSplit'); setInput(''); }}
          className={[
            'flex-1 py-2 rounded-lg items-center',
            mode === 'wattsToSplit' ? 'bg-white shadow-sm' : '',
          ].join(' ')}
        >
          <Text
            className={`text-sm font-semibold ${mode === 'wattsToSplit' ? 'text-primary' : 'text-gray-400'}`}
          >
            Watts → Split
          </Text>
        </Pressable>
      </View>

      <View className="mb-4">
        <FieldInput
          label={mode === 'splitToWatts' ? 'Split (m:ss)' : 'Watts'}
          value={input}
          onChange={setInput}
          placeholder={mode === 'splitToWatts' ? '2:05' : '200'}
        />
      </View>

      {result ? (
        <ResultBox label={result.label} value={result.value} sub={result.sub} />
      ) : (
        <View className="bg-gray-50 rounded-xl py-4 items-center">
          <Text className="text-gray-400 text-sm">
            Enter a {mode === 'splitToWatts' ? 'split (e.g. 2:05)' : 'watt value (e.g. 250)'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Calculator 3: Race Predictor ─────────────────────────────────────────────

const PREDICT_DISTANCES = [
  { label: '500m', meters: 500 },
  { label: '1k', meters: 1000 },
  { label: '2k', meters: 2000 },
  { label: '5k', meters: 5000 },
  { label: '6k', meters: 6000 },
  { label: '10k', meters: 10000 },
];

function RacePredictor() {
  const [knownDist, setKnownDist] = useState('');
  const [knownTime, setKnownTime] = useState('');

  const distM = parseFloat(knownDist);
  const timeSec = parseTimeInput(knownTime);

  const predictions = distM > 0 && timeSec && timeSec > 0
    ? PREDICT_DISTANCES
        .filter((d) => d.meters !== distM)
        .map((d) => ({
          label: d.label,
          time: predictPace(distM, timeSec, d.meters),
          split: predictPace(distM, timeSec, d.meters) / d.meters * 500,
        }))
    : null;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <SectionHeader title="Race Predictor" icon="trending-up" />
      <Text className="text-xs text-gray-400 mb-4">
        Enter a known result to predict equivalent performances (Riegel formula)
      </Text>

      <View className="flex-row gap-3 mb-4">
        <FieldInput
          label="Known Distance (m)"
          value={knownDist}
          onChange={setKnownDist}
          placeholder="2000"
        />
        <FieldInput
          label="Time (m:ss)"
          value={knownTime}
          onChange={setKnownTime}
          placeholder="7:00"
        />
      </View>

      {predictions ? (
        <View className="gap-2">
          {predictions.map((pred) => (
            <View
              key={pred.label}
              className="flex-row items-center py-2.5 px-3 bg-gray-50 rounded-xl"
            >
              <Text className="w-10 text-sm font-bold text-gray-900">{pred.label}</Text>
              <Text className="flex-1 text-sm font-semibold text-primary text-right">
                {formatTime(pred.time)}
              </Text>
              <Text className="w-20 text-xs text-gray-400 text-right">
                @{formatSplit(pred.split)}/500m
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="bg-gray-50 rounded-xl py-4 items-center">
          <Text className="text-gray-400 text-sm">Enter distance and time to predict</Text>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalculatorsScreen() {
  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center bg-white px-4 py-4 border-b border-gray-100">
          <Pressable
            onPress={() => router.back()}
            className="p-2 rounded-xl bg-gray-100 active:bg-gray-200 mr-3"
          >
            <Feather name="arrow-left" size={18} color="#374151" />
          </Pressable>
          <Text className="text-xl font-bold text-gray-900">Calculators</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SplitCalculator />
          <WattsCalculator />
          <RacePredictor />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
