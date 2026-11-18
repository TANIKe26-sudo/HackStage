import { classificationLabels } from '../api/classification';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '../components/AuthButton';
import { CameraIcon } from '../components/CameraIcon';
import { FormField } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { useSignUpDraft } from '../context/SignUpDraftContext';
import { colors, spacing } from '../../../theme/tokens';

export default function SignUpScreen() {
  const { profilePhotoUri, profilePhotoDataUrl, setProfilePhotoDataUrl, profilePhotoClassification, setProfilePhotoClassification } = useSignUpDraft();
  const { profile, token, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [age, setAge] = useState(
    profile?.birth_year ? String(new Date().getFullYear() - profile.birth_year) : '',
  );
  const [area, setArea] = useState(profile?.area ?? '');
  const [purpose, setPurpose] = useState(profile?.purpose ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const handleComplete = async () => {
    if (!token) {
      router.replace('/create-account');
      return;
    }

    const numericAge = Number(age);
    if (!name.trim() || name.trim().length > 30) {
      setNotice('ユーザー名を1〜30文字で入力してください。');
      return;
    }
    if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 120) {
      setNotice('18歳以上の年齢を入力してください。');
      return;
    }
    if (!area.trim() || area.trim().length > 80) {
      setNotice('お住まいの地域を入力してください。');
      return;
    }

    setBusy(true);
    setNotice('');
    try {
      await saveProfile(
        {
          display_name: name.trim(),
          birth_year: new Date().getFullYear() - numericAge,
          area: area.trim(),
          purpose: purpose.trim(),
          conversation_pace: profile?.conversation_pace ?? 'balanced',
          throat_class: profilePhotoClassification ?? profile?.throat_class ?? 'pending',
          bio: profile?.bio ?? '',
        },
        profilePhotoDataUrl,
      );
      setProfilePhotoDataUrl(null);
      setProfilePhotoClassification(null);
      router.replace('/discover');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'プロフィールを保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="前の画面へ戻る"
            accessibilityRole="button"
            onPress={handleBack}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{profile?.birth_year ? 'プロフィール編集' : '新規登録'}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.sectionTitle}>基本情報</Text>

        <View style={styles.photoCard}>
          {profilePhotoUri ? (
            <Image
              accessibilityLabel="撮影したプロフィール写真"
              source={{ uri: profilePhotoUri }}
              style={styles.photoTile}
              resizeMode="cover"
            />
          ) : (
            <Pressable
              accessibilityLabel="プロフィール写真を撮影"
              accessibilityRole="button"
              onPress={() => router.push('/capture-photo')}
              style={({ pressed }) => [styles.photoTile, pressed && styles.photoTilePressed]}
            >
              <CameraIcon size={42} color={colors.primary} />
            </Pressable>
          )}
          <View style={styles.photoCopy}>
            <Text style={styles.photoTitle}>プロフィール写真</Text>
            {profilePhotoUri ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/capture-photo')}
                style={({ pressed }) => pressed && styles.photoActionPressed}
              >
                <Text style={styles.photoAction}>再撮影</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.fields}>
          <FormField
            label="ユーザー名"
            placeholder="例) たろう"
            value={name}
            onChangeText={setName}
            maxLength={30}
          />
          <FormField
            label="年齢"
            placeholder="例) 26"
            keyboardType="number-pad"
            value={age}
            onChangeText={(value) => setAge(value.replace(/\D/g, '').slice(0, 3))}
            maxLength={3}
          />
          <FormField
            label="お住まいの地域"
            placeholder="例) 東京都"
            value={area}
            onChangeText={setArea}
            maxLength={80}
          />
          <FormField
            label="お相手探しの目的"
            placeholder="例) 真剣な交際"
            value={purpose}
            onChangeText={setPurpose}
            maxLength={100}
          />
        </View>

        <View style={styles.categoryCard}>
          <Text style={styles.categoryTitle}>喉仏の写り方</Text>
          <Text style={styles.categoryValue}>{classificationLabels[profilePhotoClassification ?? profile?.throat_class ?? 'pending']}</Text>
        </View>

        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        <AuthButton
          label={busy ? '保存中…' : '完了'}
          variant="primary"
          onPress={handleComplete}
          disabled={busy}
        />
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
    overflow: 'hidden',
  },
  photoTilePressed: {
    opacity: 0.78,
  },
  photoActionPressed: {
    opacity: 0.65,
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
  notice: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 19,
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
