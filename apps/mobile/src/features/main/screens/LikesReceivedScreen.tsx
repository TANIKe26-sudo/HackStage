import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { ReceivedLikeCard } from '../components/ReceivedLikeCard';
import { profileCard, useMainApi } from '../api/client';
import { useResource } from '../api/useResource';
import { RequestState } from '../components/RequestState';
import { colors, spacing } from '../../../theme/tokens';

export default function LikesReceivedScreen() {
  const api = useMainApi();
  const resource = useResource(api.likes, 10000);
  const [removed, setRemoved] = useState<string[]>([]);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const inFlight = useRef(false);
  const receivedLikes = (resource.data?.likes ?? []).filter(p => !removed.includes(p.user_id)).map(profileCard);
  const refreshByPull = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    try { await resource.refresh(); }
    finally { setPullRefreshing(false); }
  };
  const decide = async (profileId: string, accept: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (accept) {
        const result = await api.like(profileId);
        if (result.matched && result.matchId) {
          router.push({ pathname: '/chat/[conversationId]', params: { conversationId: result.matchId } });
        }
      } else await api.pass(profileId);
      setRemoved(current => [...current, profileId]);
      void resource.refresh();
    } catch (error) {
      Alert.alert('送信できませんでした', error instanceof Error ? error.message : '再度お試しください。');
    } finally { inFlight.current = false; }
  };

  const handleTabPress = (tab: MainTabId) => {
    if (tab === 'search') router.replace('/discover');
    if (tab === 'chat') router.replace('/matches');
    if (tab === 'profile') router.replace('/profile');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>届いたいいね</Text>
          <View style={styles.loadingSlot}>
            {resource.loading && !pullRefreshing ? <ActivityIndicator size="small" color={colors.mutedText} accessibilityLabel="更新中" /> : null}
          </View>
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void refreshByPull()} />}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <RequestState loading={false} error={resource.error} onRetry={() => void resource.refresh()} />
          {receivedLikes.length > 0 ? (
            receivedLikes.map((profile) => (
              <ReceivedLikeCard
                key={profile.id}
                profile={profile}
                onMatch={() => void decide(profile.id, true)}
                onDecline={() => void decide(profile.id, false)}
              />
            ))
          ) : (
            !resource.loading && !resource.error ? <Text style={styles.emptyMessage}>届いたいいねはありません</Text> : null
          )}
        </ScrollView>

        <MainTabBar activeTab="likes" onTabPress={handleTabPress} />
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
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  emptyMessage: {
    paddingTop: spacing.xl,
    color: colors.mutedText,
    fontSize: 14,
    textAlign: 'center',
  },
});
