import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/context/AuthContext';
import { colors, spacing } from '../../../theme/tokens';
import { TodayTopicCard } from '../components/TodayTopicCard';
import { formatDateLabel, isSameLocalDay, timeLabel, useMainApi, type Message } from '../api/client';
import { useResource } from '../api/useResource';
import { ProtectedPhoto } from '../components/ProtectedPhoto';
import { RequestState } from '../components/RequestState';

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ConnectedChat key={conversationId} conversationId={conversationId} />;
}

function ConnectedChat({ conversationId }: { conversationId: string }) {
  const { profile } = useAuth();
  const api = useMainApi();
  const load = useCallback(async (signal: AbortSignal) => {
    const [match, page, daily] = await Promise.all([api.match(conversationId, signal), api.messages(conversationId, signal), api.daily(signal)]);
    return { match, page, daily };
  }, [api, conversationId]);
  const resource = useResource(load, 4000);
  const conversation = resource.data?.match.profile;
  const [older, setOlder] = useState<{ messages: Message[]; nextBefore: number | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const messageList = useRef<ScrollViewInstance | null>(null);
  const messages = Array.from(new Map([...(older?.messages ?? []), ...(resource.data?.page.messages ?? [])].map(m => [m.id, m])).values()).sort((a, b) => a.sequence - b.sequence);
  const latestSequence = resource.data?.page.messages.at(-1)?.sequence;
  const nextBefore = older ? older.nextBefore : resource.data?.page.nextBefore;
  useEffect(() => {
    if (latestSequence) {
      void api.read(conversationId, latestSequence).catch(() => undefined);
      messageList.current?.scrollToEnd({ animated: true });
    }
  }, [api, conversationId, latestSequence]);
  const loadOlder = async () => {
    if (!nextBefore || loadingOlder) return;
    setLoadingOlder(true); setOlderError('');
    try {
      const page = await api.messages(conversationId, undefined, nextBefore);
      setOlder(current => ({ messages: [...page.messages, ...(current?.messages ?? [])], nextBefore: page.nextBefore }));
    } catch (error) { setOlderError(error instanceof Error ? error.message : '過去の会話を取得できませんでした。'); }
    finally { setLoadingOlder(false); }
  };
  const sendMessage = async () => {
    const submitted = draft, text = submitted.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    try {
      const result = await api.send(conversationId, text);
      setDraft(current => current === submitted ? '' : current);
      if (result.warning) Alert.alert('安全のための確認', result.warning);
      void resource.refresh();
    } catch (error) {
      Alert.alert('送信できませんでした', error instanceof Error ? error.message : '再度お試しください。');
    } finally { sendingRef.current = false; setSending(false); }
  };

  if (!conversation) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.notFound}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.mutedText} />
          </Pressable>
          <RequestState loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh()} />
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="トーク一覧に戻る"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color={colors.mutedText} />
          </Pressable>

          <View style={styles.avatar}>
            <ProtectedPhoto captureId={conversation.capture_id} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${conversation.display_name}さんのプロフィールを表示`}
            onPress={() =>
              router.push({
                pathname: '/partner-profile/[conversationId]',
                params: { conversationId },
              })
            }
            style={({ pressed }) => [styles.nameButton, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.name}>
              {conversation.display_name}
            </Text>
          </Pressable>
          <View style={styles.headerSpacer} />
        </View>

        <RequestState loading={false} error={resource.error} onRetry={() => void resource.refresh()} />
        <TodayTopicCard
          topic={resource.data?.daily.topic?.prompt ?? '今日のお題はまだ登録されていません'}
          available={!!resource.data?.daily.topic}
          onAnswer={() =>
            router.push({
              pathname: '/daily-topic/[conversationId]',
              params: { conversationId, previousStage: String(resource.data?.match.progress.stage ?? 0) },
            })
          }
        />

        <ScrollView
          ref={messageList}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {nextBefore ? <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={() => void loadOlder()}><Text style={styles.dateLabel}>{loadingOlder ? '読み込み中…' : '過去のメッセージを読む'}</Text></Pressable> : null}
          <RequestState loading={false} error={olderError || undefined} onRetry={() => void loadOlder()} />
          {messages.map((message, index) => {
            const isMine = message.sender_id === resource.data?.page.me;
            const date = formatDateLabel(message.created_at);
            const previousDate = index > 0 ? new Date(messages[index - 1].created_at) : null;
            const showDate = !previousDate || !isSameLocalDay(new Date(message.created_at), previousDate);
            return (
              <View key={message.id}>
                {showDate ? <View style={styles.datePill}><Text style={styles.dateLabel}>{date}</Text></View> : null}
              <View
                style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}
              >
                {!isMine ? (
                  <View style={styles.messageAvatar}>
                    <ProtectedPhoto captureId={conversation.capture_id} />
                  </View>
                ) : null}
                <View style={[styles.messageColumn, isMine && styles.myMessageColumn]}>
                  <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
                    <Text style={[styles.messageText, isMine && styles.myMessageText]}>
                      {message.body}
                    </Text>
                  </View>
                  <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
                    {timeLabel(message.created_at)}
                  </Text>
                  {message.warning ? <Text style={styles.messageTime}>{message.warning}</Text> : null}
                </View>
                {isMine ? (
                  <View style={styles.messageAvatar}>
                    <ProtectedPhoto captureId={profile?.profile_photo_capture_id} />
                  </View>
                ) : null}
              </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="メッセージを入力"
            multiline
            maxLength={2000}
            value={draft}
            onChangeText={setDraft}
            placeholder="メッセージを入力"
            placeholderTextColor={colors.mutedText}
            style={styles.messageInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="メッセージを送信"
            accessibilityState={{ disabled: sending || !draft.trim() }}
            disabled={sending || !draft.trim()}
            onPress={() => void sendMessage()}
            style={({ pressed }) => [
              styles.sendButton,
              !draft.trim() && styles.sendButtonDisabled,
              pressed && styles.sendButtonPressed,
            ]}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F2E5D8',
  },
  avatarLabel: {
    color: colors.mutedText,
    fontSize: 7,
  },
  name: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  nameButton: {
    flex: 1,
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 12,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  datePill: {
    alignSelf: 'center',
    borderRadius: 14,
    backgroundColor: '#EFE8DE',
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: spacing.xs,
  },
  dateLabel: {
    color: colors.mutedText,
    fontSize: 11,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  theirMessageRow: {
    justifyContent: 'flex-start',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F2E5D8',
    marginBottom: 15,
  },
  messageAvatarLabel: {
    color: colors.mutedText,
    fontSize: 5,
  },
  messageColumn: {
    maxWidth: '78%',
    alignItems: 'flex-start',
    gap: 3,
  },
  myMessageColumn: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  theirBubble: {
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  myBubble: {
    borderBottomRightRadius: 5,
    backgroundColor: colors.primarySoft,
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  myMessageText: {
    color: colors.text,
  },
  messageTime: {
    color: colors.mutedText,
    fontSize: 10,
    paddingHorizontal: 3,
  },
  myMessageTime: {
    textAlign: 'right',
  },
  composer: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  messageInput: {
    flex: 1,
    maxHeight: 104,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sendButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: {
    backgroundColor: '#C9B5B5',
  },
  sendButtonPressed: {
    opacity: 0.75,
  },
  notFound: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  notFoundText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
