import React from 'react';
import { View, Text, Pressable, ViewStyle } from 'react-native';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  headerRight?: React.ReactNode;
  noPadding?: boolean;
}

export function Card({
  title,
  subtitle,
  children,
  onPress,
  style,
  contentStyle,
  headerRight,
  noPadding = false,
}: CardProps) {
  const hasHeader = !!(title || subtitle || headerRight);

  const inner = (
    <View
      className="bg-white rounded-2xl shadow-sm border border-gray-100"
      style={style}
    >
      {hasHeader && (
        <View className={`flex-row items-start justify-between ${noPadding ? 'px-4 pt-4' : 'px-4 pt-4 pb-1'}`}>
          <View className="flex-1 mr-2">
            {title && (
              <Text className="text-base font-semibold text-gray-900">{title}</Text>
            )}
            {subtitle && (
              <Text className="text-sm text-gray-500 mt-0.5">{subtitle}</Text>
            )}
          </View>
          {headerRight && <View>{headerRight}</View>}
        </View>
      )}
      <View
        className={noPadding ? '' : 'p-4'}
        style={contentStyle}
      >
        {children}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        {inner}
      </Pressable>
    );
  }

  return inner;
}
