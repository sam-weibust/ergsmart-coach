import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, TextInputProps, ViewStyle } from 'react-native';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  rightElement?: React.ReactNode;
  leftElement?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputType?: 'text' | 'email' | 'password' | 'number' | 'decimal' | 'phone';
}

const inputModeMap: Record<
  NonNullable<InputProps['inputType']>,
  TextInputProps['inputMode']
> = {
  text: 'text',
  email: 'email',
  password: 'text',
  number: 'numeric',
  decimal: 'decimal',
  phone: 'tel',
};

export function Input({
  label,
  error,
  hint,
  rightElement,
  leftElement,
  containerStyle,
  inputType = 'text',
  secureTextEntry,
  ...rest
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = inputType === 'password';

  return (
    <View style={containerStyle}>
      {label && (
        <Text className="text-sm font-medium text-gray-700 mb-1.5">{label}</Text>
      )}

      <View
        className={[
          'flex-row items-center bg-white border rounded-xl px-3',
          error ? 'border-red-400' : 'border-gray-200',
        ].join(' ')}
        style={{ minHeight: 48 }}
      >
        {leftElement && <View className="mr-2">{leftElement}</View>}

        <TextInput
          className="flex-1 text-base text-gray-900 py-3"
          placeholderTextColor="#9CA3AF"
          inputMode={inputModeMap[inputType]}
          secureTextEntry={isPassword ? !showPassword : secureTextEntry}
          autoCapitalize={
            inputType === 'email' || inputType === 'password' ? 'none' : rest.autoCapitalize
          }
          autoCorrect={inputType === 'email' || inputType === 'password' ? false : rest.autoCorrect}
          {...rest}
        />

        {isPassword && (
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            className="ml-2 p-1"
            hitSlop={8}
          >
            <Text className="text-sm text-gray-500">
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        )}

        {!isPassword && rightElement && (
          <View className="ml-2">{rightElement}</View>
        )}
      </View>

      {error && (
        <Text className="text-xs text-red-500 mt-1.5">{error}</Text>
      )}

      {!error && hint && (
        <Text className="text-xs text-gray-400 mt-1.5">{hint}</Text>
      )}
    </View>
  );
}
