import { useMemo, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { ConversationCard } from '../components/ConversationCard';
import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { formatConversationTimestamp, useMainApi } from '../api/client';
import { useResource } from '../api/useResource';
import { RequestState } from '../components/RequestState';

export default function MatchesScreen() {
  const api = useMainApi();
  const resource = useResource(api.matches, 5000);
  const [searchText, setSearchText] = useState('');
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const conversations = useMemo(() => {
    const rows = (resource.data?.matches ?? []).map(m => ({
      id: m.id, captureId: m.capture_id, name: m.display_name, lastMessage: m.last_message ?? 'マッチしました。会話を始めましょう。',
      updatedAt: formatConversationTimestamp(m.updated_at), hasUnread: m.unread_count > 0,
    }));
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) return rows;

    return rows.filter((conversation) =>
      `${conversation.name} ${conversation.lastMessage}`.toLowerCase().includes(normalizedSearch),
    );
  }, [searchText, resource.data]);

  const refreshByPull = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    try { await resource.refresh(); }
    finally { setPullRefreshing(false); }
  };

  const handleTabPress = (tab: MainTabId) => {
    if (tab === 'search') router.replace('/discover');
    if (tab === 'likes') router.replace('/likes');
    if (tab === 'profile') router.replace('/profile');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>トーク</Text>
          <View style={styles.loadingSlot}>
            {resource.loading && !pullRefreshing ? <ActivityIndicator size="small" color={colors.mutedText} accessibilityLabel="更新中" /> : null}
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={colors.mutedText} />
            <TextInput
              accessibilityLabel="トークを検索"
              value={searchText}
              onChangeText={setSearchText}
              placeholder="検索"
              placeholderTextColor={colors.mutedText}
              returnKeyType="search"
              style={styles.searchInput}
            />
          </View>

          <ScrollView
            refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void refreshByPull()} />}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <RequestState loading={false} error={resource.error} onRetry={() => void resource.refresh()} />
            {conversations.length > 0 ? (
              conversations.map((conversation) => (
                <ConversationCard
                  key={conversation.id}
                  conversation={conversation}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[conversationId]',
                      params: { conversationId: conversation.id },
                    })
                  }
                />
              ))
            ) : (
              !resource.loading && !resource.error ? <Text style={styles.emptyMessage}>トークが見つかりません</Text> : null
            )}
          </ScrollView>
        </View>

        <MainTabBar activeTab="chat" onTabPress={handleTabPress} />
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
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  loadingSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  searchBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  list: {
    flex: 1,
    marginTop: spacing.sm,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  emptyMessage: {
    paddingTop: spacing.xl,
    color: colors.mutedText,
    fontSize: 14,
    textAlign: 'center',
  },
});
