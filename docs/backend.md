# Cloudflareバックエンド

## 起動と更新

本人確認・年齢確認の申請、審査、承認待ちは廃止しました。登録後、プロフィールを入力して利用できます。生年は自己申告のプロフィール項目です。過去の確認テーブルは移行時のデータ保全のため残りますが、APIは参照しません。

```powershell
cd C:\github_use\HackStage
npm install
npm run d1:migrate:local --workspace @nodobito/api
npm run dev:cloudflare --workspace @nodobito/api
```

別ターミナルから `npm run start --workspace mobile -- --go --lan --clear` でExpo Goを起動します。`apps/mobile/.env.local`のAPI URLには現在のPCのWi-Fi IPとポート8787を指定します。

本番は先に `npm run d1:migrate:remote --workspace @nodobito/api`、次に `npm run deploy:cloudflare --workspace @nodobito/api` を実行します。既存の登録情報を残して追加テーブル・列を作成します。D1・R2・秘密情報は本番環境で別途準備します。

Cloudflare版が開発対象です。`npm run dev:api`もCloudflare版を起動します。従来のExpress/SQLite版は `npm run dev:api:legacy` で起動できますが、新機能の移植先ではありません。

## 認証とメール

| API | 入力・動作 |
|---|---|
| `POST /auth/signup` | `email`, `password`（12〜128文字）, 任意の`deviceName` |
| `POST /auth/login` | 同上。停止中のアカウントにも申し立て専用のアクセスを許可 |
| `POST /auth/logout` | Bearerセッションを失効 |
| `POST /auth/password/forgot` | `email`。コード有効期間15分 |
| `POST /auth/password/reset` | `email`, `code`, `password`。コードは一度だけ利用でき、全セッションを失効 |
| `POST /api/password/change` | `password`, `newPassword`。変更後は再ログイン |
| `POST /api/email/verification` | ログイン中のメールアドレスへ確認コードを送信 |
| `POST /api/email/confirm` | `code`でメールアドレス確認 |
| `GET/DELETE /api/sessions` | 端末セッション一覧・全失効 |
| `DELETE /api/sessions/:id` | 指定端末の失効 |

`MAIL_MODE=local`を`.dev.vars`に設定すると、ローカル確認用のレスポンスに`code`が含まれます。本番環境では`APP_ENV=production`によりこの動作を禁止します。本番メールはResendの`RESEND_API_KEY`と、サービスで利用を認められた`MAIL_FROM`を `wrangler secret put <名前> --env production` で登録してください。未設定ではメールAPIは503を返します。メール送信先の確認機能は本人確認ではありません。通常の登録・ログインはメール確認前でも可能です。

## 紹介・マッチング・プロフィール

- `GET /api/me`、`PATCH /api/profile`：既存モバイルと同じsnake_caseのプロフィール項目。
- `GET /api/profiles/:id`：相手の詳細。`location_scope=hidden`または`meetup`なら相手へ居住エリアを返しません。
- `GET/PUT /api/preferences/discovery`：`acceptedPurposes`、`acceptedPaces`、`preferredClassification`、`minAge`、`maxAge`。空配列は条件指定なし。双方の条件を照合します。
- `GET /api/discover?limit=10`：表示累計の少ない相手を優先し、同じ相手への再紹介は24時間空けます。ブロック・非表示連絡先・利用制限を除外します。有料優先表示はありません。
- `POST /api/likes`：`toUserId`。相互いいねだけでマッチし、同じいいねによる通知・マッチの重複を防ぎます。
- `GET /api/likes/received`、`GET /api/matches`：受信いいね・マッチ一覧。

一覧は原則`limit`（1〜100、紹介は最大30）と`offset`に対応します。

## 会話・デイリー・段階公開

