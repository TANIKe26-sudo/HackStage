import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as SecureStore from 'expo-secure-store';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiRequest } from '../../auth/api/client';
import { useAuth } from '../../auth/context/AuthContext';
import { useMainApi, type MatchRow } from '../api/client';
import { colors, spacing } from '../../../theme/tokens';
import { RequestState } from './RequestState';
import { MatchSelectorRow } from './MatchSelectorRow';
import { DatePickerField } from './DatePickerField';
import { HobbyGenreGrid } from './HobbyGenreGrid';
import { AGE_RANGE_THUMB_RADIUS, AgeRangeSlider, MAX_SELECTABLE_AGE } from './AgeRangeSlider';
import type { HobbyGenreId } from '../data/hobbyGenres';
import { KeyboardAwareScrollView, KeyboardAwareTextInput } from '../../../components/KeyboardAwareScrollView';

export type SettingKind = 'visibility' | 'calendar' | 'location' | 'hobbies' | 'report' | 'hidePeople' | 'accountDelete';
type Plan = { id: string; startsAt: string | null; placeLabel: string | null; revision: number; exactLocation: string | null; status: string; confirmed: { you: boolean; other: boolean }; arrived: { you: string | null; other: string | null } };
type LocationRange = 'same_prefecture' | 'same_region' | 'anywhere';
const titles: Record<SettingKind, string> = { visibility: '公開範囲', calendar: '待ち合わせ予定', location: 'マッチング範囲', hobbies: '趣味を設定', report: '通報・ブロック', hidePeople: '知り合いを非表示', accountDelete: 'アカウント削除' };
const locationRangeOptions: { value: LocationRange; label: string }[] = [
  { value: 'same_prefecture', label: '同じ都道府県' },
  { value: 'same_region', label: '同じ地方' },
  { value: 'anywhere', label: 'どこでもOK' },
];

function toStartsAt(date: Date | null, time: string) {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(time.trim());
  if (!date || !match) return '';
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(match[1]), Number(match[2])).toISOString();
}

