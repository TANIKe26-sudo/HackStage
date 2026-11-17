import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { ReceivedLikeCard } from '../components/ReceivedLikeCard';
import { demoReceivedLikes } from '../data/demoReceivedLikes';
import { colors, spacing } from '../../../theme/tokens';

export default function LikesReceivedScreen() {
  const [receivedLikes, setReceivedLikes] = useState(demoReceivedLikes);

  const removeLike = (profileId: string) => {
    setReceivedLikes((currentLikes) => currentLikes.filter((profile) => profile.id !== profileId));
  };

  const handleTabPress = (tab: MainTabId) => {
    if (tab === 'search') router.replace('/discover');
    if (tab === 'chat') router.replace('/matches');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>届いたいいね</Text>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {receivedLikes.length > 0 ? (
            receivedLikes.map((profile) => (
              <ReceivedLikeCard
                key={profile.id}
                profile={profile}
                onMatch={() => removeLike(profile.id)}
                onDecline={() => removeLike(profile.id)}
              />
            ))
          ) : (
            <Text style={styles.emptyMessage}>届いたいいねはありません</Text>
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
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