- `GET/POST /api/matches/:id/messages`：本文`body`。取得は新しい履歴から返し、返却配列は古い順。`before`で過去、`after`で新着を追加取得します。`nextBefore`/`nextAfter`が次のカーソルです。
- `POST /api/matches/:id/read`：`sequence`。既読位置は後退しません。
- `GET /api/matches/:id/events`：Bearer認証つきSSE。`changed`でメッセージ番号・件数と既読位置の変更を通知します。本文は通常APIから取得してください。約60秒ごとに再接続し、`heartbeat`は無視します。ブロック・停止・制限時は切断します。
- `DELETE /api/matches/:id/messages`：会話履歴を非表示にし、30日後に削除します。双方に反映されます。
- `GET /api/daily`、`GET /api/daily/answers`、`POST /api/daily/answers`（`topicId`, `answer`）：日本時間の今日の課題に回答します。過去・未来の課題への回答は受け付けません。
- `GET /api/matches/:id/progress`：双方が発言した日数と、双方が回答した課題数を計算します。連投数は条件に使いません。

| 段階 | 相互発言日数 | 共同回答数 |
|---|---|---|
| 0 | 初期 | 不要 |
| 1 | 3日 | 不要 |
| 2 | 7日 | 1件 |
| 3 | 14日 | 3件 |
| 4 | 30日 | 7件 |

`GET/POST /api/matches/:id/profile-stage`で公開同意を管理します。POSTは`stage`, `consent`, 任意の`viewerId`, `expiresAt`（最大30日）。計算上の公開段階を超える同意は拒否します。取り消しはその段階以上を一括で失効させます。

## 画像

`POST /api/captures`は`dataUrl`と任意の`regions`を受け取ります。サーバーが原画像を非公開保存し、5段階の切り出し画像を生成します。`regions`は0〜4段階の入れ子になった5個の`{x,y,width,height}`（0〜1の比率）です。指定がない場合は固定の撮影フレーム用領域を使います。これは顔・首の自動検出ではないため、実写で撮影位置を合わせ、公開前に段階0の画像を確認してください。モバイルは送信前に長辺1280ピクセルへ縮小します。サーバーは250万画素を上限にします。

`GET /api/profiles/:id/captures`で閲覧できる画像IDを取得し、`GET /api/captures/:id/image`で必要な段階だけを取得します。原画像の取得APIは公開しません。取得ごとにブロック・公開同意・達成段階・期限を確認し、`no-store`で配信します。旧版で保存された画像は公開範囲が不明なため本人だけ閲覧可能です。再撮影・再投稿すると段階画像が生成されます。

`DELETE /api/captures/:id`は同じ撮影の全段階と原画像を削除します。`GET /api/captures/:id/access-history`は所有者向けの閲覧履歴です。

`POST /api/classifications/throat`は撮影した首周りのプレビュー、`POST /api/captures/:id/classification`は所有する切り出し画像を推定します。`consent:true`が必要です。非公開R2に保存した参考例2枚との比較で `present/absent/pending` を返し、プロフィールへの適用は利用者の確認後に行います。AIや参考画像の未設定・モデル規約の未同意は503です。[準備・起動・検証手順](throat-classification.md)を参照してください。

## デート予定・プライバシー

- `GET/POST /api/matches/:id/date-plans`：予定一覧・作成。`startsAt`, `placeLabel`, 任意の`exactLocation`, `scope`, `expiresAt`。
- `GET /api/date-plans/:id`：同意に応じて情報を返します。
- `PATCH/DELETE /api/date-plans/:id/consent`：共有範囲を変更・撤回。
- `POST .../confirm`、`POST .../arrive`、`POST .../cancel`、`POST .../reschedule`。

共有範囲は`{schedule,area,exactLocation,arrival}`。正確な場所は暗号化し、双方の確認・同意・有効期限が揃ったときだけ開示します。変更時には返却された`revision`を送ると競合を検出できます。再調整では双方の確認・同意・到着をリセットします。到着は利用者による申告です。

`POST /api/contacts/hide`は`contacts`配列をHMAC化し、検索から知り合いを除外します。`DELETE /api/contacts/hide`で解除できます。登録メールを照合に使います。電話番号を使う運用は別途必要です。

`DELETE /api/account`または既存互換の`POST /api/account/delete`は`password`で再認証し、アカウントと関連データ・R2画像を削除します。監査記録と既存バックアップは保存期間まで残ります。

## 通知・安全・運営

