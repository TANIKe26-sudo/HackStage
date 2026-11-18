import { useAuth } from '../../features/auth/context/AuthContext';
import { isProfileReady } from '../../features/auth/api/client';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';

import { colors } from '../../theme/tokens';

export default function MainLayout() {
  const { token, profile, isRestoring } = useAuth();
  if (isRestoring) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!token) return <Redirect href="/" />;
  if (!isProfileReady(profile)) return <Redirect href="/sign-up" />;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen
        name="chat/[conversationId]"
        options={{
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
          animationMatchesGesture: true,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="daily-topic/[conversationId]"
        options={{
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
          animationMatchesGesture: true,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="partner-profile/[conversationId]"
        options={{
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
          animationMatchesGesture: true,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="profile-settings/[kind]"
        options={{
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
          animationMatchesGesture: true,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
