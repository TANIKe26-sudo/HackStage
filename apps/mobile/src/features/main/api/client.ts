import { useMemo } from 'react';
import { apiRequest } from '../../auth/api/client';
import { useAuth } from '../../auth/context/AuthContext';

export type PublicProfile = {
  user_id: string; display_name: string; birth_year: number | null;
  area: string | null; bio: string; purpose: string | null;
  conversation_pace: string | null; throat_class: string; capture_id?: string | null; initial_capture_id?: string | null;
};
export type ProfileCard = {
  id: string; name: string; captureId?: string | null; age: number | null; area: string; goal: string; classification: string;
};
export type Conversation = {
  id: string; name: string; captureId?: string | null; lastMessage: string; updatedAt: string; hasUnread: boolean;
};
export type MatchRow = PublicProfile & {
  id: string; created_at: string; last_message: string | null; updated_at: string; unread_count: number;
};
export type Message = { id: string; sequence: number; sender_id: string; body: string; warning: string | null; created_at: string };
export type MessagePage = { me: string; messages: Message[]; nextBefore: number | null };
export type Progress = { stage: number; mutualDays: number; sharedAnswers: number };
export type MatchDetail = {
  id: string; me: string; profile: PublicProfile; progress: Progress;
  visibleStage: number; grantedStage: number; captures: { id: string; stage: number }[];
};
export type Daily = {
  topic: { id: string; title: string; prompt: string; topic_date: string } | null;
  answer: { answer: string } | null;
};
export type MatchDaily = Daily & { tasks: Record<string, boolean>; otherAnswered: boolean; progress: Progress };
export const timeLabel = (value: string) => new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
export const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
export function formatDateLabel(value: string, now = new Date()) {
  const date = new Date(value);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return isSameLocalDay(date, yesterday) ? '昨日' : date.toLocaleDateString('ja-JP');
}
export function formatConversationTimestamp(value: string, now = new Date()) {
  return isSameLocalDay(new Date(value), now) ? timeLabel(value) : formatDateLabel(value, now);
}
export function profileCard(p: PublicProfile): ProfileCard {
  return { id: p.user_id, captureId: p.capture_id ?? p.initial_capture_id, name: p.display_name, age: p.birth_year ? new Date().getFullYear() - p.birth_year : null,
    area: p.area || '地域非公開', goal: p.purpose || '目的未登録',
    classification: p.throat_class === 'present' ? '喉仏あり' : p.throat_class === 'absent' ? '喉仏なし' : '分類未登録' };
}
export function useMainApi() {
  const { token } = useAuth();
  return useMemo(() => {
    const get = <T extends object>(path: string, signal?: AbortSignal) => apiRequest<T>(path, token ?? undefined, { signal });
    const post = <T extends object>(path: string, body: object) => apiRequest<T>(path, token ?? undefined, { method: 'POST', body: JSON.stringify(body) });
    return {
      discover: (signal?: AbortSignal) => get<{ candidates: PublicProfile[]; notice: string | null }>('/api/discover?reuseUnswiped=true', signal),
      likes: (signal?: AbortSignal) => get<{ likes: PublicProfile[] }>('/api/likes/received?pendingOnly=true', signal),
      like: (toUserId: string) => post<{ matched: boolean; matchId?: string }>('/api/likes', { toUserId }),
      pass: (toUserId: string) => post('/api/passes', { toUserId }),
      matches: (signal?: AbortSignal) => get<{ matches: MatchRow[] }>('/api/matches', signal),
      match: (id: string, signal?: AbortSignal) => get<MatchDetail>(`/api/matches/${encodeURIComponent(id)}`, signal),
      messages: (id: string, signal?: AbortSignal, before?: number) => get<MessagePage>(`/api/matches/${encodeURIComponent(id)}/messages${before ? `?before=${before}` : ''}`, signal),
      send: (id: string, body: string) => post<{ id: string; warning: string | null }>(`/api/matches/${encodeURIComponent(id)}/messages`, { body }),
      read: (id: string, sequence: number) => post(`/api/matches/${encodeURIComponent(id)}/read`, { sequence }),
      daily: (signal?: AbortSignal) => get<Daily>('/api/daily', signal),
      matchDaily: (id: string, signal?: AbortSignal) => get<MatchDaily>(`/api/matches/${encodeURIComponent(id)}/daily`, signal),
      answer: (topicId: string, answer: string) => post('/api/daily/answers', { topicId, answer }),
      grant: (id: string, stage: number, consent: boolean) => post(`/api/matches/${encodeURIComponent(id)}/profile-stage`, { stage, consent }),
    };
  }, [token]);
}
