import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';

type Profile = {
  display_name: string;
  birth_year: number | null;
  area: string | null;
  bio: string;
  purpose: string | null;
  conversation_pace: string | null;
  throat_class: 'present' | 'absent' | 'pending';
  age_verification: string;
};
type Screen = 'loading' | 'welcome' | 'auth' | 'profile' | 'complete';
type AuthMode = 'signup' | 'login';
type AppConfig = { apiBaseUrl?: string };

const SESSION_KEY = 'nodobito.api.session';
const config = (Constants.expoConfig?.extra ?? {}) as AppConfig;
const apiBaseUrl = config.apiBaseUrl?.replace(/\/$/, '');
const currentYear = new Date().getFullYear();
const purposes = ['真剣な交際', 'まずは会話から', '友達から', 'まだ決めていない'];
const paces = ['ゆっくり', 'ふつう', 'テンポよく'];
const throatOptions = [
  { value: 'present', label: 'ある' }, { value: 'absent', label: 'ない' }, { value: 'pending', label: 'あとで設定' },
] as const;

function errorMessage(code?: string) {
  const messages: Record<string, string> = {
    age_verification_required: 'プロフィールの登録後、年齢確認が完了するとアプリを利用できます。',
    invalid_email: 'メールアドレスの形式を確認してください。',
    invalid_password: 'パスワードは12〜128文字で入力してください。',
    invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
    email_already_registered: 'このメールアドレスは登録済みです。ログインしてください。',
    rate_limited: '試行回数が多すぎます。15分ほど待ってからもう一度お試しください。',
    account_unavailable: 'このアカウントは現在利用できません。運営にお問い合わせください。',
    server_auth_not_configured: 'サーバーの認証設定が不足しています。APIの設定ファイルを確認してください。',
    unauthorized: 'ログインの有効期限が切れました。再度ログインしてください。',
  };
  return (code && messages[code]) || '通信に失敗しました。APIの起動状態と接続先を確認してください。';
}

async function request(path: string, token?: string, init?: RequestInit) {
  if (!apiBaseUrl) throw new Error('API接続先がありません。apps/mobile/.env.local の EXPO_PUBLIC_API_BASE_URL を設定してください。');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as { error?: string; profile?: Profile; token?: string };
  if (!response.ok) throw new Error(errorMessage(body.error));
  return body;
}

