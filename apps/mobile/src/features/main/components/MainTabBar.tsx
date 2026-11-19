import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../../theme/tokens';
import { MainTabIcon, type MainTabIconName } from './MainTabIcon';

export type MainTabId = 'home' | 'search' | 'chat' | 'likes' | 'profile';

const tabs: { id: MainTabId; label: string; icon: MainTabIconName }[] = [
  { id: 'home', label: 'ホーム', icon: 'home' },
  { id: 'search', label: '探す', icon: 'search' },
  { id: 'chat', label: 'トーク', icon: 'chat' },
  { id: 'likes', label: 'いいね', icon: 'heart' },
  { id: 'profile', label: 'マイページ', icon: 'profile' },
];

type MainTabBarProps = {
  activeTab: MainTabId;
  onTabPress: (tab: MainTabId) => void;
};

export function MainTabBar({ activeTab, onTabPress }: MainTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safeArea, { paddingBottom: insets.bottom }]}>
      <View style={styles.bottomNavigation}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: activeTab === tab.id }}
            onPress={() => onTabPress(tab.id)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <MainTabIcon name={tab.icon} selected={activeTab === tab.id} />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.selectedTabLabel]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
  },
  bottomNavigation: {
    height: 66,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    color: colors.mutedText,
    fontSize: 10,
  },
  selectedTabLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
});
