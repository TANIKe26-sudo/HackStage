import { useMemo, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { ConversationCard } from '../components/ConversationCard';
import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { demoConversations } from '../data/demoConversations';

export default function MatchesScreen() {
  const [searchText, setSearchText] = useState('');
  const conversations = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) return demoConversations;

    return demoConversations.filter((conversation) =>
      `${conversation.name} ${conversation.lastMessage}`.toLowerCase().includes(normalizedSearch),
    );
  }, [searchText]);

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
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {conversations.length > 0 ? (
              conversations.map((conversation) => (
                <ConversationCard key={conversation.id} conversation={conversation} />
              ))
            ) : (
              <Text style={styles.emptyMessage}>トークが見つかりません</Text>
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
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
