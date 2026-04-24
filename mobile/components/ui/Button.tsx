import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantStyles: Record<Variant, { container: string; text: string }> = {
  primary: {
    container: 'bg-primary active:bg-primary-600',
    text: 'text-white font-semibold',
  },
  secondary: {
    container: 'bg-accent active:bg-accent-600',
    text: 'text-white font-semibold',
  },
  outline: {
    container: 'bg-transparent border-2 border-primary active:bg-primary-50',
    text: 'text-primary font-semibold',
  },
  ghost: {
    container: 'bg-transparent active:bg-gray-100',
    text: 'text-primary font-semibold',
  },
  danger: {
    container: 'bg-red-600 active:bg-red-700',
    text: 'text-white font-semibold',
  },
};

const sizeStyles: Record<Size, { container: string; text: string; minHeight: number }> = {
  sm: {
    container: 'px-3 py-2 rounded-lg',
    text: 'text-sm',
    minHeight: 36,
  },
  md: {
    container: 'px-5 py-3 rounded-xl',
    text: 'text-base',
    minHeight: 48,
  },
  lg: {
    container: 'px-6 py-4 rounded-xl',
    text: 'text-lg',
    minHeight: 56,
  },
};

export function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}: ButtonProps) {
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={[
        'flex-row items-center justify-center',
        variantStyle.container,
        sizeStyle.container,
        fullWidth ? 'w-full' : 'self-start',
        isDisabled ? 'opacity-50' : 'opacity-100',
      ]
        .filter(Boolean)
        .join(' ')}
      style={[{ minHeight: sizeStyle.minHeight }, style]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? '#1B3A6B' : '#ffffff'}
        />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon && <View>{leftIcon}</View>}
          <Text
            className={[variantStyle.text, sizeStyle.text].join(' ')}
            style={textStyle}
          >
            {children}
          </Text>
          {rightIcon && <View>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
}
