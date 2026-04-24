import { supabase } from '../lib/supabase';
import type { ApiResponse } from '../types';
import type { Session, User } from '@supabase/supabase-js';

export async function signIn(
  email: string,
  password: string
): Promise<ApiResponse<{ user: User; session: Session }>> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) return { data: null, error: error.message };
  if (!data.user || !data.session) return { data: null, error: 'Sign in failed' };

  return { data: { user: data.user, session: data.session }, error: null };
}

export async function signUp(
  email: string,
  password: string,
  metadata?: { first_name?: string; last_name?: string }
): Promise<ApiResponse<{ user: User; session: Session | null }>> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: metadata ?? {},
    },
  });

  if (error) return { data: null, error: error.message };
  if (!data.user) return { data: null, error: 'Sign up failed' };

  return { data: { user: data.user, session: data.session }, error: null };
}

export async function signOut(): Promise<ApiResponse<null>> {
  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function getSession(): Promise<ApiResponse<Session>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { data: null, error: error.message };
  if (!data.session) return { data: null, error: 'No active session' };
  return { data: data.session, error: null };
}

export async function getUser(): Promise<ApiResponse<User>> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { data: null, error: error.message };
  if (!data.user) return { data: null, error: 'Not authenticated' };
  return { data: data.user, error: null };
}

export async function resetPassword(email: string): Promise<ApiResponse<null>> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase()
  );
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function updatePassword(newPassword: string): Promise<ApiResponse<User>> {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { data: null, error: error.message };
  if (!data.user) return { data: null, error: 'Update failed' };
  return { data: data.user, error: null };
}
