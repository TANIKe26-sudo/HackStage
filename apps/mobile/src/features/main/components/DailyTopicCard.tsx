import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme/tokens';
import type { DailyTopicTask } from '../data/dailyTopics';

type DailyTopicCardProps = {
  task: DailyTopicTask;
  completed: boolean;
  onPress: () => void;
};

export function DailyTopicCard({ task, completed, onPress }: DailyTopicCardProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={task.label}
      accessibilityState={{ checked: completed }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.checkCircle, completed && styles.checkedCircle]}>
        {completed ? <Ionicons name="checkmark" size={18} color="#5C7D63" /> : null}
      </View>
      <Text style={[styles.label, completed && styles.completedLabel]}>{task.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
  },
  checkCircle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.white,
  },
  checkedCircle: {
    borderColor: '#5C7D63',
    backgroundColor: colors.white,
  },
  label: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  completedLabel: {
    color: colors.text,
  },
  pressed: {
    opacity: 0.72,
  },
});
