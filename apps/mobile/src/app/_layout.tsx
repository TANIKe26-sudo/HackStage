import type { PropsWithChildren } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SignUpDraftProvider } from '../features/auth/context/SignUpDraftContext';
import { AuthProvider, useAuth } from '../features/auth/context/AuthContext';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SessionDraftProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              fullScreenGestureEnabled: false,
              gestureResponseDistance: { start: 24 },
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </SessionDraftProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function SessionDraftProvider({ children }: PropsWithChildren) {
  const { token } = useAuth();
  return <SignUpDraftProvider key={token ?? 'logged-out'}>{children}</SignUpDraftProvider>;
}
