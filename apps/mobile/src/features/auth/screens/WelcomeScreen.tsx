import { Link, router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '../components/AuthButton';
import { isProfileReady } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../../../theme/tokens';

export default function WelcomeScreen() {
  const { isRestoring, token, profile } = useAuth();

  useEffect(() => {
    if (!isRestoring && token && isProfileReady(profile)) router.replace('/discover');
  }, [isRestoring, profile, token]);

  if (isRestoring) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <Text style={styles.brandName}>のどぼとけMATCH</Text>
          <Text style={styles.tagline}>顔より、喉仏から</Text>
        </View>

        <View style={styles.actions}>
          <AuthButton
            label="ログイン"
            variant="outline"
            onPress={() => router.push('/login')}
          />
          <Link href="/create-account" asChild>
            <AuthButton label="新規登録" variant="primary" />
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brandName: {
    color: colors.primary,
    fontSize: 25,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  tagline: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
