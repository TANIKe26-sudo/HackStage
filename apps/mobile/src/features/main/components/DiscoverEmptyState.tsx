import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import { candidateSwipeAction } from '../candidateSwipeAction';

type DiscoverEmptyStateProps = {
  onRestart: () => void;
  onGoBack?: () => void;
  backDisabled?: boolean;
};

export function DiscoverEmptyState({ onRestart, onGoBack, backDisabled = false }: DiscoverEmptyStateProps) {
  const panResponder = useMemo(() => {
    const shouldHandleSwipe = (_event: GestureResponderEvent, gesture: PanResponderGestureState) =>
      Boolean(onGoBack) && !backDisabled && gesture.numberActiveTouches === 1 &&
      gesture.dx > 10 && gesture.dx > Math.abs(gesture.dy);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: shouldHandleSwipe,
      onMoveShouldSetPanResponderCapture: shouldHandleSwipe,
      onPanResponderRelease: (_event, gesture) => {
        if (!backDisabled && candidateSwipeAction(gesture, Boolean(onGoBack)) === 'back') onGoBack?.();
      },
    });
  }, [onGoBack, backDisabled]);

  return (
    <View collapsable={false} {...panResponder.panHandlers} style={styles.emptyState}>
      <Text style={styles.title}>今日の候補を見終わりました</Text>
      <Text style={styles.description}>{onGoBack
        ? '右にスワイプすると、1つ前のプロフィールに戻れます。'
        : '新しい相手が登録されるまで、しばらくお待ちください。'}</Text>
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
    textAlign: 'center',
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
