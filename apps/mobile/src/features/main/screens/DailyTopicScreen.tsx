import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { DailyQuestionCard } from '../components/DailyQuestionCard';
import { DailyTopicCard } from '../components/DailyTopicCard';
import { IntimacyUnlockedCard } from '../components/IntimacyUnlockedCard';
import { dailyTopicQuestion, dailyTopicTasks } from '../data/dailyTopics';

export default function DailyTopicScreen() {
  const [completedTasks, setCompletedTasks] = useState<string[]>(['answer-topic']);
  const [answer, setAnswer] = useState('');
  const allTasksComplete = completedTasks.length === dailyTopicTasks.length;
  const progress = completedTasks.length / dailyTopicTasks.length;

  const toggleTask = (taskId: string) => {
    setCompletedTasks((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  };

  const handleSendAnswer = () => {
    setCompletedTasks((current) =>
      current.includes('answer-topic') ? current : [...current, 'answer-topic'],
    );
    setAnswer('');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="チャットに戻る"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>今日のお題</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <DailyQuestionCard
            question={dailyTopicQuestion}
            answer={answer}
            onAnswerChange={setAnswer}
            onSend={handleSendAnswer}
          />

          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressTitle}>今日の会話</Text>
              <Text style={styles.progressCount}>
                {completedTasks.length} / {dailyTopicTasks.length}
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: dailyTopicTasks.length, now: completedTasks.length }}
              style={styles.progressTrack}
            >
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          <View style={styles.taskList}>
            {dailyTopicTasks.map((task) => (
              <DailyTopicCard
                key={task.id}
                task={task}
                completed={completedTasks.includes(task.id)}
                onPress={() => toggleTask(task.id)}
              />
            ))}
          </View>

          {allTasksComplete ? (
            <IntimacyUnlockedCard
              onViewProfile={() => router.replace('/profile')}
            />
          ) : null}
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 36,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  progressSection: {
    gap: 9,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  progressCount: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: colors.primarySoft,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  taskList: {
    gap: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
