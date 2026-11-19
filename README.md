# 👔 喉仏マッチングアプリ

撮影画像のAI推定：[喉仏の写り方のAPI・参考画像設定](docs/throat-classification.md)

> フロントとCloudflare APIの接続・最新のローカル起動／2アカウント検証は[接続手順](docs/mobile-integration.md)を参照してください。Cloudflare版では本人確認の審査待ちは廃止しています。以下の企画仕様のうち本人確認の記載は旧方針です。

## 1. プロジェクト概要

### アプリ名
喉仏マッチングアプリ（仮称）

### コンセプト
**「顔より、喉仏から始まる出会い。」**

従来のマッチングアプリとは異なり、首周りや喉仏を最初の判断基準とする、新しい形のマッチングアプリを開発する。

外見や顔写真だけで相手を判断するのではなく、段階的に相手の情報が公開されていく仕組みを採用する。

また、アプリ独自のデイリー機能を導入し、ユーザー同士の会話や交流を促進する。

### 対応プラットフォーム
- iOS（iPhone）
- Android

## 2. 基本コンセプト・仕様

### 2.1 画面構成

従来のマッチングアプリを利用したことがあるユーザーが、直感的に操作できるようなUI・UXを採用する。

基本的には既存のマッチングアプリの画面構成を参考にする。

想定画面：
- ログイン・新規登録画面
- プロフィール登録画面
- ホーム画面（相手の検索・スワイプ）
- 相手のプロフィール画面
- マッチング一覧画面
- チャット画面
- カメラ撮影画面
- デイリー画面
- マイページ・設定画面

### 2.2 マッチングの基準

首周り、特に喉仏の有無を最初のマッチング基準とする。

- 喉仏あり：男性
- 喉仏なし：女性

※喉仏の有無はアプリ独自の分類基準とする。実際の性別を医学的・生物学的に判定するものではない。

### 2.3 写真投稿機能

写真の投稿には、アプリ内に実装した専用カメラのみを使用する。

仕様：
- アプリ内カメラからのみ撮影可能
- 端末の写真ライブラリからの画像選択は禁止
- 撮影した画像をそのままプロフィールや投稿に使用
- 外部画像のアップロードを防止する

これにより、他人の写真の流用や過度な加工による写真詐欺を抑制する。

### 2.4 初回撮影

プロフィール用に首から頭までをアプリ内で撮影します。本人確認・年齢確認の申請や審査は行わず、プロフィール登録後に利用できます。

## 3. 主要機能

### 3.1 スワイプ式マッチング機能

一般的なマッチングアプリと同様の操作方式を採用する。

- 相手のプロフィールをカード形式で表示
- 左右のスワイプによる評価
- いいね機能
- 相互にいいねした場合にマッチング成立
- マッチングした相手とのチャット機能

### 3.2 デイリー機能（話題提供）

ユーザーによる無意味な連投や、マッチング後の会話不足を防ぐため、運営側が毎日テーマや話題を提供する。

仕様：
- 毎日新しいデイリー課題を提供
- ユーザーは提示されたテーマに沿って投稿・回答する
- 課題の達成状況を記録する
- 達成度に応じて利用可能な機能を段階的に解放する

目的：
- 投稿の質を高める
- ユーザーの継続的な利用を促す
- 会話のきっかけを提供する
- 無意味な連投を抑制する

### 3.3 段階的なプロフィール公開機能

本アプリの中心となる独自機能。

最初から顔全体を公開するのではなく、デイリーの達成状況やマッチング相手との交流状況に応じて、プロフィール画像の公開範囲を段階的に広げる。

公開イメージ：

| 段階 | 公開範囲 |
|---|---|
| 初期状態 | 首周り・喉仏 |
| 第1段階 | 首から顎周辺 |
| 第2段階 | 口元・顔の一部 |
| 第3段階 | 顔全体 |
| 最終段階 | 頭部まで含めた全体 |

