import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '../components/AuthButton';
import { FormField } from '../components/FormField';
import { isProfileReady } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../../../theme/tokens';

type EmailAuthScreenProps = {
  mode: 'login' | 'signup';
};

export default function EmailAuthScreen({ mode }: EmailAuthScreenProps) {
  const isSignup = mode === 'signup';
  const { createAccount, logIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const handleSubmit = async () => {
    if (busy) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice('メールアドレスの形式を確認してください。');
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setNotice('パスワードは12〜128文字で入力してください。');
      return;
    }
    if (isSignup && password !== passwordConfirmation) {
      setNotice('確認用パスワードが一致しません。');
      return;
    }

    setBusy(true);
    setNotice('');
    try {
      if (isSignup) {
        await createAccount(normalizedEmail, password);
        router.replace('/sign-up');
      } else {
        const profile = await logIn(normalizedEmail, password);
        router.replace(isProfileReady(profile) ? '/discover' : '/sign-up');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '認証に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ animation: 'none', gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.title}>のどじまん</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.intro}>
          <Text style={styles.sectionTitle}>{isSignup ? '新規登録' : 'ログイン'}</Text>
          <Text style={styles.description}>
            {isSignup
              ? 'メールアドレスとパスワードを登録してください。'
              : '登録したメールアドレスとパスワードを入力してください。'}
          </Text>
        </View>

        <View style={styles.fields}>
          <FormField
            label="メールアドレス"
            placeholder="name@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            maxLength={254}
          />
          <FormField
            label="パスワード"
            placeholder="12文字以上"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            maxLength={128}
          />
          {isSignup ? (
            <FormField
              label="パスワード（確認）"
              placeholder="同じパスワードを入力"
              value={passwordConfirmation}
              onChangeText={setPasswordConfirmation}
              secureTextEntry
              autoCapitalize="none"
              maxLength={128}
            />
          ) : null}
        </View>

        {notice ? (
          <View accessibilityRole="alert" style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <AuthButton
          label={busy ? '処理中…' : isSignup ? '次へ' : 'ログイン'}
          variant="primary"
          onPress={handleSubmit}
          disabled={busy}
        />
        {busy ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}

        {!isSignup ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.push('/reset-password')} style={styles.switchButton}>
            <Text style={styles.switchText}>
              パスワードを忘れた方は<Text style={styles.switchLinkText}>こちら</Text>
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => router.replace(isSignup ? '/' : '/create-account')}
          style={[styles.switchButton, !isSignup && styles.loginSignupSwitchButton]}
        >
          <Text style={styles.switchText}>
            {isSignup ? 'すでにアカウントをお持ちの方は' : 'アカウントをお持ちでない方は'}
            <Text style={styles.switchLinkText}>{isSignup ? 'ログイン' : '新規登録'}</Text>
          </Text>
        </Pressable>
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
    flexGrow: 1,
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
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  intro: {
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  description: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  fields: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  notice: {
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 19,
  },
  spinner: {
    marginTop: -spacing.sm,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loginSignupSwitchButton: {
    paddingTop: spacing.xs,
  },
  switchText: {
    color: colors.primary,
    fontSize: 12,
    textAlign: 'center',
  },
  switchLinkText: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
