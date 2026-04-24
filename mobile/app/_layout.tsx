import '../global.css';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { ToastProvider } from '../components/ui/Toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { setUser, setSession, setLoading, setInitialized, initialized, session } =
    useAuthStore();

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
      setInitialized(true);

      if (!existingSession) {
        router.replace('/auth');
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);

        if (!newSession) {
          router.replace('/auth');
        } else {
          router.replace('/(tabs)');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (!initialized) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGate>
            <View style={{ flex: 1 }}>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right',
                  contentStyle: { backgroundColor: '#F8F9FA' },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="auth"
                  options={{ headerShown: false, animation: 'fade' }}
                />
                <Stack.Screen
                  name="live-erg"
                  options={{
                    headerShown: false,
                    animation: 'slide_from_bottom',
                    presentation: 'fullScreenModal',
                  }}
                />
                <Stack.Screen
                  name="calculators"
                  options={{ headerShown: false, animation: 'slide_from_right' }}
                />
                <Stack.Screen
                  name="profile"
                  options={{ headerShown: false, animation: 'slide_from_right' }}
                />
              </Stack>
              <ToastProvider />
            </View>
          </AuthGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
