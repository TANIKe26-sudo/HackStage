import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';

type DiscoverSwipeActionsProps = {
  onPass: () => void;
  onLike: () => void;
};

export function DiscoverSwipeActions({ onPass, onLike }: DiscoverSwipeActionsProps) {
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityLabel="スキップ"
        accessibilityRole="button"
        onPress={onPass}
        style={({ pressed }) => [styles.actionButton, styles.passButton, pressed && styles.pressed]}
      >
        <Text style={styles.passIcon}>×</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="いいね"
        accessibilityRole="button"
        onPress={onLike}
        style={({ pressed }) => [styles.actionButton, styles.likeButton, pressed && styles.pressed]}
      >
        <Text style={styles.likeIcon}>♥</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    height: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  actionButton: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
  },
  passButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  likeButton: {
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  passIcon: {
    marginTop: -3,
    color: colors.mutedText,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '300',
  },
  likeIcon: {
    color: colors.primary,
    fontSize: 25,
  },
});