function normalizeTimeInput(value: string) {
  let digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 1 && Number(digits) > 2) digits = `0${digits}`;
  if (digits.length >= 2 && Number(digits.slice(0, 2)) > 23) return null;
  if (digits.length >= 3 && Number(digits[2]) > 5) return null;
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function Button({ label, onPress, disabled, centered = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; centered?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={({ pressed }) => [styles.button, centered && styles.centeredButton, primary && styles.primaryButton, disabled && { opacity: 0.4 }, pressed && primary && styles.primaryButtonPressed]}><Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, password, numeric = false, email = false, boldLabel = false, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; password?: boolean; numeric?: boolean; email?: boolean; boldLabel?: boolean; placeholder?: string }) {
  return <View style={{ gap: 6 }}><Text style={[styles.text, boldLabel && styles.fieldLabelBold]}>{label}</Text><KeyboardAwareTextInput accessibilityLabel={label} value={value} onChangeText={input => onChange(numeric ? input.replace(/\D/g, '').slice(0, 3) : input)} secureTextEntry={password} keyboardType={email ? 'email-address' : numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} maxLength={password ? 128 : numeric ? 3 : 1000} placeholder={placeholder} placeholderTextColor={colors.mutedText} style={styles.field} /></View>;
}
export function ProfileSettings({ kind, onAgeRangeDraggingChange }: { kind: SettingKind; onAgeRangeDraggingChange: (isDragging: boolean) => void }) {
  return (
    <SettingsContent key={kind} kind={kind} onAgeRangeDraggingChange={onAgeRangeDraggingChange} />
  );
}
function SettingsContent({ kind, onAgeRangeDraggingChange }: { kind: SettingKind; onAgeRangeDraggingChange: (isDragging: boolean) => void }) {
  const { token, profile, refreshProfile, logOut } = useAuth();
  const api = useMainApi();
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [showBusyIndicator, setShowBusyIndicator] = useState(true);
  const [error, setError] = useState('');
  const [isAgeRangeDragging, setIsAgeRangeDragging] = useState(false);
  const [scope, setScope] = useState(profile?.location_scope ?? 'hidden');
  const [throat, setThroat] = useState(profile?.throat_class ?? 'pending');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [pace, setPace] = useState(profile?.conversation_pace ?? 'balanced');
  const [minAge, setMinAge] = useState(18), [maxAge, setMaxAge] = useState(MAX_SELECTABLE_AGE);
  const [locationRange, setLocationRange] = useState<LocationRange | null>(null);
  const [ownHobbies, setOwnHobbies] = useState<string[]>([]);
  const [contacts, setContacts] = useState(''), [password, setPassword] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState('');
  const [blocks, setBlocks] = useState<{ user_id: string; display_name: string }[]>([]);
  const [removingBlockedUserId, setRemovingBlockedUserId] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [activeSafetyAction, setActiveSafetyAction] = useState<'report' | 'block' | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const planLoadSequence = useRef(0);
  const [meetingDate, setMeetingDate] = useState<Date | null>(null), [meetingTime, setMeetingTime] = useState('');
  const [place, setPlace] = useState('');
  const startsAt = toStartsAt(meetingDate, meetingTime);
  const [hiddenEmails, setHiddenEmails] = useState<string[]>([]);
  const [hiddenEmailsLoaded, setHiddenEmailsLoaded] = useState(false);
  const [hiddenContactCount, setHiddenContactCount] = useState(0);
  const [removingHiddenEmail, setRemovingHiddenEmail] = useState<string | null>(null);
  const [hiddenPeopleAction, setHiddenPeopleAction] = useState<'add' | 'removeOne' | 'removeAll' | null>(null);
  const contactEntries = [...new Set(contacts.split(/[\n,、]+/).map(value => value.trim().toLowerCase()).filter(Boolean))];
  const validContactEntries = contactEntries.length > 0 && contactEntries.every(email => email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const hiddenEmailsStorageKey = profile?.user_id ? `nodobito.hiddenContacts.${profile.user_id}` : null;
  const request = useCallback(<T extends object>(path: string, method = 'GET', body?: object, signal?: AbortSignal) => apiRequest<T>(path, token ?? undefined, { method, signal, body: body ? JSON.stringify(body) : undefined }), [token]);
  const updateAgeRange = useCallback(({ minAge: nextMinAge, maxAge: nextMaxAge }: { minAge: number; maxAge: number }) => {
    setMinAge(nextMinAge);
    setMaxAge(nextMaxAge);
  }, []);
  const handleAgeRangeDraggingChange = useCallback((isDragging: boolean) => {
    setIsAgeRangeDragging(isDragging);
    onAgeRangeDraggingChange(isDragging);
  }, [onAgeRangeDraggingChange]);
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
    const result: { preferences?: { minAge: number; maxAge: number; locationRange: LocationRange | null }; hobbies?: string[]; matches?: MatchRow[]; blocks?: { user_id: string; display_name: string }[]; hiddenContactCount?: number } = {};
    if (kind === 'location') result.preferences = (await request<{ preferences: NonNullable<typeof result.preferences> }>('/api/preferences/discovery', 'GET', undefined, signal)).preferences;
    if (kind === 'hobbies') result.hobbies = (await api.ownHobbies(signal)).hobbies;
    if (kind === 'report' || kind === 'calendar') result.matches = (await api.matches(signal)).matches;
    if (kind === 'report') result.blocks = (await request<{ blocks: NonNullable<typeof result.blocks> }>('/api/blocks', 'GET', undefined, signal)).blocks;
    if (kind === 'hidePeople') result.hiddenContactCount = (await request<{ count: number }>('/api/contacts/hide', 'GET', undefined, signal)).count;
    return result;
  }, [api, kind, request]);
  const apply = useCallback((result: Awaited<ReturnType<typeof load>>) => {
    if (result.preferences) {
      const upperAge = result.preferences.maxAge >= MAX_SELECTABLE_AGE
        ? MAX_SELECTABLE_AGE
        : Math.max(18, result.preferences.maxAge);
      setMinAge(Math.min(upperAge, Math.max(18, Math.min(MAX_SELECTABLE_AGE, result.preferences.minAge))));
      setMaxAge(upperAge);
      setLocationRange(result.preferences.locationRange);
    }
    if (result.hobbies) setOwnHobbies(result.hobbies);
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
  const run = async (action: () => Promise<void>, success?: string, showIndicator = true) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setShowBusyIndicator(showIndicator); setError('');
    try { await action(); if (success) Alert.alert(success); }
    catch (e) { setError(e instanceof Error ? e.message : '処理に失敗しました。'); }
    finally { lock.current = false; setBusy(false); setShowBusyIndicator(true); }
  };
  const loadPlans = async (matchId: string, requestId = ++planLoadSequence.current) => {
    const result = await request<{ plans: { id: string }[] }>(`/api/matches/${matchId}/date-plans`);
    const loadedPlans = await Promise.all(result.plans.map(p => request<Plan>(`/api/date-plans/${p.id}`)));
    if (requestId === planLoadSequence.current) setPlans(loadedPlans);
  };
  const choose = (id: string) => {
    setSelected(id);
    if (kind === 'calendar') {
      const requestId = ++planLoadSequence.current;
      setPlans([]);
      setError('');
      void loadPlans(id, requestId).catch(e => {
        if (requestId === planLoadSequence.current) setError(e instanceof Error ? e.message : '予定を読み込めませんでした。');
      });
    }
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
    <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={kind !== 'location' || !isAgeRangeDragging}>
    <RequestState loading={busy && showBusyIndicator} error={error || undefined} onRetry={() => void run(reloadHiddenEmails)} />
    {kind === 'visibility' ? <>
      <Text style={styles.text}>居住地域の表示</Text>
      <Button label={scope === 'area' ? '地域を表示：ON' : '地域を表示：OFF'} disabled={busy} onPress={() => setScope(scope === 'area' ? 'hidden' : 'area')} />
      <Text style={styles.text}>喉仏の分類（自己申告）</Text>
      {(['present', 'absent', 'pending'] as const).map((value, index) => <Button key={value} label={`${throat === value ? '✓ ' : ''}${['喉仏あり', '喉仏なし', '未分類'][index]}`} onPress={() => setThroat(value)} />)}
      <Field label="自己紹介（300文字まで）" value={bio} onChange={setBio} />
      <Field label="会話ペース" value={pace} onChange={setPace} />
      <Text style={styles.text}>写真の段階公開は、相手プロフィール画面で相手ごとに同意・取り消しできます。</Text>
      <Button label={busy ? '保存中…' : '保存'} centered primary disabled={busy} onPress={() => void run(async () => { await request('/api/profile', 'PATCH', { location_scope: scope, throat_class: throat, bio, conversation_pace: pace }); await refreshProfile(); router.back(); }, undefined, false)} />
    </> : null}
    {kind === 'location' ? <>
      <View style={styles.ageRangeSection}>
        <View style={styles.ageRangeHeader}>
          <Text style={styles.ageRangeHeading}>年齢の範囲</Text>
          <Text style={styles.ageRangeValue}>{minAge}〜{maxAge === MAX_SELECTABLE_AGE ? '50+' : maxAge}</Text>
        </View>
        <View style={styles.ageRangeSliderContent}>
          <AgeRangeSlider minAge={minAge} maxAge={maxAge} onChange={updateAgeRange} onDragStateChange={handleAgeRangeDraggingChange} disabled={busy} />
          <View style={styles.ageRangeEnds}>
            <Text style={[styles.ageRangeEndLabel, { left: AGE_RANGE_THUMB_RADIUS - 40 }]}>18歳</Text>
            <Text style={[styles.ageRangeEndLabel, { right: AGE_RANGE_THUMB_RADIUS - 40 }]}>50歳以上</Text>
          </View>
        </View>
      </View>
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
            style={({ pressed }) => [styles.locationRangeOption, pressed && styles.pressed]}
          >
            <View style={[styles.radioOuter, checked && styles.radioOuterSelected]}>
              {checked ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.locationRangeLabel}>{option.label}</Text>
          </Pressable>;
        })}
      </View>
      {!profile?.prefecture_code ? <>
        <Text style={styles.text}>同じ都道府県・同じ地方で探すには、プロフィールから都道府県の設定をしてください。<Text accessibilityRole="link" onPress={() => router.push('/sign-up')} style={styles.linkText}>設定する</Text></Text>
      </> : null}
      <Button label={busy ? '保存中…' : '保存'} centered primary disabled={busy} onPress={() => void run(async () => { await request('/api/preferences/discovery', 'PATCH', { minAge, maxAge: maxAge === MAX_SELECTABLE_AGE ? 120 : maxAge, locationRange }); router.back(); }, undefined, false)} />
    </> : null}
    {kind === 'hobbies' ? <>
      <Text style={styles.text}>自分の好きな趣味を選択してください。選択内容は、相手が趣味で探すときの条件に使われます。</Text>
      <HobbyGenreGrid
        selectedIds={ownHobbies}
        disabled={busy}
        onToggle={(id: HobbyGenreId) => setOwnHobbies(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])}
      />
      <Button label={busy ? '保存中…' : '保存'} centered primary disabled={busy} onPress={() => void run(async () => { await api.saveOwnHobbies(ownHobbies); router.back(); }, undefined, false)} />
    </> : null}
    {kind === 'hidePeople' ? <>
      <Text style={styles.text}>知り合いのメールアドレスを非表示にすると、お互いの「探す」に表示されなくなります。相手が後から新規登録した場合も適用されます。トークやメッセージを止めるブロックとは別の機能です。</Text>
      <Field label="非表示にするメールアドレス" value={contacts} onChange={setContacts} placeholder="name@example.com" email />
      <Button label={busy && hiddenPeopleAction === 'add' ? '追加中…' : '非表示に追加'} centered primary={!busy && hiddenEmailsLoaded && validContactEntries} disabled={busy || !hiddenEmailsLoaded || !validContactEntries} onPress={() => {
        setHiddenPeopleAction('add');
        void run(async () => {
          const nextEmails = [...new Set([...hiddenEmails, ...contactEntries])];
          await request('/api/contacts/hide', 'POST', { contacts: contactEntries });
          const result = await request<{ count: number }>('/api/contacts/hide');
          await saveHiddenEmails(nextEmails);
          setHiddenContactCount(result.count);
          setContacts('');
        }, undefined, false).finally(() => setHiddenPeopleAction(null));
      }} />
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
              onPress={() => {
                setRemovingHiddenEmail(email);
                setHiddenPeopleAction('removeOne');
                void run(async () => {
                  const result = await request<{ removed: boolean }>('/api/contacts/hide/entry', 'DELETE', { contact: email });
                  await saveHiddenEmails(hiddenEmails.filter(value => value !== email));
                  if (result.removed) setHiddenContactCount(count => Math.max(0, count - 1));
                }, undefined, false).finally(() => { setRemovingHiddenEmail(null); setHiddenPeopleAction(null); });
              }}
              style={({ pressed }) => [styles.removeEmailButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.removeEmailLabel}>{busy && removingHiddenEmail === email ? '解除中…' : '解除'}</Text>
            </Pressable>
          </View>
        )) : null}
        {hiddenEmailsLoaded && !hiddenEmails.length ? (
          <Text style={styles.text}>非表示にしているメールアドレスはありません。</Text>
        ) : null}
      </View>
      {hiddenContactCount > 0 ? <Button label={busy && hiddenPeopleAction === 'removeAll' ? '解除中…' : '非表示設定をすべて解除'} centered disabled={busy} onPress={() => Alert.alert('設定の解除', '登録した非表示設定をすべて解除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '解除', onPress: () => {
        setHiddenPeopleAction('removeAll');
        void run(async () => {
          await request('/api/contacts/hide', 'DELETE');
          if (hiddenEmailsStorageKey) await SecureStore.deleteItemAsync(hiddenEmailsStorageKey);
          setHiddenEmails([]);
          setHiddenContactCount(0);
        }, undefined, false).finally(() => setHiddenPeopleAction(null));
      } }])} />
      : null}
    </> : null}
    {kind === 'report' || kind === 'calendar' ? <>
      <Text style={styles.text}>相手を選択</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color={colors.mutedText} />
        <KeyboardAwareTextInput
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
      <Button label={busy && activeSafetyAction === 'report' ? '通報中…' : '通報'} centered disabled={busy || !selected || !details.trim()} onPress={() => {
        setActiveSafetyAction('report');
        void run(async () => { const user = matches.find(m => m.id === selected)!; await request('/api/reports', 'POST', { subjectId: user.user_id, category: 'other', details }); setDetails(''); }, '通報を受け付けました', false).finally(() => setActiveSafetyAction(null));
      }} />
      <Button label={busy && activeSafetyAction === 'block' ? 'ブロック中…' : 'ブロック'} centered primary={!busy && !!selected} disabled={busy || !selected} onPress={() => Alert.alert('ブロック', 'マッチが解除され、会話できなくなります。ブロックしますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: 'ブロック', style: 'destructive', onPress: () => {
        setActiveSafetyAction('block');
        void run(async () => { const user = matches.find(m => m.id === selected)!; await request('/api/blocks', 'POST', { userId: user.user_id }); setSelected(null); await reload(); }, undefined, false).finally(() => setActiveSafetyAction(null));
      } }])} />
      <View style={styles.hiddenEmailsSection}>
        <Text style={styles.sectionTitle}>ブロック中</Text>
        {!blocks.length ? <Text style={styles.text}>ブロック中のユーザーはいません。</Text> : null}
        {blocks.map(b => <Button key={b.user_id} label={busy && removingBlockedUserId === b.user_id ? '解除中…' : `${b.display_name}：ブロック解除`} disabled={busy} onPress={() => {
          setRemovingBlockedUserId(b.user_id);
          void run(async () => { await request(`/api/blocks/${b.user_id}`, 'DELETE'); await reload(); }, undefined, false).finally(() => setRemovingBlockedUserId(null));
        }} />)}
      </View>
    </> : null}
    {kind === 'calendar' ? <>
      {selected ? plans.map(plan => <View key={plan.id} style={styles.plan}>
        <Text style={styles.text}>{plan.startsAt ? new Date(plan.startsAt).toLocaleString('ja-JP') : '日時非公開'} / {plan.placeLabel ?? '場所非公開'}</Text>
        <Text style={styles.text}>{plan.status === 'cancelled' ? 'キャンセル済み' : plan.status === 'expired' ? '期限切れ' : `自分：${plan.confirmed.you ? '確認済み' : '未確認'} / 相手：${plan.confirmed.other ? '確認済み' : '未確認'}`}</Text>
        {plan.exactLocation ? <Text style={styles.text}>{plan.exactLocation}</Text> : null}
        <Text style={styles.text}>到着：自分 {plan.arrived.you ? '済み' : '未'} / 相手 {plan.arrived.other ? '済み' : '未'}</Text>
        {!['cancelled', 'expired'].includes(plan.status) ? <>
          <Button label="予定を確認（詳細な場所の共有に同意）" disabled={busy} onPress={() => void run(async () => { await request(`/api/date-plans/${plan.id}/confirm`, 'POST', { scope: { schedule: true, area: true, arrival: true, exactLocation: true }, revision: plan.revision }); await loadPlans(selected); })} />
          <Button label="到着を報告" disabled={busy || !plan.confirmed.you || !plan.confirmed.other} onPress={() => void run(async () => { await request(`/api/date-plans/${plan.id}/arrive`, 'POST', {}); await loadPlans(selected); })} />
          <Button label="予定をキャンセル" disabled={busy} onPress={() => Alert.alert('予定のキャンセル', 'この予定をキャンセルしますか？', [{ text: '戻る', style: 'cancel' }, { text: 'キャンセルする', onPress: () => void run(async () => { await request(`/api/date-plans/${plan.id}/cancel`, 'POST', {}); await loadPlans(selected); }) }])} />
        </> : null}
      </View>) : null}
      <DatePickerField label="日付" value={meetingDate} onChange={setMeetingDate} />
      <View style={{ gap: 6 }}>
        <Text style={styles.text}>時刻</Text>
        <KeyboardAwareTextInput
          accessibilityLabel="時刻（24時間表記）"
          value={meetingTime}
          onChangeText={value => {
            const normalized = normalizeTimeInput(value);
            if (normalized !== null) setMeetingTime(normalized);
          }}
          placeholder="例) 18:00"
          placeholderTextColor={colors.mutedText}
          keyboardType="number-pad"
          maxLength={5}
          style={styles.field}
        />
      </View>
      <Field label="待ち合わせ場所" value={place} onChange={setPlace} />
      <Button label="登録" centered primary={!busy && !!selected && !!startsAt && !!place.trim()} disabled={busy || !selected || !startsAt || !place.trim()} onPress={() => {
        if (!selected) return;
        void run(async () => { await request(`/api/matches/${selected}/date-plans`, 'POST', { startsAt, placeLabel: place }); setMeetingDate(null); setMeetingTime(''); setPlace(''); await loadPlans(selected); }, '予定を登録しました');
      }} />
    </> : null}
    {kind === 'accountDelete' ? <>
      <Field label="確認のためパスワードを入力してください。" value={password} onChange={setPassword} password />
      <Button label="アカウントを削除する" disabled={busy || !password.trim()} centered primary={!busy && !!password.trim()} onPress={() => Alert.alert('アカウントの削除', 'アカウントと写真・会話などを削除します。この操作は取り消せません。', [{ text: 'キャンセル', style: 'cancel' }, { text: '退会する', style: 'destructive', onPress: () => void run(async () => { await request('/api/account/delete', 'POST', { password }); await logOut().catch(() => undefined); router.replace('/'); }) }])} />
    </> : null}
    </KeyboardAwareScrollView>
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
  ageRangeSection: { gap: spacing.xs },
  ageRangeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ageRangeHeading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  ageRangeValue: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  ageRangeSliderContent: { gap: spacing.xs, marginHorizontal: spacing.md },
  ageRangeEnds: { height: 18, position: 'relative' },
  ageRangeEndLabel: { position: 'absolute', top: 0, width: 80, color: colors.mutedText, fontSize: 12, textAlign: 'center' },
  locationRangeSection: { gap: 4 },
  locationRangeOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
  radioOuter: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.mutedText, borderRadius: 11, backgroundColor: colors.surface },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  locationRangeLabel: { color: colors.text, fontSize: 15 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  disabled: { opacity: 0.4 },
});
