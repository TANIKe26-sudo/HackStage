import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { DailyQuestionCard } from '../components/DailyQuestionCard';
import { DailyTopicCard } from '../components/DailyTopicCard';
import { IntimacyUnlockedCard } from '../components/IntimacyUnlockedCard';
import { dailyTopicTasks } from '../data/dailyTopics';
import { useMainApi } from '../api/client';
import { useResource } from '../api/useResource';
import { RequestState } from '../components/RequestState';

export default function DailyTopicScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ConnectedDaily key={conversationId} conversationId={conversationId} />;
}

function ConnectedDaily({ conversationId }: { conversationId: string }) {
  const api = useMainApi();
  const load = useCallback((signal: AbortSignal) => api.matchDaily(conversationId, signal), [api, conversationId]);
  const resource = useResource(load, 5000);
  const [draft, setDraft] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const answer = draft ?? resource.data?.answer?.answer ?? '';
  const completedTasks = dailyTopicTasks.filter(task => resource.data?.tasks[task.id]).map(task => task.id);
  const allTasksComplete = completedTasks.length === dailyTopicTasks.length;
  const progress = completedTasks.length / dailyTopicTasks.length;
  const topic = resource.data?.topic;
  const handleSendAnswer = async () => {
    if (!topic || !answer.trim() || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    try {
      await api.answer(topic.id, answer);
      void resource.refresh();
      Alert.alert('回答を保存しました');
    } catch (error) {
      Alert.alert('保存できませんでした', error instanceof Error ? error.message : '再度お試しください。');
    } finally { sendingRef.current = false; setSending(false); }
  };
  const explainTask = (taskId: string) => {
    if (taskId === 'answer-topic') Alert.alert('今日のお題', '上の入力欄から回答を送信すると達成されます。');
    else if (taskId === 'receive-reply') Alert.alert('返信を待ちましょう', '今日、相手からメッセージが届くと達成されます。');
    else router.back();
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
          <RequestState loading={resource.loading && !resource.data} error={resource.error} onRetry={() => void resource.refresh()} />
          <DailyQuestionCard
            question={topic?.prompt ?? '今日のお題はまだ登録されていません'}
            disabled={!topic || sending}
            submitted={!!resource.data?.answer}
            answer={answer}
            onAnswerChange={setDraft}
            onSend={() => void handleSendAnswer()}
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
                onPress={() => explainTask(task.id)}
              />
            ))}
          </View>

          {allTasksComplete ? (
            <IntimacyUnlockedCard
              onViewProfile={() =>
                router.replace({
                  pathname: '/partner-profile/[conversationId]',
                  params: { conversationId },
                })
              }
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
