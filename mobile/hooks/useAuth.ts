import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import * as authApi from '../api/auth';
import type { Profile } from '../types';

export function useAuth() {
  const { user, session, profile, loading, setUser, setSession, setProfile, setLoading, reset } =
    useAuthStore();

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      const result = await authApi.signIn(email, password);
      if (result.data) {
        setUser(result.data.user);
        setSession(result.data.session);
        await fetchProfile(result.data.user.id);
      }
      setLoading(false);
      return result;
    },
    [setLoading, setUser, setSession]
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: { first_name?: string; last_name?: string }
    ) => {
      setLoading(true);
      const result = await authApi.signUp(email, password, metadata);
      if (result.data) {
        setUser(result.data.user);
        if (result.data.session) {
          setSession(result.data.session);
        }
      }
      setLoading(false);
      return result;
    },
    [setLoading, setUser, setSession]
  );

  const signOut = useCallback(async () => {
    setLoading(true);
    await authApi.signOut();
    reset();
  }, [setLoading, reset]);

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        setProfile(data as unknown as Profile);
      }
    },
    [setProfile]
  );

  const isAuthenticated = !!session && !!user;

  const displayName =
    profile?.display_name ??
    (profile ? `${profile.first_name} ${profile.last_name}`.trim() : null) ??
    user?.email?.split('@')[0] ??
    'Athlete';

  return {
    user,
    session,
    profile,
    loading,
    isAuthenticated,
    displayName,
    signIn,
    signUp,
    signOut,
    fetchProfile,
  };
}
