import React from 'react';
import { View, Text, ViewStyle } from 'react-native';

interface MetricTileProps {
  label: string;
  value: string;
  unit?: string;
  dark?: boolean;
  style?: ViewStyle;
  valueColor?: string;
  large?: boolean;
}

export function MetricTile({
  label,
  value,
  unit,
  dark = false,
  style,
  valueColor,
  large = false,
}: MetricTileProps) {
  return (
    <View
      className={[
        'rounded-2xl p-4 items-center justify-center',
        dark ? 'bg-gray-900' : 'bg-white border border-gray-100',
      ].join(' ')}
      style={[{ minHeight: 120, flex: 1 }, style]}
    >
      <Text
        className={[
          'uppercase tracking-widest mb-1',
          large ? 'text-xs' : 'text-xs',
          dark ? 'text-gray-400' : 'text-gray-500',
        ].join(' ')}
      >
        {label}
      </Text>

      <Text
        className={[
          'font-bold tabular-nums',
          large ? 'text-6xl' : 'text-5xl',
          dark ? 'text-white' : 'text-gray-900',
        ].join(' ')}
        style={valueColor ? { color: valueColor } : undefined}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>

      {unit && (
        <Text
          className={[
            'mt-1',
            large ? 'text-base' : 'text-sm',
            dark ? 'text-gray-400' : 'text-gray-500',
          ].join(' ')}
        >
          {unit}
        </Text>
      )}
    </View>
  );
}
