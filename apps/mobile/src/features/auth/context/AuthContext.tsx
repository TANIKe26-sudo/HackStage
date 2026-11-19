import { captureRegions } from '../captureRegions';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { apiRequest, type AuthProfile } from '../api/client';

const SESSION_KEY = 'nodobito.api.session';

type ProfileInput = {
  display_name: string;
  birth_year: number;
  prefecture_code: string;
  purpose: string;
  conversation_pace: string;
  throat_class: 'present' | 'absent' | 'pending';
  bio: string;
};

type AuthContextValue = {
  isRestoring: boolean;
  token: string | null;
  profile: AuthProfile | null;
  createAccount: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<AuthProfile | null>;
  saveProfile: (profile: ProfileInput, photoDataUrl?: string | null) => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isRestoring, setIsRestoring] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const savedToken = await SecureStore.getItemAsync(SESSION_KEY);
        if (!savedToken) return;

        const result = await apiRequest<{ profile: AuthProfile | null }>('/api/me', savedToken);
        if (!isMounted) return;
        setToken(savedToken);
        setProfile(result.profile);
      } catch {
        await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
      } finally {
        if (isMounted) setIsRestoring(false);
      }
    };

    void restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const createAccount = async (email: string, password: string) => {
    const result = await apiRequest<{ token?: string }>('/auth/signup', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android' }),
    });
    if (!result.token) throw new Error('APIからログイン情報を受け取れませんでした。');

    await SecureStore.setItemAsync(SESSION_KEY, result.token);
    setToken(result.token);
    const current = await apiRequest<{ profile: AuthProfile | null }>('/api/me', result.token);
    setProfile(current.profile);
  };

  const logIn = async (email: string, password: string) => {
    const result = await apiRequest<{ token?: string }>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android' }),
    });
    if (!result.token) throw new Error('APIからログイン情報を受け取れませんでした。');

    const current = await apiRequest<{ profile: AuthProfile | null }>('/api/me', result.token);
    await SecureStore.setItemAsync(SESSION_KEY, result.token);
    setProfile(current.profile);
    setToken(result.token);
    return current.profile;
  };

  const saveProfile = async (input: ProfileInput, photoDataUrl?: string | null) => {
    if (!token) throw new Error('ログイン情報がありません。もう一度ログインしてください。');

    if (photoDataUrl) {
      await apiRequest('/api/captures', token, {
        method: 'POST',
        body: JSON.stringify({ dataUrl: photoDataUrl, regions: captureRegions }),
      });
    }

    await apiRequest('/api/profile', token, { method: 'PATCH', body: JSON.stringify(input) });

    const current = await apiRequest<{ profile: AuthProfile | null }>('/api/me', token);
    setProfile(current.profile);
  };

  const refreshProfile = async () => {
    if (!token) return;
    const result = await apiRequest<{ profile: AuthProfile | null }>('/api/me', token);
    setProfile(result.profile);
  };

  const logOut = async () => {
    try {
      if (token) await apiRequest('/auth/logout', token, { method: 'POST' });
    } finally {
      await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
      setToken(null);
      setProfile(null);
    }
  };

  return (
    <AuthContext.Provider value={{ isRestoring, token, profile, createAccount, logIn, saveProfile, logOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
