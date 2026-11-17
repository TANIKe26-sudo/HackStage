import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SignUpDraftProvider } from '../features/auth/context/SignUpDraftContext';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SignUpDraftProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </SignUpDraftProvider>
    </SafeAreaProvider>
  );
}
