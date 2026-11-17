import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme/tokens';
import { MainTabIcon, type MainTabIconName } from './MainTabIcon';

const tabs: { label: string; icon: MainTabIconName; selected?: boolean }[] = [
  { label: '探す', icon: 'search', selected: true },
  { label: 'いいね', icon: 'heart' },
  { label: 'トーク', icon: 'chat' },
  { label: 'マイページ', icon: 'profile' },
];

export function MainTabBar() {
  return (
    <View style={styles.bottomNavigation}>
      {tabs.map((tab) => (
        <View key={tab.label} style={styles.tab}>
          <MainTabIcon name={tab.icon} selected={Boolean(tab.selected)} />
          <Text style={[styles.tabLabel, tab.selected && styles.selectedTabLabel]}>{tab.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  tabLabel: {
    color: colors.mutedText,
    fontSize: 10,
  },
  selectedTabLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
});
