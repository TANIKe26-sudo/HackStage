import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authDestination } from '../features/auth/api/client';
import { useAuth } from '../features/auth/context/AuthContext';
import EmailAuthScreen from '../features/auth/screens/EmailAuthScreen';
import { colors } from '../theme/tokens';

export default function IndexRoute() {
  const { isRestoring, token, profile } = useAuth();

  if (isRestoring) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.mutedText} />
        </View>
      </SafeAreaView>
    );
  }
  if (token) {
    return <Redirect href={authDestination(profile)} />;
  }

  return <EmailAuthScreen mode="login" />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
