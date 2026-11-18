import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';


export function TodayTopicCard({ onAnswer, topic, available }: { onAnswer: () => void; topic: string; available: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.topicContent}>
        <Text style={styles.heading}>今日のお題</Text>
        <Text style={styles.topic}>{topic}</Text>
      </View>
      {available ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="今日のお題に回答する"
          onPress={onAnswer}
          style={({ pressed }) => [styles.answerButton, pressed && styles.pressed]}
        >
          <Text style={styles.answerButtonLabel}>回答</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  topicContent: {
    flex: 1,
    gap: spacing.xs,
  },
  heading: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  topic: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  answerButton: {
    minWidth: 80,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  answerButtonLabel: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
