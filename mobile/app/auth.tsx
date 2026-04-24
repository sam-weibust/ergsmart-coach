import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

type AuthMode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, loading } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address';

    if (mode !== 'reset') {
      if (!password) newErrors.password = 'Password is required';
      else if (password.length < 8) newErrors.password = 'At least 8 characters';
    }

    if (mode === 'signup') {
      if (!firstName.trim()) newErrors.firstName = 'First name is required';
      if (!lastName.trim()) newErrors.lastName = 'Last name is required';
      if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    if (mode === 'signin') {
      const result = await signIn(email, password);
      if (result.error) {
        setErrors({ submit: result.error });
      } else {
        router.replace('/(tabs)');
      }
    } else if (mode === 'signup') {
      const result = await signUp(email, password, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      if (result.error) {
        setErrors({ submit: result.error });
      } else {
        Alert.alert(
          'Account Created',
          'Please check your email to confirm your account, then sign in.',
          [{ text: 'OK', onPress: () => setMode('signin') }]
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#1B3A6B', '#0f2447']}
        className="flex-1"
      >
        <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo / Brand */}
            <View className="items-center pt-12 pb-8 px-6">
              <View className="bg-white/10 rounded-3xl p-5 mb-4">
                <Feather name="activity" size={40} color="#D4AF37" />
              </View>
              <Text className="text-white text-3xl font-bold">CrewSync</Text>
              <Text className="text-white/60 text-base mt-1">
                Your rowing training platform
              </Text>
            </View>

            {/* Card */}
            <View className="flex-1 bg-white rounded-t-3xl px-6 pt-6 pb-8">
              {/* Mode Tabs */}
              <View className="flex-row bg-gray-100 rounded-xl p-1 mb-6">
                <Pressable
                  onPress={() => { setMode('signin'); setErrors({}); }}
                  className={[
                    'flex-1 py-2.5 rounded-lg items-center',
                    mode === 'signin' ? 'bg-white shadow-sm' : '',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'text-sm font-semibold',
                      mode === 'signin' ? 'text-primary' : 'text-gray-400',
                    ].join(' ')}
                  >
                    Sign In
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { setMode('signup'); setErrors({}); }}
                  className={[
                    'flex-1 py-2.5 rounded-lg items-center',
                    mode === 'signup' ? 'bg-white shadow-sm' : '',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'text-sm font-semibold',
                      mode === 'signup' ? 'text-primary' : 'text-gray-400',
                    ].join(' ')}
                  >
                    Create Account
                  </Text>
                </Pressable>
              </View>

              {/* Form */}
              <View className="gap-4">
                {mode === 'signup' && (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Input
                        label="First Name"
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="Alex"
                        error={errors.firstName}
                        autoCapitalize="words"
                      />
                    </View>
                    <View className="flex-1">
                      <Input
                        label="Last Name"
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Johnson"
                        error={errors.lastName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                )}

                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  inputType="email"
                  error={errors.email}
                />

                {mode !== 'reset' && (
                  <Input
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    inputType="password"
                    error={errors.password}
                  />
                )}

                {mode === 'signup' && (
                  <Input
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat password"
                    inputType="password"
                    error={errors.confirmPassword}
                  />
                )}

                {errors.submit && (
                  <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-3">
                    <Text className="text-red-600 text-sm">{errors.submit}</Text>
                  </View>
                )}

                <Button
                  onPress={handleSubmit}
                  loading={loading}
                  variant="primary"
                  size="lg"
                  fullWidth
                >
                  {mode === 'signin'
                    ? 'Sign In'
                    : mode === 'signup'
                    ? 'Create Account'
                    : 'Send Reset Email'}
                </Button>

                {mode === 'signin' && (
                  <Pressable
                    onPress={() => { setMode('reset'); setErrors({}); }}
                    className="items-center py-2"
                  >
                    <Text className="text-primary text-sm">
                      Forgot your password?
                    </Text>
                  </Pressable>
                )}

                {mode === 'reset' && (
                  <Pressable
                    onPress={() => { setMode('signin'); setErrors({}); }}
                    className="items-center py-2"
                  >
                    <Text className="text-gray-500 text-sm">
                      Back to sign in
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Footer */}
              <Text className="text-center text-xs text-gray-300 mt-8">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}
