import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, Pressable, ViewStyle } from 'react-native';
import { useUiStore, ToastMessage, ToastVariant } from '../../store/uiStore';

// ─── Single Toast ──────────────────────────────────────────────────────────────

const variantConfig: Record<
  ToastVariant,
  { bg: string; text: string; icon: string }
> = {
  success: { bg: 'bg-green-600', text: 'text-white', icon: '✓' },
  error: { bg: 'bg-red-600', text: 'text-white', icon: '✕' },
  warning: { bg: 'bg-amber-500', text: 'text-white', icon: '!' },
  info: { bg: 'bg-primary', text: 'text-white', icon: 'i' },
};

interface SingleToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

function SingleToast({ toast, onDismiss }: SingleToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
      }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss(toast.id));
  };

  const config = variantConfig[toast.variant];

  return (
    <Animated.View
      style={[{ opacity, transform: [{ translateY }] } as ViewStyle]}
    >
      <Pressable onPress={dismiss}>
        <View
          className={`${config.bg} flex-row items-center px-4 py-3 rounded-xl mb-2 shadow-lg`}
          style={{ minWidth: 240, maxWidth: 340 }}
        >
          <View className="bg-white/20 w-6 h-6 rounded-full items-center justify-center mr-3">
            <Text className={`${config.text} text-xs font-bold`}>{config.icon}</Text>
          </View>
          <Text className={`${config.text} flex-1 text-sm font-medium`}>
            {toast.message}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Toast Provider ────────────────────────────────────────────────────────────

export function ToastProvider() {
  const toasts = useUiStore((s) => s.toasts);
  const hideToast = useUiStore((s) => s.hideToast);

  if (toasts.length === 0) return null;

  return (
    <View
      className="absolute top-16 left-0 right-0 items-center z-50 px-4"
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <SingleToast key={toast.id} toast={toast} onDismiss={hideToast} />
      ))}
    </View>
  );
}
