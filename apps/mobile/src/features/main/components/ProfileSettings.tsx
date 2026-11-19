import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as SecureStore from 'expo-secure-store';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../../auth/api/client';
import { useAuth } from '../../auth/context/AuthContext';
import { useMainApi, type MatchRow } from '../api/client';
import { colors, spacing } from '../../../theme/tokens';
import { RequestState } from './RequestState';
import { MatchSelectorRow } from './MatchSelectorRow';

export type SettingKind = 'visibility' | 'calendar' | 'location' | 'report' | 'hidePeople' | 'accountDelete';
type Plan = { id: string; startsAt: string | null; placeLabel: string | null; revision: number; exactLocation: string | null; status: string; confirmed: { you: boolean; other: boolean }; arrived: { you: string | null; other: string | null } };
type LocationRange = 'same_prefecture' | 'same_region' | 'anywhere';
const titles: Record<SettingKind, string> = { visibility: '公開範囲', calendar: '待ち合わせ予定', location: 'マッチング範囲', report: '通報・ブロック', hidePeople: '知り合いを非表示', accountDelete: 'アカウント削除' };
const locationRangeOptions: { value: LocationRange; label: string }[] = [
  { value: 'same_prefecture', label: '同じ都道府県' },
  { value: 'same_region', label: '同じ地方' },
  { value: 'anywhere', label: 'どこでもOK' },
];

