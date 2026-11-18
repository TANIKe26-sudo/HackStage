import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../../auth/api/client';
import { useAuth } from '../../auth/context/AuthContext';
import { useMainApi, type MatchRow } from '../api/client';
import { colors, spacing } from '../../../theme/tokens';
import { RequestState } from './RequestState';

export type SettingKind = 'visibility' | 'calendar' | 'location' | 'report' | 'data' | 'hidePeople';
type Plan = { id: string; startsAt: string | null; placeLabel: string | null; revision: number; exactLocation: string | null; status: string; confirmed: { you: boolean; other: boolean }; arrived: { you: string | null; other: string | null } };
const titles: Record<SettingKind, string> = { visibility: '公開範囲', calendar: '待ち合わせ予定', location: 'マッチング範囲', report: '通報・ブロック', data: 'データ管理・削除', hidePeople: '知り合いを非表示' };
function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, password }: { label: string; value: string; onChange: (value: string) => void; password?: boolean }) {
  return <View style={{ gap: 6 }}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry={password} autoCapitalize="none" maxLength={password ? 128 : 1000} style={styles.field} /></View>;
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
  const [minAge, setMinAge] = useState('18'), [maxAge, setMaxAge] = useState('120'), [area, setArea] = useState('');
  const [contacts, setContacts] = useState(''), [password, setPassword] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<{ user_id: string; display_name: string }[]>([]);
  const [details, setDetails] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [startsAt, setStartsAt] = useState(''), [place, setPlace] = useState(''), [exactLocation, setExactLocation] = useState('');
  const request = useCallback(<T extends object>(path: string, method = 'GET', body?: object, signal?: AbortSignal) => apiRequest<T>(path, token ?? undefined, { method, signal, body: body ? JSON.stringify(body) : undefined }), [token]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const result: { preferences?: { minAge: number; maxAge: number; area: string }; matches?: MatchRow[]; blocks?: { user_id: string; display_name: string }[] } = {};
    if (kind === 'location') result.preferences = (await request<{ preferences: NonNullable<typeof result.preferences> }>('/api/preferences/discovery', 'GET', undefined, signal)).preferences;
    if (kind === 'report' || kind === 'calendar' || kind === 'data') result.matches = (await api.matches(signal)).matches;
    if (kind === 'report') result.blocks = (await request<{ blocks: NonNullable<typeof result.blocks> }>('/api/blocks', 'GET', undefined, signal)).blocks;
    return result;
  }, [api, kind, request]);
  const apply = useCallback((result: Awaited<ReturnType<typeof load>>) => {
    if (result.preferences) { setMinAge(String(result.preferences.minAge)); setMaxAge(String(result.preferences.maxAge)); setArea(result.preferences.area); }
    if (result.matches) setMatches(result.matches);
    if (result.blocks) setBlocks(result.blocks);
  }, []);
  const reload = async () => apply(await load());
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(result => { if (!controller.signal.aborted) apply(result); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '読み込みに失敗しました。'); });
    return () => controller.abort();
  }, [load, apply]);
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
  const clearMessages = () => {
    if (!selected) return;
    Alert.alert('会話履歴の削除', 'この会話は双方から見えなくなります。削除しますか？', [
      { text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => void run(async () => { await request(`/api/matches/${selected}/messages`, 'DELETE'); }, '会話履歴を削除しました') },
    ]);
  };
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="マイページに戻る"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={25} color={colors.text} />
      </Pressable>
      <Text style={styles.title}>{titles[kind]}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <RequestState loading={busy} error={error || undefined} onRetry={() => void run(reload)} />
    {kind === 'visibility' ? <>
      <Text style={styles.text}>居住地域の表示</Text>
      <Button label={scope === 'area' ? '地域を表示：ON' : '地域を表示：OFF'} disabled={busy} onPress={() => setScope(scope === 'area' ? 'hidden' : 'area')} />
      <Text style={styles.text}>喉仏の分類（自己申告）</Text>
      {(['present', 'absent', 'pending'] as const).map((value, index) => <Button key={value} label={`${throat === value ? '✓ ' : ''}${['喉仏あり', '喉仏なし', '未分類'][index]}`} onPress={() => setThroat(value)} />)}
      <Field label="自己紹介（300文字まで）" value={bio} onChange={setBio} />
      <Field label="会話ペース" value={pace} onChange={setPace} />
      <Text style={styles.text}>写真の段階公開は、相手プロフィール画面で相手ごとに同意・取り消しできます。</Text>
      <Button label="保存" disabled={busy} onPress={() => void run(async () => { await request('/api/profile', 'PATCH', { location_scope: scope, throat_class: throat, bio, conversation_pace: pace }); await refreshProfile(); }, '保存しました')} />
    </> : null}
    {kind === 'location' ? <>
      <Field label="最低年齢" value={minAge} onChange={setMinAge} />
      <Field label="最高年齢" value={maxAge} onChange={setMaxAge} />
      <Field label="地域（完全一致・空欄は指定なし）" value={area} onChange={setArea} />
      <Text style={styles.text}>地域を非公開にしている相手は、地域指定時の候補には含まれません。</Text>
      <Button label="保存" disabled={busy} onPress={() => void run(async () => { await request('/api/preferences/discovery', 'PATCH', { minAge: Number(minAge), maxAge: Number(maxAge), area }); }, '検索条件を保存しました')} />
    </> : null}
    {kind === 'hidePeople' ? <>
      <Text style={styles.text}>知り合いの登録メールアドレスを改行またはカンマで入力してください。照合用の値を保存し、紹介候補から除外します。端末の連絡先権限は使いません。</Text>
      <Field label="非表示にするメールアドレス" value={contacts} onChange={setContacts} />
      <Button label="非表示に追加" disabled={busy || !contacts.trim()} onPress={() => void run(async () => { await request('/api/contacts/hide', 'POST', { contacts: contacts.split(/[\n,、]+/).map(v => v.trim()).filter(Boolean) }); setContacts(''); }, '追加しました')} />
      <Button label="非表示設定をすべて解除" disabled={busy} onPress={() => Alert.alert('設定の解除', '登録した非表示設定をすべて解除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '解除', onPress: () => void run(async () => { await request('/api/contacts/hide', 'DELETE'); }, '解除しました') }])} />
    </> : null}
    {kind === 'report' || kind === 'calendar' || kind === 'data' ? <>
      <Text style={styles.text}>相手を選択</Text>
      {matches.map(m => <Button key={m.id} label={`${m.id === selected ? '✓ ' : ''}${m.display_name}`} disabled={busy} onPress={() => choose(m.id)} />)}
      {!matches.length ? <Text style={styles.text}>マッチしている相手はいません。</Text> : null}
    </> : null}
    {kind === 'report' ? <>
      <Field label="通報理由・詳細" value={details} onChange={setDetails} />
      <Button label="選択した相手を通報" disabled={busy || !selected || !details.trim()} onPress={() => void run(async () => { const user = matches.find(m => m.id === selected)!; await request('/api/reports', 'POST', { subjectId: user.user_id, category: 'other', details }); setDetails(''); }, '通報を受け付けました')} />
      <Button label="選択した相手をブロック" disabled={busy || !selected} onPress={() => Alert.alert('ブロック', 'マッチが解除され、会話できなくなります。ブロックしますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: 'ブロック', style: 'destructive', onPress: () => void run(async () => { const user = matches.find(m => m.id === selected)!; await request('/api/blocks', 'POST', { userId: user.user_id }); setSelected(null); await reload(); }, 'ブロックしました') }])} />
      <Text style={styles.text}>ブロック中</Text>
      {blocks.map(b => <Button key={b.user_id} label={`${b.display_name}：ブロック解除`} disabled={busy} onPress={() => void run(async () => { await request(`/api/blocks/${b.user_id}`, 'DELETE'); await reload(); })} />)}
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
    {kind === 'data' ? <>
      <Button label="選択した会話の履歴を削除" disabled={busy || !selected} onPress={clearMessages} />
      <Button label="現在のプロフィール写真を削除" disabled={busy || !profile?.profile_photo_capture_id} onPress={() => Alert.alert('写真の削除', '現在の写真を削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => void run(async () => { await request(`/api/captures/${profile!.profile_photo_capture_id}`, 'DELETE'); await refreshProfile(); }, '写真を削除しました') }])} />
      <Field label="退会確認用パスワード" value={password} onChange={setPassword} password />
      <Button label="アカウントを削除して退会" disabled={busy || !password} onPress={() => Alert.alert('アカウントの削除', 'アカウントと写真・会話などを削除します。この操作は取り消せません。', [{ text: 'キャンセル', style: 'cancel' }, { text: '退会する', style: 'destructive', onPress: () => void run(async () => { await request('/api/account/delete', 'POST', { password }); await logOut().catch(() => undefined); router.replace('/'); }) }])} />
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
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, backgroundColor: colors.surface, color: colors.text },
  button: { padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12 },
  buttonText: { color: colors.primary, fontWeight: '600' }, plan: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
});
