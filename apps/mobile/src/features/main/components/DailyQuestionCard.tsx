import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import { KeyboardAwareTextInput } from '../../../components/KeyboardAwareScrollView';

type DailyQuestionCardProps = {
  question: string;
  answer: string;
  onAnswerChange: (answer: string) => void;
  onSend: () => void;
  disabled?: boolean;
  submitted?: boolean;
};

export function DailyQuestionCard({ question, answer, onAnswerChange, onSend, disabled, submitted }: DailyQuestionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.question}>{question}</Text>
      <KeyboardAwareTextInput
        accessibilityLabel="今日のお題への回答"
        maxLength={2000}
        editable={!disabled}
        value={answer}
        onChangeText={onAnswerChange}
        onSubmitEditing={onSend}
        placeholder="回答を入力"
        placeholderTextColor={colors.mutedText}
        returnKeyType="send"
        style={styles.answerInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="回答を送信"
        disabled={disabled || !answer.trim()}
        accessibilityState={{ disabled: disabled || !answer.trim() }}
        onPress={onSend}
        style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
      >
        <Text style={styles.sendButtonLabel}>{submitted ? '回答を更新' : '送信'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 184,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 17,
    paddingTop: 31,
    paddingBottom: 16,
  },
  question: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 29,
  },
  answerInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  sendButton: {
    minWidth: 78,
    height: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  sendButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
