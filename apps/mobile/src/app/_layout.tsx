import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SignUpDraftProvider } from '../features/auth/context/SignUpDraftContext';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SignUpDraftProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </SignUpDraftProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