※具体的な解放条件や公開範囲は今後調整する。

解放条件の候補：
- デイリー課題の達成度
- マッチング相手との会話回数
- 双方のメッセージ返信率
- 継続的なコミュニケーション
- 親密度ポイント

一方的なメッセージ送信だけでは解放されず、双方の交流を重視する仕組みにする。

## 4. 技術構成

iOS・Androidの両方に対応するクロスプラットフォーム開発を採用する。

### フロントエンド
**React Native（Expo）**

役割：
- アプリ画面の構築
- スワイプ式マッチングUI
- プロフィール表示
- チャット画面
- デイリー機能
- アプリ内カメラ

使用候補：
- Expo Camera
- React Navigation

### バックエンド
**Node.js**

役割：
- ユーザー登録・認証
- プロフィール管理
- マッチング処理
- メッセージ管理
- デイリー課題管理
- 親密度・解放条件の管理
- 画像管理

### データベース
今後選定予定。

管理するデータの例：
- ユーザー情報
- プロフィール情報
- 撮影画像
- いいね情報
- マッチング情報
- メッセージ履歴
- デイリー達成状況
- 親密度ポイント
- プロフィール公開段階

### 対応OS
- iOS
- Android

### 開発方針
React NativeとExpoを利用することで、共通のコードベースからiOS・Android両方のアプリ開発を進める。

なお、iOS向けのローカルビルドやシミュレーター確認にはmacOSとXcodeが必要となる。

## 5. 従来のマッチングアプリにおける問題点

本アプリでは、従来のマッチングアプリで発生している以下の問題を意識して設計する。

| No. | 問題点 | 具体的な内容 |
|---|---|---|
| 1 | 外見至上主義 | 写真だけで判断され、内面を知ってもらえない |
| 2 | マッチングしない | いいねを送っても反応がない |
| 3 | メッセージが続かない | 話題がなくなり、自然消滅する |
| 4 | 写真詐欺 | 加工写真と実物の印象が違う |
| 5 | なりすまし | 他人の写真や偽プロフィールを使用する |
| 6 | 業者・詐欺 | 投資詐欺や悪質サイトへの誘導 |
| 7 | 遊び目的の利用者 | 真剣な恋愛目的の人と利用目的が合わない |
| 8 | 男女間の料金格差 | 性別によって利用料金が異なる場合がある |
| 9 | 人気の偏り | 一部の人気ユーザーにいいねが集中する |
| 10 | 身バレの不安 | 知人や職場の人に利用が知られる |
| 11 | 個人情報の流出 | 顔写真や位置情報などが悪用される |
| 12 | ドタキャン | 約束しても当日に来ない |
| 13 | 課金への不満 | お金を払っても出会える保証がない |
| 14 | 選択肢が多すぎる | もっと良い人がいると考えて決められない |
| 15 | 安全面の問題 | ストーカー、ハラスメント、危険な出会い |

## 6. 本アプリでの問題解決方針

| 問題点 | 解決に向けた施策 |
|---|---|
| 外見至上主義 | 喉仏を最初の判断基準にし、段階的に顔を公開する |
| マッチングしない | スワイプ式UIで直感的なマッチングを実現する |
| メッセージが続かない | デイリー機能によって会話のきっかけを提供する |
| 写真詐欺 | アプリ内カメラ限定で撮影・投稿する |
| なりすまし | アプリ内撮影・通報・ブロックで対応する |
| 業者・詐欺 | 通報・ブロック機能を導入する |
| 遊び目的の利用者 | 利用目的の登録やプロフィール表示を検討する |
| 男女間の料金格差 | 性別による不公平な料金設定を避ける |
| 人気の偏り | 表示アルゴリズムの調整を検討する |
| 身バレの不安 | プロフィール公開範囲や表示設定を設ける |
| 個人情報の流出 | 画像・個人情報の適切な管理とアクセス制御を実施する |
| ドタキャン | 約束・予定の確認機能を検討する |
| 課金への不満 | 基本的なマッチング機能を利用できる料金体系を検討する |
| 選択肢が多すぎる | 段階的な情報公開によって相手を知る時間を作る |
| 安全面の問題 | 通報・ブロックなどの安全機能を実装する |

