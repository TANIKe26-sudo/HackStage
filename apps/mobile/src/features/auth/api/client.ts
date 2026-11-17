import Constants from 'expo-constants';

export type AuthProfile = {
  display_name: string;
  birth_year: number | null;
  area: string | null;
  bio: string;
  purpose: string | null;
  conversation_pace: string | null;
  throat_class: 'present' | 'absent' | 'pending';
  age_verification: string;
};

type ApiErrorResponse = { error?: string };

const errorMessages: Record<string, string> = {
  age_verification_required: 'プロフィールの登録後、年齢確認が完了するとアプリを利用できます。',
  invalid_email: 'メールアドレスの形式を確認してください。',
  invalid_password: 'パスワードは12〜128文字で入力してください。',
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
  email_already_registered: 'このメールアドレスは登録済みです。ログインしてください。',
  rate_limited: '試行回数が多すぎます。しばらく待ってからもう一度お試しください。',
  account_unavailable: 'このアカウントは現在利用できません。運営にお問い合わせください。',
  server_auth_not_configured: 'サーバーの認証設定が不足しています。APIの設定を確認してください。',
  unauthorized: 'ログインの有効期限が切れました。再度ログインしてください。',
  invalid_birth_year: '18歳以上であることを確認できる生年を入力してください。',
};

function getApiBaseUrl() {
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
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as ApiErrorResponse & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      (body.error && errorMessages[body.error]) ||
        '通信に失敗しました。APIの起動状態と接続先を確認してください。',
    );
  }

  return body as T;
}

export function isProfileReady(profile?: AuthProfile | null) {
  return Boolean(profile?.display_name?.trim() && profile.birth_year && profile.area?.trim());
}
