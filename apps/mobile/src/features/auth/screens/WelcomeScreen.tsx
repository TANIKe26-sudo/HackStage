import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '../components/AuthButton';
import { colors, spacing } from '../../../theme/tokens';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <Text style={styles.brandName}>のどぼとけMATCH</Text>
          <Text style={styles.tagline}>顔より、喉仏から</Text>
        </View>

        <View style={styles.actions}>
          <AuthButton label="ログイン" variant="outline" />
          <Link href="/sign-up" asChild>
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