## 7. 今後の開発予定

### Phase 1：基本機能の開発
- [x] プロジェクト環境構築
- [ ] 新規登録・ログイン
- [ ] プロフィール登録
- [ ] アプリ内カメラ実装
- [ ] スワイプ式マッチング画面
- [ ] いいね機能
- [ ] マッチング機能

### Phase 2：コミュニケーション機能
- [ ] チャット機能
- [ ] メッセージ履歴管理
- [ ] デイリー課題の表示
- [ ] デイリー達成状況の管理

### Phase 3：独自機能の開発
- [ ] 親密度ポイントの実装
- [ ] プロフィール段階的公開機能
- [ ] デイリー達成度による機能解放
- [ ] 会話率による公開範囲の調整

### Phase 4：安全性・品質向上
- [ ] 通報・ブロック機能
- [ ] 不正利用対策
- [ ] 個人情報・画像の保護
- [ ] 動作テスト
- [ ] iOS・Android実機検証

## 8. 今後検討する事項

- 正式なアプリ名・ロゴ
- データベースの選定
- 喉仏の有無による分類方法と例外への対応
- デイリー課題の種類と達成条件
- 親密度ポイントの計算方法
- プロフィール公開段階の詳細
- 画像の保存方法とセキュリティ
- 通報・ブロック機能の詳細
- 利用料金・課金システム
- プライバシーポリシー・利用規約
- プロフィールの年齢入力と利用条件
- 性別や身体的特徴に関するプライバシーへの配慮

---

## 9. 開発目標

従来のマッチングアプリの使いやすさを維持しながら、喉仏を起点とした独自のマッチング体験を提供する。

デイリー機能と段階的なプロフィール公開を組み合わせることで、単なる写真の評価ではなく、ユーザー同士が会話を通じて徐々に相手を知っていくアプリを目指す。

## 開発環境のセットアップ

### 必要な環境

- Node.js 24以上（この環境では24.14.1を使用）
- npm 11以上
- Expo GoをインストールしたiOSまたはAndroid端末、またはAndroidエミュレーター
- iOSシミュレーターやiOSネイティブビルドを使う場合はmacOSとXcode

### 画面を実機で確認する（Expo Go）
スマートフォンにExpo Goをインストールします。（App StoreやGoogle Playから可能）

この手順でモバイル画面を起動できます。ログイン・新規登録のAPI接続は、後述の「ログイン・新規登録も動かす場合」を追加で設定してください。

リポジトリのルートで依存関係をインストールします。

```sh
npm install
```

PCとスマートフォンを同じWi-Fiに接続し、リポジトリのルートでExpoを起動します。

```sh
npm run start --workspace mobile -- --go --lan
```

ターミナルにQRコードが表示されたら、端末に応じて読み取ります。`http://localhost:8081`をブラウザーで直接開くとJSONが表示されますが、これはExpoの開発サーバー情報です。アプリ画面を開くにはQRコードを使います。

- **Android**：Expo Goを開き、「Scan QR code」を選択
- **iPhone**：カメラアプリでQRコードを読み取り、Expo Goで開く

iPhoneでサインインを求められた場合は、PCのExpo CLIとExpo Goで同じExpoアカウントを使います。PCではリポジトリのルートでログインします。

```sh
npm exec --workspace mobile -- expo login
```

モバイル画面は`apps/mobile/src/app/`のExpo Routerルートから、`apps/mobile/src/features/`の画面・コンポーネントを呼び出します。変更はExpo Goに自動反映されます。

### ディレクトリ構成

