import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest } from '../api/client';
import { AuthButton } from '../components/AuthButton';
import { FormField } from '../components/FormField';
import { colors, spacing } from '../../../theme/tokens';

type Delivery = { delivery?: string; code?: string; userId?: string };

export default function ResetPasswordScreen() {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [recoveryUserId, setRecoveryUserId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localCode, setLocalCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const sendCode = async () => {
    if (inFlight.current) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setNotice('メールアドレスの形式を確認してください。');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    setLocalCode('');
    try {
      const result = await apiRequest<Delivery>('/auth/password/forgot', undefined, {
        method: 'POST', body: JSON.stringify({ email: address }),
      });
      setRecoveryUserId(result.userId ?? '');
      setEmail(address);
      setCode('');
      setStep('code');
      if (__DEV__ && result.delivery === 'local' && /^\d{6}$/.test(result.code ?? '')) setLocalCode(result.code!);
      setNotice('登録がある場合は再設定コードを送信します。コードは15分間有効です。届いたコードを入力してください。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'コードの送信に失敗しました。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (inFlight.current) return;
    if (!/^\d{6}$/.test(code)) { setNotice('確認コードを半角数字6桁で入力してください。'); return; }
    if (password.length < 9 || password.length > 128) { setNotice('パスワードは9〜128文字で入力してください。'); return; }
    if (password !== confirmation) { setNotice('確認用パスワードが一致しません。'); return; }
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    try {
      await apiRequest('/auth/password/reset', undefined, {
        method: 'POST', body: JSON.stringify({ email, code, password, userId: recoveryUserId }),
      });
      setPassword(''); setConfirmation(''); setCode(''); setLocalCode('');
      setStep('done');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'パスワードの再設定に失敗しました。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ animation: 'slide_from_right', animationMatchesGesture: true, gestureEnabled: !busy }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ログイン画面に戻る"
            disabled={busy}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color={colors.mutedText} />
          </Pressable>
          <Text style={styles.brand}>のどじまん</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.intro}>
          <Text style={styles.sectionTitle}>{step === 'done' ? 'パスワードを変更しました' : 'パスワードの再設定'}</Text>
          <Text style={styles.description}>
            {step === 'email' ? '登録したメールアドレスに確認コードを送信します。'
              : step === 'code' ? `${email} 宛ての確認コードと、新しいパスワードを入力してください。`
                : 'すべての端末からログアウトしました。新しいパスワードでログインしてください。'}
          </Text>
        </View>
        {step === 'email' ? (
          <View style={styles.fields}>
            <FormField label="メールアドレス" placeholder="name@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={254} />
          </View>
        ) : step === 'code' ? (
          <View style={styles.fields}>
            {localCode ? <Text selectable style={styles.description}>ローカル開発用コード（メール送信なし）：{localCode}</Text> : null}
            <FormField label="確認コード" placeholder="6桁の数字" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <FormField label="新しいパスワード" placeholder="9〜128文字" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" maxLength={128} />
            <FormField label="新しいパスワード（確認）" placeholder="同じパスワードを入力" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" maxLength={128} />
          </View>
        ) : null}
        {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        <AuthButton variant="primary" disabled={busy}
          label={busy ? '処理中…' : step === 'email' ? '確認コードを送信' : step === 'code' ? 'パスワードを変更' : 'ログインへ'}
          onPress={step === 'email' ? sendCode : step === 'code' ? resetPassword : () => router.replace('/')} />
        {step === 'code' ? <>
          <AuthButton variant="outline" label="確認コードを再送信" disabled={busy} onPress={sendCode} />
          <Pressable accessibilityRole="button" disabled={busy} style={styles.switchButton} onPress={() => {
            setStep('email'); setRecoveryUserId(''); setCode(''); setPassword(''); setConfirmation(''); setLocalCode(''); setNotice('');
          }}><Text style={styles.switchText}><Text style={styles.switchLinkText}>メールアドレスを変更する</Text></Text></Pressable>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  headerSpacer: { width: 36 },
  brand: { color: colors.text, fontSize: 21, fontWeight: '700' },
  intro: { gap: spacing.xs, paddingTop: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '700' },
  description: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
  fields: { gap: spacing.md, marginTop: spacing.sm },
  notice: { backgroundColor: colors.primarySoft, borderRadius: 10, padding: spacing.md },
  noticeText: { color: colors.primary, fontSize: 13, lineHeight: 19 },
  switchButton: { alignItems: 'center', paddingVertical: spacing.md },
  switchText: { color: colors.primary, fontSize: 12, textAlign: 'center' },
  switchLinkText: { fontWeight: '600', textDecorationLine: 'underline' },
});
