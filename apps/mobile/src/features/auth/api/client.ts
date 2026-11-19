import Constants from 'expo-constants';

export type AuthProfile = {
  email?: string;
  display_name: string;
  birth_year: number | null;
  area: string | null;
  prefecture_code?: string | null;
  bio: string;
  purpose: string | null;
  conversation_pace: string | null;
  throat_class: 'present' | 'absent' | 'pending';
  email_verified?: number;
  email_verification_required?: boolean;
  user_id: string;
  location_scope: 'hidden' | 'area' | 'meetup';
  profile_photo_capture_id?: string | null;
};

type ApiErrorResponse = { error?: string };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

const errorMessages: Record<string, string> = {
  appwrite_not_configured: 'Appwriteの接続設定またはAPIキーの権限を確認してください。',
  auth_service_unavailable: '認証サービスに接続できませんでした。しばらくしてからお試しください。',
  email_verification_required: 'メールアドレスの確認を完了してください。',
  auth_migration_required: '既存アカウントの移行を完了できませんでした。運営にお問い合わせください。',
  password_policy_rejected: '認証サービスのパスワード条件を満たしていません。別のパスワードをお試しください。',
  profile_photo_required: 'プロフィール写真が必要です。アプリ内カメラで撮影してください。',
  invalid_or_expired_code: '確認コードが正しくないか、有効期限が切れています。コードを確認するか、再送信してください。',
  mail_not_configured: 'メール送信がまだ設定されていません。運営にお問い合わせください。',
  classification_model_license_required: 'AIモデルの利用規約への同意がまだ必要です。運営側で設定してください。',
  classification_service_not_configured: 'AI推定がまだ設定されていません。判定保留で進むこともできます。',
  classification_references_not_configured: 'AI比較用の参考画像が未設定です。',
  classification_service_unavailable: 'AI推定を利用できませんでした。しばらくしてから再度お試しください。',
  classification_image_unavailable: '比較画像を準備できませんでした。撮り直してください。',
  classification_requires_neck_crop: '首周りの公開画像を撮影し直してから推定してください。',
  feature_restricted: 'この機能は一時的に利用が制限されています。',
  resize_capture_before_upload: '画像サイズが大きすぎます。撮影し直してください。',
  topic_not_today: 'このお題の受付は終了しています。再読み込みしてください。',
  plan_inactive: 'この予定はキャンセル済み、または受付が終了しています。',
  plan_changed: '予定が更新されています。開き直してください。',
  maintenance: '現在メンテナンス中です。しばらくしてからお試しください。',
  request_too_large: '送信する画像が大きすぎます。アプリ内カメラで撮り直してください。',
  invalid_preferences: '年齢の範囲を18〜120歳で指定してください。',
  invalid_hobbies: '趣味を選び直してください。',
  invalid_location_range: 'マッチング範囲を選び直してください。',
  invalid_prefecture: '都道府県を選び直してください。',
  prefecture_required: '同じ都道府県・同じ地方で探すには、プロフィールに都道府県を設定してください。',
  reauthentication_failed: '確認用パスワードが正しくありません。',
  invalid_capture_size: '画像を読み込めませんでした。アプリ内カメラで撮り直してください。',
  match_not_found: 'このトークは利用できません。ブロックや退会の可能性があります。',
  swipe_undo_not_last: '直前の操作ではないため、プロフィールを戻せません。画面を更新してください。',
  swipe_undo_matched: 'マッチ成立後の操作は取り消せません。',
  topic_not_available: 'このお題の受付は終了しています。再読み込みしてください。',
  stage_locked: '公開条件にまだ達していません。会話とデイリーを続けてください。',
  invalid_message: 'メッセージを1〜2000文字で入力してください。',
  invalid_answer: '回答を1〜2000文字で入力してください。',
  invalid_email: 'メールアドレスの形式を確認してください。',
  invalid_password: 'パスワードは9〜128文字で入力してください。',
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
  email_already_registered: 'このメールアドレスは登録済みです。ログインしてください。',
  rate_limited: '試行回数が多すぎます。しばらく待ってからもう一度お試しください。',
  account_unavailable: 'このアカウントは現在利用できません。運営にお問い合わせください。',
  server_auth_not_configured: 'サーバーの認証設定が不足しています。APIの設定を確認してください。',
  unauthorized: 'ログインの有効期限が切れました。再度ログインしてください。',
  invalid_birth_year: '18歳以上であることを確認できる生年を入力してください。',
};

export function getApiBaseUrl() {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  const value = extra?.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error('API接続先がありません。apps/mobile/.env.local の EXPO_PUBLIC_API_BASE_URL を設定してください。');
  }

  return value.replace(/\/$/, '');
}

export async function apiRequest<T extends object = Record<string, unknown>>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as ApiErrorResponse & Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      (body.error && errorMessages[body.error]) ||
        '通信に失敗しました。APIの起動状態と接続先を確認してください。', response.status, body.error,
    );
  }

  return body as T;
  } catch (error) {
    if (controller.signal.aborted && !init?.signal?.aborted) throw new Error('API接続がタイムアウトしました。接続先とWi-Fiを確認してください。');
    throw error;
  } finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
}

export function isProfileReady(profile?: AuthProfile | null) {
  return Boolean(profile?.display_name?.trim() && profile.birth_year && profile.area?.trim() && profile.profile_photo_capture_id);
}

export function needsEmailVerification(profile?: AuthProfile | null) {
  return profile?.email_verification_required === true && profile.email_verified !== 1;
}
export function authDestination(profile?: AuthProfile | null) {
  return needsEmailVerification(profile) ? '/verify-email' : isProfileReady(profile) ? '/home' : '/sign-up';
}
