import { ProtectedPhoto } from './ProtectedPhoto';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import type { Conversation } from '../api/client';

export function ConversationCard({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${conversation.name}さんとのトークを開く`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.photoPlaceholder}>
        <ProtectedPhoto captureId={conversation.captureId} />
      </View>

      <View style={styles.conversationContent}>
        <Text numberOfLines={1} style={styles.name}>
          {conversation.name}
        </Text>
        <Text numberOfLines={1} style={styles.lastMessage}>
          {conversation.lastMessage}
        </Text>
      </View>

      <View style={styles.trailingContent}>
        <View style={styles.timestampRow}>
          <Text style={styles.timestamp}>{conversation.updatedAt}</Text>
          {conversation.hasUnread ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    backgroundColor: colors.surface,
    padding: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  photoPlaceholder: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 32,
    backgroundColor: '#F2E5D8',
  },
  noImage: {
    color: colors.mutedText,
    fontSize: 10,
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 5,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  lastMessage: {
    color: colors.mutedText,
    fontSize: 12,
  },
  trailingContent: {
    minWidth: 44,
    position: 'relative',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingVertical: 2,
    paddingRight: 1,
  },
  timestampRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timestamp: {
    color: colors.mutedText,
    fontSize: 11,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
