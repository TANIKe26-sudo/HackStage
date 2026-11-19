# Appwriteメール認証

## 構成

- Expo Go → Workers API → Appwrite Cloud。ネイティブ認証SDKやGoogleログインは使用しません。
- Appwriteは登録・パスワード・メール確認・再設定を担当します。D1はプロフィール・写真・会話・公開権限を担当します。
- APIが発行するBearerトークンだけをスマホのSecureStoreへ保存します。Appwriteセッション秘密値はAES-GCMで暗号化してD1へ保存し、スマホへ返しません。各API要求でAppwriteのセッション・メール確認状態を検証します。
- 確認前は自分の認証状態取得・コード送信／確認・ログアウト・セッション管理・退会・異議申し立てなどに限定します。プロフィール登録、画像投稿、検索、いいね、チャット、デイリーは403です。
- 運営スタッフの認証は従来の個別スタッフアカウント／管理キーです。

## 設定

`wrangler.jsonc`の開発／本番に次の公開設定が入っています。

```dotenv
AUTH_PROVIDER=appwrite
APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6afe98140007431a2096
```

Appwrite ConsoleでAPIキーを作成し、`sessions.write`・`users.read`・`users.write`を付与します。有効期限は利用期間より後にしてください。メール／パスワード認証を有効にし、標準SMTPを使います。Appwrite側のパスワードポリシーも確認してください。アプリの入力範囲は9〜128文字ですが、サービス側の禁止パスワードなどは追加で適用されます。

開発時は`apps/api/.dev.vars`へ `APPWRITE_API_KEY=...` を追加します。既存の`SESSION_SECRET`・`CONTACT_HASH_KEY`・`DATE_LOCATION_KEY`も必要です。APIキーはフロントの環境変数やGitへ入れないでください。本番では次で登録します。

```powershell
cd C:\github_use\HackStage\apps\api
npx wrangler secret put APPWRITE_API_KEY --env production
```

## ローカル起動

```powershell
cd C:\github_use\HackStage
npm run d1:migrate:local --workspace @nodobito/api
npm run dev:cloudflare --workspace @nodobito/api
```

AI撮影推定も確認する場合は、最後のコマンドを `npm run dev:cloudflare:ai --workspace @nodobito/api` に置き換えます。別ターミナルでExpoを起動します。

```powershell
cd C:\github_use\HackStage\apps\mobile
npx expo start --go --lan --clear
```

`/health/ready` の `authProvider` が `appwrite` なら新方式です。`APPWRITE_API_KEY`や暗号鍵が不足する場合は503を返します。実際のキーの有効性・メールの到達は別途確認してください。

## 実機での確認

1. 新規登録に実際に受信できるメールと9〜128文字のパスワードを入力する。
2. メール確認画面が表示される。登録時にコード送信を試み、未着なら送信・再送信を押す。
3. 誤ったコードでは進めないことを確認し、メールに届いた6桁のコードを入力する。
4. プロフィール登録へ進み、写真と必須情報を保存する。
5. 別端末でもログインして、同じプロフィールが取得できることを確認する。
6. ログイン画面のパスワード再設定からメールを要求し、届いたコードと新しいパスワードで変更する。既存の全端末セッションが失効することを確認する。

確認コードは15分有効で、一度確認に使うと再利用できません。Appwriteでは再送しても期限内の以前のコードが残ります。架空のアドレスは受信できないため、メール確認を完了できません。コードやAppwriteの生レスポンスを画面・ログへ出す開発用処理は新方式にはありません。

## 既存アカウント

- 切り替え前のローカルセッションは利用できなくなります。再ログインしてください。
- 従来のパスワードが正しい場合、同じD1ユーザーIDでAppwriteへ移行し、プロフィール・写真・マッチ・知り合い非表示を引き継ぎます。移行後は従来のD1パスワードハッシュを削除します。
- メール確認を終えるまで基本機能は使えません。
- 移行前のアカウントで旧パスワードを忘れた場合は運営対応が必要です。Appwrite未登録のため、新方式の再設定メールはまだ届きません。
- 同じメールを別のAppwrite IDで先に登録していた場合は自動では統合しません。所有者確認のうえ移行方法を決めてください。
- 退会時はD1データを削除し、Appwriteの削除を永続キューで再試行します。削除待ちのIDは再接続できません。再試行は定期処理でも実行します。

## テストと本番反映

```powershell
npm run test:cloudflare --workspace @nodobito/api
npm run typecheck:cloudflare --workspace @nodobito/api
npm run typecheck --workspace mobile
npm run lint --workspace mobile
```

Appwrite関連の自動テストは通信をモックし、コード検証・利用制限・秘密値の非公開・旧アカウント移行・再設定・退会再試行を確認します。実接続でメールを送らず、作成・ログイン・未確認アクセス拒否・削除を試す場合は、ローカルAPIを8788で起動し、次を明示的に実行します。

```powershell
node apps/api/scripts/test-appwrite-connection.mjs
```

一時アカウントを実際のAppwriteに作成し、終了時にAppwriteとローカルD1から削除します。従来の`test:mobile-integration`と`smoke-cloudflare.mjs`は架空メールを使うため、`AUTH_PROVIDER=local`の隔離した開発APIだけで実行できます。

本番反映ではAPIキー・認証／暗号鍵を登録し、`npm run d1:migrate:remote --workspace @nodobito/api` を適用してからデプロイしてください。この変更では本番マイグレーション・デプロイ・実メールの到達確認は行っていません。

参照：[メール確認](https://appwrite.io/docs/products/auth/verify-user)、[パスワード再設定](https://appwrite.io/docs/products/auth/email-password)、[サーバー側認証](https://appwrite.io/docs/products/auth/server-side-rendering)
