import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string;
}

export default function MoreScreen() {
  const { displayName, user, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  const sections: MenuSection[] = [
    {
      title: 'Tools',
      items: [
        {
          icon: 'activity',
          label: 'Live Erg',
          subtitle: 'Connect PM5 & track live metrics',
          onPress: () => router.push('/live-erg'),
        },
        {
          icon: 'calculator',
          label: 'Calculators',
          subtitle: 'Split, watts, and pace calculators',
          onPress: () => router.push('/calculators'),
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'user',
          label: 'Profile',
          subtitle: 'Edit your athlete profile',
          onPress: () => router.push('/profile'),
        },
        {
          icon: 'log-out',
          label: 'Sign Out',
          onPress: handleSignOut,
          danger: true,
        },
      ],
    },
  ];

  const userInitials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View className="bg-primary px-5 pt-4 pb-8">
          <Text className="text-xl font-bold text-white mb-4">More</Text>
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-full bg-white/20 items-center justify-center mr-4">
              <Text className="text-white text-2xl font-bold">{userInitials}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-semibold">{displayName}</Text>
              <Text className="text-white/70 text-sm">{user?.email}</Text>
            </View>
            <Pressable
              onPress={() => {}}
              className="bg-white/20 rounded-full p-2 active:bg-white/30"
            >
              <Feather name="edit-2" size={16} color="white" />
            </Pressable>
          </View>
        </View>

        <View className="px-4 -mt-4 gap-4">
          {sections.map((section) => (
            <View key={section.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <View className="px-4 py-3 border-b border-gray-50">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {section.title}
                </Text>
              </View>

              {section.items.map((item, index) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  className={[
                    'flex-row items-center px-4 py-3.5 active:bg-gray-50',
                    index < section.items.length - 1 ? 'border-b border-gray-50' : '',
                  ].join(' ')}
                >
                  <View
                    className={[
                      'w-9 h-9 rounded-xl items-center justify-center mr-3',
                      item.danger ? 'bg-red-50' : 'bg-primary/10',
                    ].join(' ')}
                  >
                    <Feather
                      name={item.icon as never}
                      size={18}
                      color={item.danger ? '#DC2626' : '#1B3A6B'}
                    />
                  </View>

                  <View className="flex-1">
                    <Text
                      className={[
                        'text-sm font-semibold',
                        item.danger ? 'text-red-600' : 'text-gray-900',
                      ].join(' ')}
                    >
                      {item.label}
                    </Text>
                    {item.subtitle && (
                      <Text className="text-xs text-gray-400 mt-0.5">
                        {item.subtitle}
                      </Text>
                    )}
                  </View>

                  {item.badge && (
                    <View className="bg-accent rounded-full px-2 py-0.5 mr-2">
                      <Text className="text-white text-xs font-bold">
                        {item.badge}
                      </Text>
                    </View>
                  )}

                  {!item.danger && (
                    <Feather name="chevron-right" size={16} color="#D1D5DB" />
                  )}
                </Pressable>
              ))}
            </View>
          ))}

          {/* App Version */}
          <Text className="text-center text-xs text-gray-300 mt-2">
            CrewSync v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