function isProfileReady(profile?: Profile | null) {
  return Boolean(profile?.display_name?.trim() && profile.birth_year && profile.area?.trim());
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [area, setArea] = useState('');
  const [purpose, setPurpose] = useState(purposes[0]);
  const [pace, setPace] = useState(paces[1]);
  const [throatClass, setThroatClass] = useState<Profile['throat_class']>('pending');
  const [bio, setBio] = useState('');
  const firstName = useMemo(() => name.trim() || 'あなた', [name]);

  function populateProfile(data: Profile | null) {
    setProfile(data);
    if (data?.display_name) setName(data.display_name);
    if (data?.birth_year) setBirthYear(String(data.birth_year));
    if (data?.area) setArea(data.area);
    if (data?.purpose && purposes.includes(data.purpose)) setPurpose(data.purpose);
    if (data?.conversation_pace && paces.includes(data.conversation_pace)) setPace(data.conversation_pace);
    if (data?.throat_class) setThroatClass(data.throat_class);
    if (data?.bio) setBio(data.bio);
  }

  async function loadProfile(session: string) {
    const result = await request('/api/me', session);
    const data = result.profile as Profile | null;
    populateProfile(data);
    if (isProfileReady(data)) setScreen('complete');
    else setScreen('profile');
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(SESSION_KEY);
        if (!saved) { if (alive) setScreen('welcome'); return; }
        const result = await request('/api/me', saved);
        if (!alive) return;
        setToken(saved); populateProfile(result.profile as Profile | null);
        if (isProfileReady(result.profile as Profile | null)) setScreen('complete'); else setScreen('profile');
      } catch {
        await SecureStore.deleteItemAsync(SESSION_KEY);
        if (alive) setScreen('welcome');
      }
    })();
    return () => { alive = false; };
  }, []);

  async function authenticate() {
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setNotice('メールアドレスの形式を確認してください。'); return; }
    if (password.length < 12 || password.length > 128) { setNotice('パスワードは12〜128文字で入力してください。'); return; }
    if (authMode === 'signup' && password !== passwordConfirmation) { setNotice('確認用パスワードが一致しません。'); return; }
    setBusy(true); setNotice('');
    try {
      const session = await request(authMode === 'signup' ? '/auth/signup' : '/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ email: normalizedEmail, password, deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android' }),
      });
      if (!session.token) throw new Error('APIからログイン情報を受け取れませんでした。');
      await SecureStore.setItemAsync(SESSION_KEY, session.token);
      setToken(session.token); await loadProfile(session.token);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'アカウント認証に失敗しました。');
    } finally { setBusy(false); }
  }

  async function saveProfile() {
    if (!token) return;
    const year = Number(birthYear);
    if (!name.trim() || name.trim().length > 30) { setNotice('ニックネームを1〜30文字で入力してください。'); return; }
    if (!Number.isInteger(year) || year < 1900 || year > currentYear - 18) { setNotice('18歳以上であることを確認できる生年を入力してください。'); return; }
    if (!area.trim() || area.trim().length > 80) { setNotice('居住エリアを入力してください。'); return; }
    setBusy(true); setNotice('');
    try {
      await request('/api/profile', token, { method: 'PATCH', body: JSON.stringify({ display_name: name.trim(), birth_year: year, area: area.trim(), purpose, conversation_pace: pace, throat_class: throatClass, bio: bio.trim() }) });
      const result = await request('/api/me', token); setProfile(result.profile as Profile); setScreen('complete');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'プロフィールを保存できませんでした。'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    const active = token; setBusy(true);
    try { if (active) await request('/auth/logout', active, { method: 'POST' }); } catch { /* Clear local credentials even if the API is offline. */ }
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setToken(null); setProfile(null); setScreen('welcome'); setBusy(false);
  }

  if (screen === 'loading') return <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingLabel}>準備しています</Text></View>;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {screen !== 'welcome' ? <View style={styles.topline}><View style={styles.brandMark}><Text style={styles.brandMarkText}>喉</Text></View><Text style={styles.brand}>NODOBITO</Text><Text style={styles.toplineRight}>BETA</Text></View> : null}

        {screen === 'welcome' && <>
          <View style={styles.welcomeScreen}>
            <View style={styles.welcomeIdentity}>
              <Text style={styles.welcomeLogo}>のどじまん</Text>
              <Text style={styles.welcomeTagline}>喉仏マッチングアプリ</Text>
            </View>
            <View style={styles.welcomeActions}>
              <Pressable accessibilityRole="button" onPress={() => { setAuthMode('login'); setNotice(''); setScreen('auth'); }} style={({ pressed }) => [styles.welcomeLoginButton, pressed && styles.pressed]}>
                <Text style={styles.welcomeLoginText}>ログイン</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setAuthMode('signup'); setNotice(''); setScreen('auth'); }} style={({ pressed }) => [styles.welcomeSignupButton, pressed && styles.pressed]}>
                <Text style={styles.welcomeSignupText}>新規登録</Text>
              </Pressable>
            </View>
          </View>
        </>}

        {screen === 'auth' && <>
          <View style={styles.formHeading}>
            <Pressable onPress={() => { setNotice(''); setScreen('welcome'); }} style={styles.backButton}><Text style={styles.backButtonText}>← 戻る</Text></Pressable>
            <Text style={styles.kicker}>{authMode === 'signup' ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</Text>
            <Text style={styles.title}>{authMode === 'signup' ? <>アカウントを{'\n'}作成しましょう。</> : 'ログイン'}</Text>
            <Text style={styles.subtitle}>{authMode === 'signup' ? 'メールアドレスとパスワードを登録します。' : '登録したメールアドレスとパスワードを入力してください。'}</Text>
          </View>
          <View style={styles.formCard}>
            <Field label="メールアドレス" required><TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={colors.muted} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!busy} /></Field>
            <Field label="パスワード" required helper={authMode === 'signup' ? '12〜128文字で設定してください。' : undefined}><TextInput value={password} onChangeText={setPassword} placeholder="12文字以上" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry autoCapitalize="none" maxLength={128} editable={!busy} /></Field>
            {authMode === 'signup' ? <Field label="パスワード（確認）" required><TextInput value={passwordConfirmation} onChangeText={setPasswordConfirmation} placeholder="同じパスワードを入力" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry autoCapitalize="none" maxLength={128} editable={!busy} /></Field> : null}
            {notice ? <Notice text={notice} /> : null}
            <Pressable onPress={authenticate} disabled={busy} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{authMode === 'signup' ? 'アカウントを作成する　→' : 'ログインする　→'}</Text>}</Pressable>
            <Pressable disabled={busy} onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setPassword(''); setPasswordConfirmation(''); setNotice(''); }} style={styles.authSwitch}><Text style={styles.authSwitchText}>{authMode === 'signup' ? 'すでにアカウントをお持ちの方はログイン' : 'アカウントをお持ちでない方は新規登録'}</Text></Pressable>
          </View>
        </>}

        {screen === 'profile' && <>
          <View style={styles.formHeading}><Text style={styles.kicker}>YOUR PROFILE · 01</Text><Text style={styles.title}>あなたのことを{ '\n' }教えてください。</Text><Text style={styles.subtitle}>アカウントを作成できました。プロフィールを登録して、出会いの準備をしましょう。</Text></View>
          <View style={styles.formCard}>
            <Field label="ニックネーム" required><TextInput value={name} onChangeText={setName} placeholder="アプリ内で表示する名前" placeholderTextColor={colors.muted} style={styles.input} maxLength={30} /></Field>
            <Field label="生まれた年" required><TextInput value={birthYear} onChangeText={(value) => setBirthYear(value.replace(/\D/g, '').slice(0, 4))} placeholder="例：1998" placeholderTextColor={colors.muted} keyboardType="number-pad" style={styles.input} maxLength={4} /></Field>
            <Field label="居住エリア" required><TextInput value={area} onChangeText={setArea} placeholder="例：東京都 渋谷区" placeholderTextColor={colors.muted} style={styles.input} maxLength={80} /></Field>
            <Field label="喉仏の分類" helper="身体的特徴の分類です。性別の判定ではありません。"><ChoiceRow options={throatOptions.map((option) => ({ value: option.value, label: option.label }))} selected={throatClass} onSelect={(value) => setThroatClass(value as Profile['throat_class'])} /></Field>
            <Field label="出会いの目的"><ChoiceRow options={purposes.map((value) => ({ value, label: value }))} selected={purpose} onSelect={setPurpose} /></Field>
            <Field label="会話のペース"><ChoiceRow options={paces.map((value) => ({ value, label: value }))} selected={pace} onSelect={setPace} /></Field>
            <Field label="ひとこと" helper="あとから編集できます。"><TextInput value={bio} onChangeText={setBio} placeholder="好きなことや、最近気になっていること" placeholderTextColor={colors.muted} style={[styles.input, styles.bioInput]} multiline maxLength={300} textAlignVertical="top" /><Text style={styles.charCount}>{bio.length}/300</Text></Field>
            {notice ? <Notice text={notice} /> : null}
            <Pressable onPress={saveProfile} disabled={busy} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>プロフィールを登録する　→</Text>}</Pressable>
            <Text style={styles.formFootnote}>年齢確認完了後に、マッチング機能をご利用いただけます。</Text>
          </View>
        </>}

        {screen === 'complete' && <View style={styles.completeWrap}>
          <View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View><Text style={styles.kicker}>PROFILE COMPLETE</Text><Text style={styles.completeTitle}>{firstName}さん、{ '\n' }登録できました。</Text>
          <Text style={styles.completeBody}>プロフィールを受け付けました。年齢確認が完了すると、アプリ内で出会いを探せるようになります。</Text>
          <View style={styles.statusCard}><View style={styles.statusDot} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>年齢確認</Text><Text style={styles.statusText}>{profile?.age_verification === 'verified' ? '確認済み' : '運営確認待ち'}</Text></View></View>
          <Pressable onPress={() => setScreen('profile')} style={styles.editButton}><Text style={styles.editButtonText}>プロフィールを編集</Text></Pressable><Pressable onPress={signOut} disabled={busy} style={styles.signOutButton}><Text style={styles.signOutText}>ログアウト</Text></Pressable>
        </View>}

        {screen === 'welcome' && notice ? <View style={styles.welcomeNotice}><Notice text={notice} /></View> : null}
        {screen !== 'welcome' ? <View style={styles.footer}><Text style={styles.footerText}>喉元から、あなたらしい出会いを。</Text><View style={styles.footerLine} /><Text style={styles.footerVersion}>NODOBITO MATCHING · 2026</Text></View> : null}
      </ScrollView>
    </View>
  );
}

