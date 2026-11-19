import { Redirect, router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest, authDestination, needsEmailVerification } from '../api/client';
import { AuthButton } from '../components/AuthButton';
import { FormField } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../../../theme/tokens';
import { KeyboardAwareScrollView } from '../../../components/KeyboardAwareScrollView';

export default function VerifyEmailScreen() {
  const { token, profile, refreshProfile, logOut, isRestoring } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice('');
    try { await work(); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'メール確認に失敗しました。'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (isRestoring) return null;
  if (!token) return <Redirect href="/" />;
  if (profile && !needsEmailVerification(profile)) return <Redirect href={authDestination(profile)} />;
  return <SafeAreaView style={styles.safeArea}>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ログイン画面に戻る"
          disabled={busy}
          onPress={() => void run(async () => {
            await logOut().catch(() => undefined);
            router.replace('/');
          })}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={25} color={colors.mutedText} />
        </Pressable>
        <Text style={styles.brand}>のどじまん</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.title}>メールアドレスの確認</Text>
      <Text style={styles.description}>{profile?.email} 宛てのメールに届いた6桁の確認コードを入力してください。コードは15分間有効です。</Text>
      <Text style={styles.description}>届いていない場合は迷惑メールフォルダを確認するか、下のボタンから送信してください。</Text>
      <FormField label="確認コード" placeholder="6桁の数字" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <AuthButton variant="primary" label={busy ? '処理中…' : 'メールアドレスを確認'} disabled={busy} onPress={() => void run(async () => {
        if (!/^\d{6}$/.test(code)) throw new Error('確認コードを半角数字6桁で入力してください。');
        await apiRequest('/api/email/confirm', token, { method: 'POST', body: JSON.stringify({ code }) });
        setCode(''); await refreshProfile(); router.replace('/');
      })} />
      <AuthButton variant="outline" label="確認コードを送信・再送信" disabled={busy} onPress={() => void run(async () => {
        await apiRequest('/api/email/verification', token, { method: 'POST', body: '{}' });
        setNotice('確認メールの送信を受け付けました。メールに届いたコードを入力してください。');
      })} />
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  headerSpacer: { width: 36 },
  brand: { color: colors.text, fontSize: 21, fontWeight: '700' },
  title: { color: colors.text, fontSize: 21, fontWeight: '700' },
  description: { color: colors.mutedText, fontSize: 13, lineHeight: 20 },
  notice: { padding: spacing.md, backgroundColor: colors.primarySoft, borderRadius: 10 },
  noticeText: { color: colors.primary, fontSize: 13, lineHeight: 20 },
});