```text
apps/
  api/       Node.js + Express API
  mobile/    React Native + Expoアプリ（iOS / Android）
```

モバイルアプリにはExpo Cameraを追加済みです。新規登録のプロフィール写真はアプリ内カメラで撮影します。写真ライブラリの選択機能・権限は追加していません。

## バックエンドAPI

現行のCloudflare版の機能・API・運営画面・バックアップ・テスト手順は [バックエンド詳細](docs/backend.md) を参照してください。本人確認・年齢確認の承認待ちは廃止しています。

### Cloudflare版（D1 + Workers）

Cloudflareで動かすAPI実装は`apps/api/src/cloudflare.ts`です。メールアドレスとパスワードで登録・ログインし、パスワードはPBKDF2でハッシュ化して保存します。APIは期限付きBearerセッションを発行し、アプリはSecureStoreに保存します。メール確認・パスワード再設定は開発用コード発行とResend連携に対応しています。本番の送信にはメールサービスの設定が必要です。

- Cloudflare D1：ユーザー、プロフィール、いいね、マッチ、会話、日課、安全・運営記録
- 撮影画像：D1の非公開BLOB。画像APIが権限と公開同意を確認してから配信し、公開URLは発行しません
- Cloudflare Workers：Hono API、パスワード認証、通知ジョブ、期限切れデータの整理

Cloudflareアカウントでリソースを作成し、D1のIDを設定してからローカル確認します。

```powershell
npm exec --workspace @nodobito/api -- wrangler d1 create nodobito-db --config apps/api/wrangler.jsonc
```

`d1 create`の出力にある`database_id`を`apps/api/wrangler.jsonc`へ設定します。各種秘密値は`.dev.vars`内だけに保存します。

```powershell
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
```

`SESSION_SECRET`、`CONTACT_HASH_KEY`、`ADMIN_*_KEY`は用途ごとに別々のランダムな値を設定し、`DATE_LOCATION_KEY`には`openssl rand -base64 32`で作った値を使ってください。

```powershell
npm run d1:migrate:local --workspace @nodobito/api
npm run dev:cloudflare --workspace @nodobito/api
npm run typecheck:cloudflare --workspace @nodobito/api
```

本番環境は`wrangler.jsonc`の`env.production`で設定しています。D1は`hackstage_nodo`を使用し、ローカル用の`nodobito-db`とは分かれています。ローカルの登録データと`.dev.vars`は本番へ自動で移りません。別のCloudflareアカウントで使う場合は、本番の`account_id`、`database_name`、`database_id`を差し替えてください。

初回は以下を`apps/api`で実行します。ブラウザでCloudflareにログイン済みでも、Wranglerのログインは別途必要です。

```powershell
cd C:\github_use\HackStage\apps\api
npx wrangler login
npm run d1:migrate:remote
```