function Field({ label, helper, required, children }: { label: string; helper?: string; required?: boolean; children: React.ReactNode }) {
  return <View style={styles.field}><View style={styles.labelRow}><Text style={styles.fieldLabel}>{label}</Text>{required ? <Text style={styles.required}>必須</Text> : null}</View>{helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}{children}</View>;
}
function ChoiceRow({ options, selected, onSelect }: { options: { value: string; label: string }[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.choices}>{options.map((option) => <Pressable key={option.value} onPress={() => onSelect(option.value)} style={[styles.choice, selected === option.value && styles.choiceSelected]}><Text style={[styles.choiceText, selected === option.value && styles.choiceTextSelected]}>{option.label}</Text></Pressable>)}</View>;
}
function Notice({ text }: { text: string }) { return <View style={styles.notice}><Text style={styles.noticeText}>{text}</Text></View>; }
const colors = { bg: '#F7F4EF', ink: '#1D2A25', forest: '#27473C', muted: '#8B918C', line: '#E9E5DE', accent: '#C66E4E', white: '#FFFFFF' };
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg }, page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 24 : 18, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }, loadingLabel: { color: colors.muted, fontSize: 13, letterSpacing: 1 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: colors.white, fontSize: 17, fontWeight: '700' }, brand: { color: colors.ink, fontSize: 11, fontWeight: '800', letterSpacing: 2.2 }, toplineRight: { marginLeft: 'auto', color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  welcomeScreen: { flex: 1, justifyContent: 'center', paddingBottom: 8 }, welcomeIdentity: { alignItems: 'center', marginBottom: 56 }, welcomeLogo: { color: '#8C2D3D', fontSize: 25, fontWeight: '500', marginBottom: 12 }, welcomeTagline: { color: '#38282C', fontSize: 18, fontWeight: '700' }, welcomeActions: { gap: 13 }, welcomeLoginButton: { height: 52, borderRadius: 18, borderWidth: 1, borderColor: '#E6D8CD', backgroundColor: '#FFFCF7', alignItems: 'center', justifyContent: 'center' }, welcomeLoginText: { color: '#8C2D3D', fontSize: 15, fontWeight: '500' }, welcomeSignupButton: { height: 52, borderRadius: 18, backgroundColor: '#8C2D3D', alignItems: 'center', justifyContent: 'center' }, welcomeSignupText: { color: colors.white, fontSize: 15, fontWeight: '700' }, backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12, marginBottom: 14 }, backButtonText: { color: colors.forest, fontSize: 12, fontWeight: '600' }, authSwitch: { alignItems: 'center', paddingTop: 18 }, authSwitchText: { color: colors.forest, fontSize: 11, textAlign: 'center' }, kicker: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2.1, marginBottom: 15 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.55 },
  formHeading: { paddingTop: 36, paddingBottom: 23 }, title: { color: colors.ink, fontSize: 29, fontWeight: '700', lineHeight: 39 }, subtitle: { color: '#78817B', fontSize: 12, lineHeight: 20, marginTop: 12 }, formCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 19 },
  field: { marginBottom: 18 }, labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }, fieldLabel: { color: colors.ink, fontWeight: '700', fontSize: 12 }, required: { color: colors.accent, fontSize: 9, fontWeight: '700' }, fieldHelper: { color: colors.muted, fontSize: 10, marginTop: -2, marginBottom: 8 }, input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, color: colors.ink, fontSize: 13, backgroundColor: '#FCFBF9' }, bioInput: { height: 88, paddingTop: 12 }, charCount: { color: '#A1A49F', textAlign: 'right', fontSize: 10, marginTop: 5 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7F4', borderWidth: 1, borderColor: colors.line }, choiceSelected: { backgroundColor: '#E6EEE9', borderColor: '#6C8B7C' }, choiceText: { fontSize: 11, color: '#717A74' }, choiceTextSelected: { color: colors.forest, fontWeight: '700' },
  primaryButton: { minHeight: 54, borderRadius: 12, backgroundColor: colors.forest, justifyContent: 'center', alignItems: 'center', marginTop: 3 }, primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 }, formFootnote: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 13 },
  notice: { borderRadius: 10, backgroundColor: '#FFF2ED', borderWidth: 1, borderColor: '#F4D6C9', padding: 12, marginBottom: 13 }, noticeText: { color: '#8F4B34', fontSize: 11, lineHeight: 17 }, welcomeNotice: { marginTop: 12 },
  completeWrap: { flex: 1, alignItems: 'center', paddingTop: 88 }, successIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E4EEE8', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }, successIconText: { color: colors.forest, fontSize: 28, fontWeight: '500' }, completeTitle: { color: colors.ink, textAlign: 'center', fontSize: 29, lineHeight: 42, fontWeight: '700' }, completeBody: { color: '#78817B', textAlign: 'center', fontSize: 13, lineHeight: 22, marginTop: 14, maxWidth: 340 },
  statusCard: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 16, marginTop: 30, gap: 12 }, statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E4A066' }, statusCopy: { flex: 1 }, statusTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, statusText: { color: colors.muted, fontSize: 11, marginTop: 3 }, editButton: { alignSelf: 'stretch', minHeight: 48, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line, marginTop: 14 }, editButtonText: { color: colors.forest, fontSize: 12, fontWeight: '700' }, signOutButton: { padding: 15 }, signOutText: { color: colors.muted, fontSize: 11 },
  footer: { paddingTop: 30, alignItems: 'center', marginTop: 'auto' }, footerText: { color: '#7F8981', fontSize: 10, letterSpacing: 0.6 }, footerLine: { height: 1, width: 32, backgroundColor: '#D9D3C9', marginVertical: 11 }, footerVersion: { color: '#B0B0A9', fontSize: 8, letterSpacing: 1.5 },
});
