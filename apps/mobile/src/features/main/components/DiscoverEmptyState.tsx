import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';

export function DiscoverEmptyState({ onRestart }: { onRestart: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.title}>今日の候補を見終わりました</Text>
      <Text style={styles.description}>新しい相手が登録されるまで、しばらくお待ちください。</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRestart}
        style={({ pressed }) => [styles.restartButton, pressed && styles.pressed]}
      >
        <Text style={styles.restartLabel}>更新する</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    color: colors.mutedText,
    fontSize: 14,
  },
  restartButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  restartLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
