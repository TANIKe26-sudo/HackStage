import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
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

import { colors, spacing } from '../../../theme/tokens';
import { TodayTopicCard } from '../components/TodayTopicCard';
import { demoChats, type ChatMessage } from '../data/demoChats';
import { demoConversations } from '../data/demoConversations';

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const conversation = demoConversations.find((item) => item.id === conversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(() => demoChats[conversationId] ?? []);
  const [draft, setDraft] = useState('');
  const messageList = useRef<ScrollViewInstance | null>(null);

  useEffect(() => {
    messageList.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages((current) => [
      ...current,
      { id: `${conversationId}-${Date.now()}`, sender: 'me', text, time },
    ]);
    setDraft('');
  };

  if (!conversation) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.notFound}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.notFoundText}>トークが見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dateLabel = /^\d{2}:\d{2}$/.test(conversation.updatedAt)
    ? '今日'
    : conversation.updatedAt;

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
            <Ionicons name="chevron-back" size={25} color={colors.text} />
          </Pressable>

          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>No image</Text>
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {conversation.name}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <TodayTopicCard
          onAnswer={() =>
            router.push({
              pathname: '/daily-topic/[conversationId]',
              params: { conversationId },
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
          <View style={styles.datePill}>
            <Text style={styles.dateLabel}>{dateLabel}</Text>
          </View>

          {messages.map((message) => {
            const isMine = message.sender === 'me';

            return (
              <View
                key={message.id}
                style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}
              >
                {!isMine ? (
                  <View style={styles.messageAvatar}>
                    <Text style={styles.messageAvatarLabel}>No image</Text>
                  </View>
                ) : null}
                <View style={[styles.messageColumn, isMine && styles.myMessageColumn]}>
                  <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
                    <Text style={[styles.messageText, isMine && styles.myMessageText]}>
                      {message.text}
                    </Text>
                  </View>
                  <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
                    {message.time}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="メッセージを入力"
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="メッセージを入力"
            placeholderTextColor={colors.mutedText}
            style={styles.messageInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="メッセージを送信"
            accessibilityState={{ disabled: !draft.trim() }}
            disabled={!draft.trim()}
            onPress={sendMessage}
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
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 12,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    gap: spacing.md,
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