- `POST/DELETE /api/push-devices`：`expoPushToken`。端末登録・解除。
- `GET /api/notifications`、`PATCH /api/notifications/:id/read`、`PATCH /api/notifications/read-all`。
- `POST/GET /api/blocks`、`DELETE /api/blocks/:id`。
- `POST/GET /api/reports`：`subjectId`, `category`, `details`。対応状況も取得できます。
- `POST/GET /api/appeals`：`reason`, 任意の`limitId`。利用停止中も申し立て可能です。

日本時間の当日課題・いいね・マッチ・メッセージ等で通知を作成します。Pushは送信チケットと受領結果を追跡し、再試行・無効端末削除を行います。実配信にはExpo側のプッシュ設定と端末登録が必要です。SSEや新しい管理・設定APIをモバイル画面から利用する配線は別途フロント側で行ってください。

`/admin`が運営画面です。初回は用途ごとに異なる32文字以上の`ADMIN_USERS_KEY`, `ADMIN_CONTENT_KEY`, `ADMIN_SAFETY_KEY`, `ADMIN_AUDIT_KEY`を設定してください。監査キーで初期接続し、スタッフを作成すると個別アカウントでログインできます。トークンは8時間有効で、スタッフ無効化・権限変更時に失効します。

| 役割 | 操作 |
|---|---|
| users | 利用者一覧・利用停止／再開 |
| content | デイリー課題の一覧・登録・更新 |
| safety | 通報・勧誘検知・異議申し立て・期限付き利用制限 |
| audit | 監査・閲覧記録・運用状況・スタッフ権限管理 |

`GET /admin/operations/summary`で件数と送信失敗数を確認できます。監査ログは90日保持します。Workers Observabilityを有効化しています。Cloudflare管理画面でエラーアラートを設定し、必要なら`OPERATIONS_WEBHOOK_URL`へ定期処理失敗通知を送信できます。

## バックアップ・復旧

`npm run backup:cloudflare --workspace @nodobito/api`でD1のSQLと非公開R2画像をローカルへ保存します。`API_BASE_URL`と`BACKUP_ADMIN_KEY`（監査キー）を環境変数に指定すると15分有効のメンテナンス制御で書き込みを止め、15秒待ってから取得し、完了時に解除します。途中で失敗しても期限で解除されます。DBとR2をまたぐ完全なトランザクションではないため、長時間リクエストのない時間帯に実行し、完了した`manifest.json`があるバックアップだけを利用してください。APIを停止して手動で取得する場合は`-- --writes-stopped`を指定できます。

GitHub Actionsの`Cloudflare backup`は毎日日本時間4時と手動実行に対応します。リポジトリのproduction環境のSecretsへ`CLOUDFLARE_BACKUP_API_TOKEN`（D1 export/queryとR2読み取り）, `NODOBITO_BACKUP_ADMIN_KEY`を、リポジトリのVariablesへ`NODOBITO_API_BASE_URL`を設定してください。API URL変数が未設定ならジョブはスキップします。秘密情報が不足していれば失敗し、バックアップ成功として扱いません。保存期間は7日です。バックアップ中はアプリに一時的な503が返ります。

復旧は新しい空のD1と新しいR2バケットを用意して実行します。

```powershell
npm run restore:cloudflare --workspace @nodobito/api -- --input <バックアップの絶対パス> --database <新しいDB名> --bucket <新しいバケット名>
```

チェックサム検証後に復旧し、確認してから本番バインディングを新しいリソースへ切り替えてデプロイします。元の本番DB・バケットへの上書き復旧は拒否します。秘密鍵はバックアップに含めないため、`SESSION_SECRET`, `CONTACT_HASH_KEY`, `DATE_LOCATION_KEY`を安全に保管してください。定期的に別リソースへの復旧訓練を行ってください。

## テスト

```powershell
npm run test:cloudflare --workspace @nodobito/api
npm run typecheck:cloudflare --workspace @nodobito/api
npm run typecheck --workspace @nodobito/api
```

APIテストはSQLiteとメモリ上のR2互換ストレージで認証・権限・同意・期限・画像配信・ブロック・既読・再設定・削除を確認します。本番D1/R2、実メール、実Push、AI推論、バックアップ復旧は、それぞれの実環境設定後に別途確認してください。
