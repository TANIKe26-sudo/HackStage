import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import { AppIcon } from './AppIcon';

type DiscoverSwipeActionsProps = {
  onPass: () => void;
  onLike: () => void;
  onUndo: () => void;
  canUndo: boolean;
  undoDisabled: boolean;
  showSwipeButtons: boolean;
};

export function DiscoverSwipeActions({ onPass, onLike, onUndo, canUndo, undoDisabled, showSwipeButtons }: DiscoverSwipeActionsProps) {
  return (
    <View style={styles.actions}>
      {canUndo ? (
        <Pressable
          accessibilityLabel="1つ前のプロフィールに戻る"
          accessibilityRole="button"
          accessibilityState={{ disabled: undoDisabled }}
          disabled={undoDisabled}
          onPress={onUndo}
          style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
        >
          <AppIcon name="undo" size={22} color={colors.primary} />
        </Pressable>
      ) : null}
      {showSwipeButtons ? (
        <View style={styles.swipeButtons}>
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  swipeButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  undoButton: {
    position: 'absolute',
    left: 0,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
