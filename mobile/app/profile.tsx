import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { Profile } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob: string | null): string {
  if (!dob) return '--';
  const birth = new Date(dob);
  const today = new Date();
  const age = today.getFullYear() - birth.getFullYear() -
    (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return `${age} yrs`;
}

// ─── Field Input ──────────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address';
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <View className="py-3 border-b border-gray-50">
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? '—'}
        placeholderTextColor="#D1D5DB"
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        className={[
          'text-base text-gray-900',
          multiline ? 'min-h-16' : '',
          !editable ? 'text-gray-400' : '',
        ].join(' ')}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const userEmail = useAuthStore((s) => s.user?.email ?? '');
  const qc = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Profile>>({});

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
    enabled: !!userId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      setIsEditing(false);
      setDraft({});
    },
    onError: (err: Error) => {
      Alert.alert('Update Failed', err.message);
    },
  });

  const profile = profileQuery.data;

  const startEditing = () => {
    if (!profile) return;
    setDraft({
      first_name: profile.first_name,
      last_name: profile.last_name,
      bio: profile.bio ?? '',
      weight_kg: profile.weight_kg,
      height_cm: profile.height_cm,
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDraft({});
  };

  const saveEditing = () => {
    updateMutation.mutate(draft);
  };

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : '…';

  const initials = profile
    ? `${profile.first_name[0] ?? ''}${profile.last_name[0] ?? ''}`.toUpperCase()
    : '?';

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator size="large" color="#1B3A6B" />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Nav bar */}
        <View className="flex-row items-center bg-white px-4 py-4 border-b border-gray-100">
          <Pressable
            onPress={() => router.back()}
            className="p-2 rounded-xl bg-gray-100 active:bg-gray-200 mr-3"
          >
            <Feather name="arrow-left" size={18} color="#374151" />
          </Pressable>
          <Text className="text-xl font-bold text-gray-900 flex-1">Profile</Text>

          {isEditing ? (
            <View className="flex-row gap-2">
              <Pressable
                onPress={cancelEditing}
                className="px-4 py-2 rounded-xl bg-gray-100 active:bg-gray-200"
              >
                <Text className="text-sm font-semibold text-gray-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEditing}
                disabled={updateMutation.isPending}
                className="px-4 py-2 rounded-xl bg-primary active:bg-primary/90"
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-sm font-semibold text-white">Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={startEditing}
              className="p-2 rounded-xl bg-gray-100 active:bg-gray-200"
            >
              <Feather name="edit-2" size={18} color="#374151" />
            </Pressable>
          )}
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar + name header */}
          <View className="bg-primary px-5 pt-6 pb-10 items-center">
            <View className="w-20 h-20 rounded-full bg-white/20 items-center justify-center mb-3">
              <Text className="text-white text-3xl font-bold">{initials}</Text>
            </View>
            <Text className="text-white text-xl font-bold">{displayName}</Text>
            <Text className="text-white/60 text-sm mt-0.5">{userEmail}</Text>
            {profile?.role && (
              <View className="mt-2 bg-white/10 rounded-full px-3 py-1">
                <Text className="text-white/80 text-xs capitalize">{profile.role}</Text>
              </View>
            )}
          </View>

          {/* Stats row */}
          <View className="flex-row mx-4 -mt-5 gap-3 mb-4">
            {[
              { label: 'Age', value: calcAge(profile?.date_of_birth ?? null) },
              {
                label: 'Height',
                value: profile?.height_cm ? `${profile.height_cm} cm` : '--',
              },
              {
                label: 'Weight',
                value: profile?.weight_kg ? `${profile.weight_kg} kg` : '--',
              },
            ].map(({ label, value }) => (
              <View
                key={label}
                className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-3 items-center"
              >
                <Text className="text-base font-bold text-primary">{value}</Text>
                <Text className="text-xs text-gray-400 mt-0.5">{label}</Text>
              </View>
            ))}
          </View>

          {/* Editable fields */}
          <View className="mx-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-4">
            <FieldRow
              label="First Name"
              value={isEditing ? (draft.first_name ?? '') : (profile?.first_name ?? '')}
              onChangeText={isEditing ? (v) => setDraft((d) => ({ ...d, first_name: v })) : undefined}
              placeholder="First name"
              editable={isEditing}
            />
            <FieldRow
              label="Last Name"
              value={isEditing ? (draft.last_name ?? '') : (profile?.last_name ?? '')}
              onChangeText={isEditing ? (v) => setDraft((d) => ({ ...d, last_name: v })) : undefined}
              placeholder="Last name"
              editable={isEditing}
            />
            <FieldRow
              label="Email"
              value={userEmail}
              editable={false}
            />
            <FieldRow
              label="Bio"
              value={isEditing ? (draft.bio ?? '') : (profile?.bio ?? '')}
              onChangeText={isEditing ? (v) => setDraft((d) => ({ ...d, bio: v })) : undefined}
              placeholder="Tell us about yourself…"
              multiline
              editable={isEditing}
            />
            <FieldRow
              label="Height (cm)"
              value={
                isEditing
                  ? draft.height_cm?.toString() ?? ''
                  : profile?.height_cm?.toString() ?? ''
              }
              onChangeText={
                isEditing
                  ? (v) => setDraft((d) => ({ ...d, height_cm: v ? parseFloat(v) : undefined }))
                  : undefined
              }
              placeholder="180"
              keyboardType="decimal-pad"
              editable={isEditing}
            />
            <FieldRow
              label="Weight (kg)"
              value={
                isEditing
                  ? draft.weight_kg?.toString() ?? ''
                  : profile?.weight_kg?.toString() ?? ''
              }
              onChangeText={
                isEditing
                  ? (v) => setDraft((d) => ({ ...d, weight_kg: v ? parseFloat(v) : undefined }))
                  : undefined
              }
              placeholder="75"
              keyboardType="decimal-pad"
              editable={isEditing}
            />
          </View>

          {!isEditing && (
            <Text className="text-center text-xs text-gray-300 mt-6">
              Tap the edit button to update your profile
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
