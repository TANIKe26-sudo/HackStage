import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/tokens';
import { AppIcon } from '../components/AppIcon';
import { HobbyGenreGrid } from '../components/HobbyGenreGrid';
import { MainTabBar, type MainTabId } from '../components/MainTabBar';

export default function DiscoverScreen() {
  const handleTabPress = (tab: MainTabId) => {
    if (tab === 'home') router.replace('/home');
    if (tab === 'search') router.replace('/discover');
    if (tab === 'chat') router.replace('/matches');
    if (tab === 'likes') router.replace('/likes');
    if (tab === 'profile') router.replace('/profile');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>趣味から探す</Text>
          <Pressable
            accessibilityLabel="マッチング範囲を設定"
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/profile-settings/[kind]', params: { kind: 'location' } })}
            style={({ pressed }) => [styles.filterButton, pressed && styles.filterPressed]}
          >
            <AppIcon name="filter" size={24} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.description}>趣味を選ぶと、その趣味を登録している人のみ表示されます。</Text>
          <HobbyGenreGrid onSelect={id => router.push({ pathname: '/discover/[hobby]', params: { hobby: id } })} />
        </ScrollView>

        <MainTabBar activeTab="search" onTabPress={handleTabPress} />
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
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPressed: {
    opacity: 0.65,
  },
  list: {
    flex: 1,
  },
  gridContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  description: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
});