写真もD1のBLOBへ保存するため、R2の契約・バケット作成は不要です。少人数の展示向けに、1画像1.8MB以下・無料DB全体500MBの範囲で利用します。旧ローカル写真の移行は[手順書](docs/backend.md#旧ローカルr2から写真を移行)を参照してください。本番用の秘密値は`npx wrangler secret put <キー名> --env production`で登録してください。必要なキーは`SESSION_SECRET`、`CONTACT_HASH_KEY`、`DATE_LOCATION_KEY`、`ADMIN_SAFETY_KEY`、`ADMIN_CONTENT_KEY`、`ADMIN_AUDIT_KEY`です。用途ごとに異なるランダムな値を使い、`DATE_LOCATION_KEY`は32バイトをBase64化した値にします。Expo Pushを使う場合は`EXPO_ACCESS_TOKEN`も登録します。秘密情報をGitへコミットしないでください。

リポジトリルートで`npm run deploy:cloudflare --workspace @nodobito/api`を実行すると本番環境へデプロイします。出力されたHTTPS URLの`/health/ready`で`{"ok":true,"database":"ready"}`が返ることを確認し、モバイルの`EXPO_PUBLIC_API_BASE_URL`へそのURLを設定してExpoを再起動します。独自ドメインはAPIの公開後にWorkerへ追加できます。

主なAPIは`POST /auth/signup`、`POST /auth/login`、`POST /auth/logout`、`POST /api/captures`、`GET /api/discover`、`POST /api/likes`、`GET/POST /api/matches/:id/messages`、`GET /api/daily`、`POST /api/matches/:id/date-plans`です。管理APIは`x-admin-key`で役割別に制限します。位置情報は双方の確認と共有同意が揃うまで開示されず、暗号化して保存します。連絡先は秘密鍵付きHMACダイジェストのみ保存します。

### モバイル登録（メールアドレス + パスワード + プロフィール）

モバイルの認証処理は`apps/mobile/src/features/auth/`にまとめています。未ログイン時はログイン画面から始まり、画面下部のリンクで新規登録へ進みます。登録後はプロフィール入力・撮影画面へ進みます。認証後に`POST /auth/signup`または`POST /auth/login`からセッションを取得し、プロフィールを`PATCH /api/profile`で保存します。セッションはSecureStoreに保管します。画面ルートは`apps/mobile/src/app/`で管理します。

#### ログイン・新規登録も動かす場合（Cloudflare API）

Expo Goで画面を見るだけなら、上の「画面を実機で確認する」の手順だけで起動できます。アプリのログイン・新規登録をAPIにつなぐ場合は、先にCloudflareのローカルD1と秘密値を準備します。

```powershell
npm run d1:migrate:local --workspace @nodobito/api
if (-not (Test-Path apps/api/.dev.vars)) { Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars }
```

`apps/api/.dev.vars`を開き、`SESSION_SECRET`に32文字以上のランダムな値を設定します。`CONTACT_HASH_KEY`、`DATE_LOCATION_KEY`、`ADMIN_*_KEY`も例の説明に従って設定してください。`SESSION_SECRET`がないと登録・ログイン時にセッションを作れません。`.dev.vars`はローカル専用で、Gitにコミットしないでください。

PCのWi-Fi IPv4アドレスを`ipconfig`で確認し、リポジトリのルートで`.env.local`を作成します。

```powershell
if (-not (Test-Path apps/mobile/.env.local)) { Copy-Item apps/mobile/.env.example apps/mobile/.env.local }
```

`apps/mobile/.env.local`を開いてAPI URLを設定します。例としてPCのIPが`10.200.3.200`なら、次の値にします。

```env
EXPO_PUBLIC_API_BASE_URL=http://10.200.3.200:8787
```

**ターミナル1：APIを起動**（初回マイグレーションで確認が出た場合は`Y`を入力します）。

```powershell
npm run dev:cloudflare --workspace @nodobito/api
```

APIのターミナルは起動したままにします。`apps/api/.dev.vars`を変更した場合は、`Ctrl+C`でAPIを止めてから再起動してください。

APIを起動したまま、上の「画面を実機で確認する」にあるExpoコマンドを別ターミナルで実行します。Expo Goで表示されたQRコードを読み込んでください。ポート`8081`が使用中なら、Expoが提案する別ポート（例：`8082`）を選びます。アプリ起動後、スマートフォンのブラウザで`http://<PCのWi-Fi IPv4>:8787/health/ready`を開き、`{"ok":true,"database":"ready"}`が返ることを確認できます。`.env.local`を変更した後はExpoを再起動してください。

新規登録はメールアドレスと12〜128文字のパスワードを使い、登録後にプロフィール画面へ進みます。ローカル開発では`--local`のD1を使うため、データはCloudflare Dashboard上のリモートD1ではなくPCに保存されます。

`npm run dev:api:legacy`（Express + SQLite）は別のローカル試作APIです。現在のモバイル認証はCloudflare APIへ接続するため、ログイン・新規登録を確認するときは上記のCloudflare手順を使います。Cloudflare版はExpress版と別DBであり、SQLiteの既存データ移行は自動では行いません。Cloudflareアカウント上のリソース作成・秘密値設定・デプロイは、この作業環境からは実行していません。

### Node.jsローカル試作版

ExpressとNode.jsの`node:sqlite`で開発用APIを実装しています。DBは`apps/api/data/app.sqlite`、画像は公開ディレクトリ外の`apps/api/private/captures/`へ保存します。どちらもGitには登録しません。

起動は`npm run dev:api:legacy`、疎通確認は`GET http://localhost:3000/health/ready`です。運営APIを有効にする場合は、`apps/api/.env.example`を参考にリポジトリルートの`.env`を作成し、運営の役割ごとに異なるキーを設定します。各運営APIは`x-admin-key`ヘッダーを要求します。

キーは`ADMIN_USERS_KEY`、`ADMIN_CONTENT_KEY`、`ADMIN_SAFETY_KEY`、`ADMIN_AUDIT_KEY`に分けています。`.env`の鍵はリポジトリにコミットしないでください。

### 従来のExpress版API一覧（Cloudflare版は上記の詳細を参照）

認証が必要なAPIには`Authorization: Bearer <token>`を付けます。

| 機能 | エンドポイント |
|---|---|
| 会員・セッション | `POST /auth/signup`、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`GET/DELETE /auth/sessions`、`DELETE /account` |
| プロフィール・紹介条件 | `POST /profiles`、`GET /profiles/:id`、`GET/PUT /preferences/discovery`、`GET /discover` |
| 連絡先非表示 | `PUT/DELETE /privacy/contacts` |
| 撮影画像・公開同意 | `POST /captures`、`DELETE /captures/:id`、`GET /captures/:id/image`、`GET /captures/:id/access-history`、`GET/PUT/DELETE /matches/:id/stage-consent` |
| いいね・マッチ・トーク | `POST /likes`、`GET /likes/received`、`GET /matches`、`GET/POST/DELETE /matches/:id/messages` |
| デイリー | `GET /daily`、`GET /daily/answers`、`POST /daily/answers` |
| 初回デート | `GET/POST /matches/:id/date-plans`、`PATCH /matches/:id/date-plans/:planId/consent`、`POST .../reschedule`、`POST .../cancel`、`POST .../arrival` |
| 安全・異議申し立て | `POST/DELETE /users/:id/block`、`POST /users/:id/reports`、`POST/GET /appeals` |
| 通知 | `PUT/DELETE /notifications/push-token`、`GET /notifications`、`PATCH /notifications/:id/read`、`PATCH /notifications/read-all` |
| 運営 | `GET /admin/users`、`GET /admin/daily`、`GET /admin/reports`、`GET /admin/safety-flags`、`GET /admin/appeals`、`GET /admin/audit`、`GET /admin/operations/summary` |

主要なリクエスト例：プロフィールは`{ "displayName": "表示名", "age": 25, "area": "東京都", "bio": "自己紹介" }`、いいねは`{ "toUserId": "ユーザーID" }`、デイリー回答は`{ "topicId": "課題ID", "answer": "回答" }`です。撮影登録は`{ "captureSource": "in_app_camera", "stage": 0, "imageData": "data:image/jpeg;base64,..." }`を受け付けます。

段階公開は同じマッチ内で双方がメッセージした日数と、双方が回答した課題数から算出します。相互発言3日で段階1、7日と共同回答1件で段階2、14日と3件で段階3、30日と7件で段階4です。課金による解放はありません。

## 追加の安全・プライバシー機能

- 紹介条件は`relationshipGoal`、`conversationPace`、相手に求める条件、喉仏分類の希望で管理します。双方の条件が合う候補だけを紹介し、累計表示回数の少ないプロフィールを優先してローテーションします。有料優先表示の経路はありません。候補数と少ない場合の案内も返します。
- 公開画像は相手とのマッチごとに、所有者が段階と期限を指定して同意します。取り消し・期限切れは画像取得ごとに再確認されます。相手には画像を事前配布せず、認証済みの画像APIが要求時にのみストリーム配信します。閲覧履歴は所有者と運営が確認できます。
- 連絡先非表示APIは、ユーザーが同意した連絡先をサーバー秘密鍵付きHMACで照合用ダイジェストに変換し、元の電話帳情報は保存しません。登録メールと運営が確認済みの電話識別子に一致する候補を検索結果から除外します。電話識別子の登録運用は別途必要です。
- 初回デート予定はマッチ相手だけに共有し、予定、エリア、正確な場所、到着状態を個別の同意範囲として扱います。正確な場所は`DATE_LOCATION_KEY`によるAES-256-GCM暗号文として保存し、双方の同意・確認と有効期限が満たされたときだけ復号して返します。再調整、取消、到着は通知と監査ログに記録します。
- メッセージの外部リンクや投資勧誘語句を検知すると警告を返して運営確認キューに登録します。運営は警告、メッセージ削除、期限付き利用制限、見送りを選べます。利用者は異議申し立てを送信できます。
- 通知はアプリ内通知として保存し、登録済みExpo Push Tokenにはバックグラウンドキューから送信します。Expo Push Serviceが受理した時点を送信済みとして記録し、失敗時は再試行します。
- 運営キーをユーザー管理、コンテンツ、安全、監査の役割ごとに分離します。主要操作と判断を監査ログに記録します。

`.env`の`CONTACT_HASH_KEY`にはランダムな秘密値を、`DATE_LOCATION_KEY`にはBase64形式のランダム32バイト鍵を設定します。鍵を変更すると保存済みの連絡先ダイジェストとの照合や既存予定の復号ができなくなるため、鍵管理・バックアップを行ってください。

手動バックアップはAPIを停止してから実行します。

```sh
npm run backup --workspace @nodobito/api
```

DBと画像を`backups/api/`以下に保存します。復旧時はAPIを停止し、バックアップ内の`app.sqlite`を`apps/api/data/app.sqlite`へ、`captures/`を`apps/api/private/captures/`へ戻してから起動します。バックアップの世代管理や外部保管は運用側で設定してください。

### 実装範囲と制約

- 本人確認・年齢確認の申請・承認フローは廃止しています。
- 喉仏分類は`present`、`absent`、`pending`で管理します。Cloudflare版には任意のAI分類候補APIがあります。適用は利用者が確認し、性別判定は行いません。
- 画像は非公開保存し、所有者またはマッチ相手に限定して配信します。取得時に公開段階を再確認し、アクセスログを記録します。
- `captureSource: in_app_camera`はアプリからの申告値です。サーバーだけで画像が端末カメラから来たことは証明できません。
- ブロック、通報、運営による利用停止、ログインや投稿の回数制限を実装しています。Cloudflare版には運営画面とスタッフ別権限があります。画像透かし・画像内の不正検出は実装していません。
- 投資等の検知はルールベースで、誤検知と見逃しがあります。到着確認は本人の操作申告であり、GPS到着証明ではありません。画像やメッセージは共有後に保存・撮影される可能性をサーバーだけでは排除できません。
- Expo Pushの送信には端末側の通知登録、iOS/Androidのプッシュ資格情報、Expo Push Tokenが必要です。実機プッシュはExpo Goではなく開発ビルドで確認します。
- SQLiteはローカル開発用です。Node.jsの`node:sqlite`は同期APIで、実験的機能の警告が出ます。本番運用前にPostgreSQL等のサーバーDB、TLS、秘密情報管理、バックアップ、保持期間、複数インスタンスで共有するレート制限と通知キューを用意してください。

スクリーンショットをサーバー側だけで完全に防ぐことはできません。画像アクセス制御と記録は補助策です。
