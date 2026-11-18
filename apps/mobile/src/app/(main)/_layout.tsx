import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { colors } from '../../theme/tokens';

export default function MainLayout() {
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
    </Stack>
  );
}
