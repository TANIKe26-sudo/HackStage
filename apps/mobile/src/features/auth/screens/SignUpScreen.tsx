import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '../components/AuthButton';
import { FormField } from '../components/FormField';
import { colors, spacing } from '../../../theme/tokens';

export default function SignUpScreen() {
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Welcomeへ戻る"
            accessibilityRole="button"
            onPress={handleBack}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>‹</Text>
          </Pressable>
          <Text style={styles.title}>新規登録</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.sectionTitle}>基本情報</Text>

        <View style={styles.photoCard}>
          <View style={styles.photoTile}>
            <View style={styles.cameraBody}>
              <View style={styles.cameraLens} />
            </View>
          </View>
          <View style={styles.photoCopy}>
            <Text style={styles.photoTitle}>プロフィール写真</Text>
            <Text style={styles.photoAction}>再撮影</Text>
          </View>
        </View>

        <View style={styles.fields}>
          <FormField label="ユーザー名" placeholder="例) たろう" />
          <FormField label="年齢" placeholder="例) 26" keyboardType="number-pad" />
          <FormField label="お住まいの地域" placeholder="例) 東京都" />
          <FormField label="お相手探しの目的" placeholder="例) 真剣な交際" />
        </View>

        <View style={styles.categoryCard}>
          <Text style={styles.categoryTitle}>カテゴリ</Text>
          <Text style={styles.categoryValue}>喉仏あり / 男性カテゴリ</Text>
        </View>

        <AuthButton label="完了" variant="primary" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  header: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    color: colors.primary,
    fontSize: 32,
    lineHeight: 34,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  photoCard: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  photoTile: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
  },
  cameraBody: {
    width: 30,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: 5,
  },
  cameraLens: {
    width: 10,
    height: 10,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: 5,
  },
  photoCopy: {
    gap: 6,
  },
  photoTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  photoAction: {
    color: colors.primary,
    fontSize: 13,
  },
  fields: {
    gap: spacing.sm,
  },
  categoryCard: {
    gap: 7,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  categoryTitle: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryValue: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: colors.surface,
    color: colors.primary,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
});
