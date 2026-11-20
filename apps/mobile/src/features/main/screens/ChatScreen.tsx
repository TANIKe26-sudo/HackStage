import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [safetyActionBusy, setSafetyActionBusy] = useState(false);
  const [safetyActionType, setSafetyActionType] = useState<'report' | 'block' | null>(null);
  const canSubmitReport = !!reportReason.trim() && !safetyActionBusy;
  const sendingRef = useRef(false);
  const messageList = useRef<ScrollViewInstance | null>(null);
  const composerFocused = useRef(false);
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

  const submitReport = async () => {
    const details = reportReason.trim();
    if (!conversation || !details || safetyActionBusy) return;
    setSafetyActionBusy(true);
    setSafetyActionType('report');
    try {
      await api.reportUser(conversation.user_id, details);
      setShowReportDialog(false);
      setReportReason('');
      Alert.alert('通報を受け付けました', 'ご報告ありがとうございます。');
    } catch (error) {
      Alert.alert('通報できませんでした', error instanceof Error ? error.message : '再度お試しください。');
    } finally {
      setSafetyActionBusy(false);
      setSafetyActionType(null);
    }
  };

  const blockConversationUser = async () => {
    if (!conversation || safetyActionBusy) return;
    setSafetyActionBusy(true);
    setSafetyActionType('block');
    try {
      await api.blockUser(conversation.user_id);
      router.back();
    } catch (error) {
      Alert.alert('ブロックできませんでした', error instanceof Error ? error.message : '再度お試しください。');
    } finally {
      setSafetyActionBusy(false);
      setSafetyActionType(null);
    }
  };

  const confirmBlock = () => {
    if (!conversation || safetyActionBusy) return;
    Alert.alert(`${conversation.display_name}をブロックしますか？`, 'ブロックするとマッチが解除され、会話できなくなります。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'はい', style: 'destructive', onPress: () => void blockConversationUser() },
    ]);
  };

  const openSafetyMenu = () => {
    if (!conversation || safetyActionBusy) return;
    setShowSafetyMenu(current => !current);
  };

  if (!conversation) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <Pressable accessibilityRole="button" accessibilityLabel="トーク一覧に戻る" onPress={() => router.back()} style={styles.loadingBackButton}>
            <Ionicons name="chevron-back" size={24} color={colors.mutedText} />
          </Pressable>
          <View style={styles.loadingCenter}>
            {resource.loading ? <ActivityIndicator size="small" color={colors.mutedText} /> : <RequestState loading={false} error={resource.error ?? 'このトークを表示できませんでした。'} onRetry={() => void resource.refresh()} />}
          </View>
        </View>
      </SafeAreaView>
    );
  }


  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={0}
      enabled={!showReportDialog}
      style={styles.safeArea}
    >
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
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
          {safetyActionBusy ? (
            <Text accessibilityRole="text" style={styles.safetyActionStatus}>
              {safetyActionType === 'block' ? 'ブロック中…' : '通報中…'}
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="通報・ブロック"
              onPress={openSafetyMenu}
              style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
            >
              <Ionicons name="menu-outline" size={25} color={colors.mutedText} />
            </Pressable>
          )}
        </View>

        {showSafetyMenu ? (
          <View style={styles.safetyMenuLayer}>
            <Pressable
              accessibilityLabel="メニューを閉じる"
              onPress={() => setShowSafetyMenu(false)}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.safetyMenu}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowSafetyMenu(false);
                  setShowReportDialog(true);
                }}
                style={({ pressed }) => [styles.safetyMenuItem, pressed && styles.pressed]}
              >
                <Text style={styles.safetyMenuText}>通報</Text>
              </Pressable>
              <View style={styles.safetyMenuDivider} />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowSafetyMenu(false);
                  confirmBlock();
                }}
                style={({ pressed }) => [styles.safetyMenuItem, pressed && styles.pressed]}
              >
                <Text style={styles.safetyMenuBlockText}>ブロック</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
          onLayout={() => {
            if (composerFocused.current) messageList.current?.scrollToEnd({ animated: false });
          }}
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
            onFocus={() => {
              composerFocused.current = true;
              messageList.current?.scrollToEnd({ animated: true });
            }}
            onBlur={() => { composerFocused.current = false; }}
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
              (sending || !draft.trim()) && styles.sendButtonDisabled,
              pressed && styles.sendButtonPressed,
            ]}
          >
            <Ionicons name="send" size={18} color={sending || !draft.trim() ? colors.primary : colors.white} />
          </Pressable>
        </View>
      </View>
      <Modal
        visible={showReportDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportDialog(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.dialogBackdrop}
        >
          <Pressable
            accessibilityLabel="通報画面を閉じる"
            onPress={() => setShowReportDialog(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.reportDialog}>
            <Text style={styles.dialogTitle}>{conversation.display_name}を通報</Text>
            <TextInput
              accessibilityLabel="通報理由"
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              maxLength={1000}
              editable={!safetyActionBusy}
              placeholder="通報理由を入力してください。"
              placeholderTextColor={colors.mutedText}
              textAlignVertical="top"
              style={styles.reportInput}
            />
            <View style={styles.dialogActions}>
              <Pressable
                accessibilityRole="button"
                disabled={safetyActionBusy}
                onPress={() => setShowReportDialog(false)}
                style={({ pressed }) => [styles.dialogButton, pressed && styles.pressed]}
              >
                <Text style={styles.dialogCancelText}>キャンセル</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: safetyActionBusy || !reportReason.trim() }}
                disabled={safetyActionBusy || !reportReason.trim()}
                onPress={() => void submitReport()}
                style={({ pressed }) => [styles.dialogButton, canSubmitReport && styles.dialogPrimaryButton, !canSubmitReport && styles.dialogButtonDisabled, pressed && styles.pressed]}
              >
                <Text style={[styles.dialogPrimaryText, !canSubmitReport && styles.dialogSubmitDisabledText]}>{safetyActionBusy ? '通報中…' : '通報'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
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
    position: 'relative',
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
    overflow: 'hidden',
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
  menuButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyActionStatus: { color: colors.mutedText, fontSize: 12, fontWeight: '600' },
  safetyMenuLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  safetyMenu: {
    position: 'absolute',
    top: 64,
    right: spacing.md,
    width: 144,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingVertical: 4,
    shadowColor: '#382A2C',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  safetyMenuItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  safetyMenuText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  safetyMenuBlockText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  safetyMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
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
    overflow: 'hidden',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.4,
  },
  sendButtonPressed: {
    opacity: 0.75,
  },
  loadingScreen: { flex: 1, backgroundColor: colors.surface },
  loadingBackButton: { position: 'absolute', zIndex: 1, top: spacing.sm, left: spacing.md, width: 36, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: {
    opacity: 0.7,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  reportDialog: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  dialogTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  dialogDescription: {
    color: colors.mutedText,
    fontSize: 14,
  },
  reportInput: {
    minHeight: 120,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    color: colors.text,
    padding: spacing.md,
    fontSize: 14,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  dialogButton: {
    minHeight: 44,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dialogPrimaryButton: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dialogButtonDisabled: {
    opacity: 0.4,
  },
  dialogCancelText: {
    color: colors.mutedText,
    fontWeight: '600',
  },
  dialogPrimaryText: {
    color: colors.white,
    fontWeight: '700',
  },
  dialogSubmitDisabledText: {
    color: colors.primary,
  },
});
