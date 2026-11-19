import { ProtectedPhoto } from '../components/ProtectedPhoto';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/context/AuthContext';
import { colors, spacing } from '../../../theme/tokens';
import { MainTabBar, type MainTabId } from '../components/MainTabBar';
import { ProfileSettingRow } from '../components/ProfileSettingRow';

const settings = [
  { icon: 'profileEdit', label: 'プロフィール編集' },
  { icon: 'calendar', label: '待ち合わせ予定' },
  { icon: 'location', label: 'マッチング範囲' },
  { icon: 'report', label: '通報・ブロック' },
  { icon: 'hidePeople', label: '知り合いを非表示' },
  { icon: 'accountDelete', label: 'アカウント削除' },
] as const;

function getThroatLabel(throatClass?: string) {
  if (throatClass === 'present') return '喉仏あり';
  if (throatClass === 'absent') return '喉仏なし';
  return '喉仏確認中';
}

export default function ProfileScreen() {
  const { profile, logOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const handleLogOut = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await logOut();
    } catch {
      // AuthContext clears the local session even when the API logout request fails.
    }
    router.replace('/');
  };

  const handleTabPress = (tab: MainTabId) => {
    if (tab === 'search') router.replace('/discover');
    if (tab === 'likes') router.replace('/likes');
    if (tab === 'chat') router.replace('/matches');
  };

  const age = profile?.birth_year
    ? new Date().getFullYear() - profile.birth_year
    : null;
  const name = profile?.display_name?.trim() || 'プロフィール未登録';
  const nameWithAge = name + (age ? ' (' + age + ')' : '');
  const purposeAndArea = [profile?.purpose?.trim(), profile?.area?.trim()]
    .filter(Boolean)
    .join('・');
  const photoCaptureId = profile?.profile_photo_capture_id;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>マイページ</Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.photo}><ProtectedPhoto captureId={photoCaptureId} /></View>
            <View style={styles.profileInfo}>
              <Text numberOfLines={1} style={styles.name}>
                {nameWithAge}
              </Text>
              <Text numberOfLines={1} style={styles.details}>
                {purposeAndArea || 'プロフィール情報を登録してください'}
              </Text>
              {profile?.throat_class ? (
                <Text style={styles.throatLabel}>{getThroatLabel(profile.throat_class)}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.settings}>
            {settings.map((setting) => (
              <ProfileSettingRow
                key={setting.label}
                icon={setting.icon}
                label={setting.label}
                onPress={() => {
                  if (setting.icon === 'profileEdit') {
                    router.push('/sign-up');
                  } else {
                    router.push({ pathname: '/profile-settings/[kind]', params: { kind: setting.icon } });
                  }
                }}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoggingOut }}
            disabled={isLoggingOut}
            onPress={() => {
              Alert.alert('ログアウト', 'ログアウトしますか？', [
                { text: 'キャンセル', style: 'cancel' },
                { text: 'ログアウト', style: 'destructive', onPress: () => void handleLogOut() },
              ]);
            }}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
          >
            {isLoggingOut ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.logoutLabel}>ログアウト</Text>
            )}
          </Pressable>
        </ScrollView>

        <MainTabBar activeTab="profile" onTabPress={handleTabPress} />
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
  content: {
    flex: 1,
  },
  contentContainer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  profileCard: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  photo: {
    width: 68,
    height: 82,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  photoPlaceholder: {
    width: 68,
    height: 82,
    borderRadius: 8,
    backgroundColor: '#F2E4D6',
  },
  profileInfo: {
    flex: 1,
    gap: 5,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  details: {
    color: colors.mutedText,
    fontSize: 11,
  },
  throatLabel: {
    color: colors.mutedText,
    fontSize: 10,
  },
  settings: {
    gap: 8,
  },
  logoutButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  logoutLabel: {
    color: colors.mutedText,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