function Button({ label, onPress, disabled, centered = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; centered?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={({ pressed }) => [styles.button, centered && styles.centeredButton, primary && styles.primaryButton, disabled && { opacity: 0.4 }, pressed && primary && styles.primaryButtonPressed]}><Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, password, numeric = false, boldLabel = false }: { label: string; value: string; onChange: (value: string) => void; password?: boolean; numeric?: boolean; boldLabel?: boolean }) {
  return <View style={{ gap: 6 }}><Text style={[styles.text, boldLabel && styles.fieldLabelBold]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={input => onChange(numeric ? input.replace(/\D/g, '').slice(0, 3) : input)} secureTextEntry={password} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" maxLength={password ? 128 : numeric ? 3 : 1000} style={styles.field} /></View>;
}
export function ProfileSettings({ kind }: { kind: SettingKind }) {
  return (
    <SettingsContent key={kind} kind={kind} />
  );
}
function SettingsContent({ kind }: { kind: SettingKind }) {
  const { token, profile, refreshProfile, logOut } = useAuth();
  const api = useMainApi();
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState(profile?.location_scope ?? 'hidden');
  const [throat, setThroat] = useState(profile?.throat_class ?? 'pending');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [pace, setPace] = useState(profile?.conversation_pace ?? 'balanced');
  const [minAge, setMinAge] = useState('18'), [maxAge, setMaxAge] = useState('120');
  const [locationRange, setLocationRange] = useState<LocationRange | null>(null);
  const [contacts, setContacts] = useState(''), [password, setPassword] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState('');
  const [blocks, setBlocks] = useState<{ user_id: string; display_name: string }[]>([]);
  const [details, setDetails] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [startsAt, setStartsAt] = useState(''), [place, setPlace] = useState(''), [exactLocation, setExactLocation] = useState('');
  const [hiddenEmails, setHiddenEmails] = useState<string[]>([]);
  const [hiddenEmailsLoaded, setHiddenEmailsLoaded] = useState(false);
  const [hiddenContactCount, setHiddenContactCount] = useState(0);
  const contactEntries = [...new Set(contacts.split(/[\n,、]+/).map(value => value.trim().toLowerCase()).filter(Boolean))];
  const hiddenEmailsStorageKey = profile?.user_id ? `nodobito.hiddenContacts.${profile.user_id}` : null;
  const request = useCallback(<T extends object>(path: string, method = 'GET', body?: object, signal?: AbortSignal) => apiRequest<T>(path, token ?? undefined, { method, signal, body: body ? JSON.stringify(body) : undefined }), [token]);
  const loadHiddenEmails = useCallback(async () => {
    if (!hiddenEmailsStorageKey) return [];
    const stored = await SecureStore.getItemAsync(hiddenEmailsStorageKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string')) {
      throw new Error('非表示メール一覧を読み込めませんでした。');
    }
    return [...new Set(parsed.map(value => value.trim().toLowerCase()).filter(Boolean))];
  }, [hiddenEmailsStorageKey]);
  const saveHiddenEmails = async (emails: string[]) => {
    if (!hiddenEmailsStorageKey) throw new Error('ログイン情報を確認できません。');
    await SecureStore.setItemAsync(hiddenEmailsStorageKey, JSON.stringify(emails));
    setHiddenEmails(emails);
  };
  const load = useCallback(async (signal?: AbortSignal) => {
    const result: { preferences?: { minAge: number; maxAge: number; locationRange: LocationRange | null }; matches?: MatchRow[]; blocks?: { user_id: string; display_name: string }[]; hiddenContactCount?: number } = {};
    if (kind === 'location') result.preferences = (await request<{ preferences: NonNullable<typeof result.preferences> }>('/api/preferences/discovery', 'GET', undefined, signal)).preferences;
    if (kind === 'report' || kind === 'calendar') result.matches = (await api.matches(signal)).matches;
    if (kind === 'report') result.blocks = (await request<{ blocks: NonNullable<typeof result.blocks> }>('/api/blocks', 'GET', undefined, signal)).blocks;
    if (kind === 'hidePeople') result.hiddenContactCount = (await request<{ count: number }>('/api/contacts/hide', 'GET', undefined, signal)).count;
    return result;
  }, [api, kind, request]);
  const apply = useCallback((result: Awaited<ReturnType<typeof load>>) => {
    if (result.preferences) { setMinAge(String(result.preferences.minAge)); setMaxAge(String(result.preferences.maxAge)); setLocationRange(result.preferences.locationRange); }
    if (result.matches) setMatches(result.matches);
    if (result.blocks) setBlocks(result.blocks);
    if (result.hiddenContactCount !== undefined) setHiddenContactCount(result.hiddenContactCount);
  }, []);
  const reload = async () => apply(await load());
  const reloadHiddenEmails = async () => {
    await reload();
    if (kind === 'hidePeople') {
      setHiddenEmails(await loadHiddenEmails());
      setHiddenEmailsLoaded(true);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(result => { if (!controller.signal.aborted) apply(result); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '読み込みに失敗しました。'); });
    return () => controller.abort();
  }, [load, apply]);
  useEffect(() => {
    if (kind !== 'hidePeople') return;
    let active = true;
    void loadHiddenEmails()
      .then(emails => { if (active) setHiddenEmails(emails); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : '非表示メール一覧を読み込めませんでした。'); })
      .finally(() => { if (active) setHiddenEmailsLoaded(true); });
    return () => { active = false; };
  }, [kind, loadHiddenEmails]);
  const run = async (action: () => Promise<void>, success?: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); if (success) Alert.alert(success); }
    catch (e) { setError(e instanceof Error ? e.message : '処理に失敗しました。'); }
    finally { lock.current = false; setBusy(false); }
  };
  const loadPlans = async (matchId: string) => {
    const result = await request<{ plans: { id: string }[] }>(`/api/matches/${matchId}/date-plans`);
    setPlans(await Promise.all(result.plans.map(p => request<Plan>(`/api/date-plans/${p.id}`))));
  };
  const choose = (id: string) => {
    if (kind === 'calendar') void run(async () => { await loadPlans(id); setSelected(id); });
    else setSelected(id);
  };
  const filteredMatches = matches.filter(match => match.display_name.toLocaleLowerCase().includes(matchSearch.trim().toLocaleLowerCase()));
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="マイページに戻る"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={25} color={colors.mutedText} />
      </Pressable>
      <Text style={styles.title}>{titles[kind]}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <RequestState loading={busy} error={error || undefined} onRetry={() => void run(reloadHiddenEmails)} />
    {kind === 'visibility' ? <>
      <Text style={styles.text}>居住地域の表示</Text>
      <Button label={scope === 'area' ? '地域を表示：ON' : '地域を表示：OFF'} disabled={busy} onPress={() => setScope(scope === 'area' ? 'hidden' : 'area')} />
      <Text style={styles.text}>喉仏の分類（自己申告）</Text>
      {(['present', 'absent', 'pending'] as const).map((value, index) => <Button key={value} label={`${throat === value ? '✓ ' : ''}${['喉仏あり', '喉仏なし', '未分類'][index]}`} onPress={() => setThroat(value)} />)}
      <Field label="自己紹介（300文字まで）" value={bio} onChange={setBio} />
      <Field label="会話ペース" value={pace} onChange={setPace} />
      <Text style={styles.text}>写真の段階公開は、相手プロフィール画面で相手ごとに同意・取り消しできます。</Text>
      <Button label="保存" centered primary disabled={busy} onPress={() => void run(async () => { await request('/api/profile', 'PATCH', { location_scope: scope, throat_class: throat, bio, conversation_pace: pace }); await refreshProfile(); }, '保存しました')} />
    </> : null}
    {kind === 'location' ? <>
      <Field label="最低年齢" value={minAge} onChange={setMinAge} numeric boldLabel />
      <Field label="最高年齢" value={maxAge} onChange={setMaxAge} numeric boldLabel />
      <View style={styles.locationRangeSection}>
        <Text style={styles.sectionTitle}>地域</Text>
        {locationRangeOptions.map(option => {
          const checked = locationRange === option.value;
          return <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked, disabled: busy }}
            disabled={busy}
            onPress={() => { setLocationRange(option.value); setError(''); }}
            style={({ pressed }) => [styles.locationRangeOption, checked && styles.locationRangeOptionSelected, pressed && styles.pressed]}
          >
            <View style={[styles.radioOuter, checked && styles.radioOuterSelected]}>
              {checked ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.locationRangeLabel}>{option.label}</Text>
          </Pressable>;
        })}
        {locationRange !== null ? <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { setLocationRange(null); setError(''); }}
          style={({ pressed }) => [styles.clearLocationRange, pressed && styles.pressed]}
        ><Text style={styles.linkText}>設定を解除</Text></Pressable> : null}
      </View>
      {!profile?.prefecture_code ? <>
        <Text style={styles.text}>同じ都道府県・同じ地方で探すには、プロフィールから都道府県の設定をしてください。<Text accessibilityRole="link" onPress={() => router.push('/sign-up')} style={styles.linkText}>設定する</Text></Text>
      </> : null}
      <Button label="保存" centered primary disabled={busy} onPress={() => void run(async () => { await request('/api/preferences/discovery', 'PATCH', { minAge: Number(minAge), maxAge: Number(maxAge), locationRange }); }, '検索条件を保存しました')} />
    </> : null}
    {kind === 'hidePeople' ? <>
      <Text style={styles.text}>知り合いの登録メールアドレスを入力すると、お互いの「探す」に表示されなくなります。相手が後から同じメールで登録した場合も適用されます。トークやメッセージを止めるブロックとは別の機能です。入力したメールはサーバーで照合用の値に変換して保存し、この端末にも安全に保存します。</Text>
      <Field label="非表示にするメールアドレス" value={contacts} onChange={setContacts} />
      <Button label="非表示に追加" centered primary={!busy && hiddenEmailsLoaded && contactEntries.length > 0} disabled={busy || !hiddenEmailsLoaded || !contactEntries.length} onPress={() => void run(async () => {
        const nextEmails = [...new Set([...hiddenEmails, ...contactEntries])];
        await request('/api/contacts/hide', 'POST', { contacts: contactEntries });
        await saveHiddenEmails(nextEmails);
        const result = await request<{ count: number }>('/api/contacts/hide');
        setHiddenContactCount(result.count);
        setContacts('');
      }, '追加しました')} />
      <View style={styles.hiddenEmailsSection}>
        <Text style={styles.sectionTitle}>非表示にしているメールアドレス</Text>
        {!hiddenEmailsLoaded ? <Text style={styles.text}>読み込み中…</Text> : null}
        {hiddenEmailsLoaded && hiddenEmails.length ? hiddenEmails.map(email => (
          <View key={email} style={styles.hiddenEmailRow}>
            <Text style={styles.hiddenEmail}>{email}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${email}の非表示設定を解除`}
              disabled={busy}
              onPress={() => void run(async () => {
                const result = await request<{ removed: boolean }>('/api/contacts/hide/entry', 'DELETE', { contact: email });
                await saveHiddenEmails(hiddenEmails.filter(value => value !== email));
                if (result.removed) setHiddenContactCount(count => Math.max(0, count - 1));
              })}
              style={({ pressed }) => [styles.removeEmailButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.removeEmailLabel}>解除</Text>
            </Pressable>
          </View>
        )) : null}
        {hiddenEmailsLoaded && !hiddenEmails.length ? (
          <Text style={styles.text}>非表示にしているメールアドレスはありません。</Text>
        ) : null}
      </View>
      {hiddenContactCount > 0 ? <Button label="非表示設定をすべて解除" centered disabled={busy} onPress={() => Alert.alert('設定の解除', '登録した非表示設定をすべて解除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '解除', onPress: () => void run(async () => {
        await request('/api/contacts/hide', 'DELETE');
        if (hiddenEmailsStorageKey) await SecureStore.deleteItemAsync(hiddenEmailsStorageKey);
        setHiddenEmails([]);
        setHiddenContactCount(0);
      }, '解除しました') }])} />
      : null}
    </> : null}
    {kind === 'report' || kind === 'calendar' ? <>
      <Text style={styles.text}>相手を選択</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color={colors.mutedText} />
        <TextInput
          accessibilityLabel="相手を検索"
          value={matchSearch}
          onChangeText={setMatchSearch}
          placeholder="検索"
          placeholderTextColor={colors.mutedText}
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>
      {filteredMatches.map(match => (
        <MatchSelectorRow
          key={match.id}
          match={match}
          selected={match.id === selected}
          onPress={() => choose(match.id)}
        />
      ))}
      {!matches.length ? <Text style={styles.text}>マッチしている相手はいません。</Text> : null}
      {matches.length > 0 && !filteredMatches.length ? <Text style={styles.text}>該当する相手がいません。</Text> : null}
    </> : null}
    {kind === 'report' ? <>
      <Field label="通報理由・詳細" value={details} onChange={setDetails} />
      <Button label="通報" centered disabled={busy || !selected || !details.trim()} onPress={() => void run(async () => { const user = matches.find(m => m.id === selected)!; await request('/api/reports', 'POST', { subjectId: user.user_id, category: 'other', details }); setDetails(''); }, '通報を受け付けました')} />
      <Button label="ブロック" centered primary={!busy && !!selected} disabled={busy || !selected} onPress={() => Alert.alert('ブロック', 'マッチが解除され、会話できなくなります。ブロックしますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: 'ブロック', style: 'destructive', onPress: () => void run(async () => { const user = matches.find(m => m.id === selected)!; await request('/api/blocks', 'POST', { userId: user.user_id }); setSelected(null); await reload(); }, 'ブロックしました') }])} />
      <View style={styles.hiddenEmailsSection}>
        <Text style={styles.sectionTitle}>ブロック中</Text>
        {!blocks.length ? <Text style={styles.text}>ブロック中のユーザーはいません。</Text> : null}
        {blocks.map(b => <Button key={b.user_id} label={`${b.display_name}：ブロック解除`} disabled={busy} onPress={() => void run(async () => { await request(`/api/blocks/${b.user_id}`, 'DELETE'); await reload(); })} />)}
      </View>
    </> : null}
    {kind === 'calendar' && selected ? <>
      <Text style={styles.text}>この予定はマッチ相手との間で共有します。第三者への共有リンクはありません。</Text>
      {plans.map(plan => <View key={plan.id} style={styles.plan}>
        <Text style={styles.text}>{plan.startsAt ? new Date(plan.startsAt).toLocaleString('ja-JP') : '日時非公開'} / {plan.placeLabel ?? '場所非公開'}</Text>
        <Text style={styles.text}>{plan.status === 'cancelled' ? 'キャンセル済み' : plan.status === 'expired' ? '期限切れ' : `自分：${plan.confirmed.you ? '確認済み' : '未確認'} / 相手：${plan.confirmed.other ? '確認済み' : '未確認'}`}</Text>
        {plan.exactLocation ? <Text style={styles.text}>{plan.exactLocation}</Text> : null}
        <Text style={styles.text}>到着：自分 {plan.arrived.you ? '済み' : '未'} / 相手 {plan.arrived.other ? '済み' : '未'}</Text>
        {!['cancelled', 'expired'].includes(plan.status) ? <>
          <Button label="予定を確認（詳細な場所の共有に同意）" disabled={busy} onPress={() => void run(async () => { await request(`/api/date-plans/${plan.id}/confirm`, 'POST', { scope: { schedule: true, area: true, arrival: true, exactLocation: true }, revision: plan.revision }); await loadPlans(selected); })} />
          <Button label="到着を報告" disabled={busy || !plan.confirmed.you || !plan.confirmed.other} onPress={() => void run(async () => { await request(`/api/date-plans/${plan.id}/arrive`, 'POST', {}); await loadPlans(selected); })} />
          <Button label="予定をキャンセル" disabled={busy} onPress={() => Alert.alert('予定のキャンセル', 'この予定をキャンセルしますか？', [{ text: '戻る', style: 'cancel' }, { text: 'キャンセルする', onPress: () => void run(async () => { await request(`/api/date-plans/${plan.id}/cancel`, 'POST', {}); await loadPlans(selected); }) }])} />
        </> : null}
      </View>)}
      <Field label="日時（例：2026-11-20T18:00:00+09:00）" value={startsAt} onChange={setStartsAt} />
      <Field label="待ち合わせ場所" value={place} onChange={setPlace} />
      <Field label="詳細な場所（双方の確認と同意後に表示）" value={exactLocation} onChange={setExactLocation} />
      <Button label="予定を登録（場所の共有に同意）" disabled={busy || !startsAt.trim() || !place.trim()} onPress={() => void run(async () => { await request(`/api/matches/${selected}/date-plans`, 'POST', { startsAt, placeLabel: place, exactLocation, shareConsent: true }); setStartsAt(''); setPlace(''); setExactLocation(''); await loadPlans(selected); }, '予定を登録しました')} />
    </> : null}
    {kind === 'accountDelete' ? <>
      <Field label="確認のためパスワードを入力してください。" value={password} onChange={setPassword} password />
      <Button label="アカウントを削除する" disabled={busy || !password.trim()} centered primary={!busy && !!password.trim()} onPress={() => Alert.alert('アカウントの削除', 'アカウントと写真・会話などを削除します。この操作は取り消せません。', [{ text: 'キャンセル', style: 'cancel' }, { text: '退会する', style: 'destructive', onPress: () => void run(async () => { await request('/api/account/delete', 'POST', { password }); await logOut().catch(() => undefined); router.replace('/'); }) }])} />
    </> : null}
  </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: spacing.md },
  backButton: { width: 36, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 21, fontWeight: '700', color: colors.text }, text: { color: colors.text, lineHeight: 22 },
  fieldLabelBold: { fontWeight: '700' },
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, backgroundColor: colors.surface, color: colors.text },
  button: { minHeight: 48, padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12 },
  centeredButton: { alignItems: 'center', justifyContent: 'center' },
  primaryButton: { borderColor: colors.primary, backgroundColor: colors.primary },
  primaryButtonPressed: { opacity: 0.82 },
  primaryButtonText: { color: colors.white },
  buttonText: { color: colors.primary, fontWeight: '600' }, plan: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  hiddenEmailsSection: { gap: spacing.xs, marginTop: spacing.sm },
  searchBox: { height: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, height: '100%', color: colors.text, fontSize: 13, paddingVertical: 0 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  hiddenEmailRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  hiddenEmail: { flex: 1, color: colors.text, fontSize: 14 },
  removeEmailButton: { minWidth: 52, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  removeEmailLabel: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  locationRangeSection: { gap: spacing.sm },
  locationRangeOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  locationRangeOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radioOuter: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.mutedText, borderRadius: 11, backgroundColor: colors.surface },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  locationRangeLabel: { color: colors.text, fontSize: 15 },
  clearLocationRange: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  disabled: { opacity: 0.4 },
});
