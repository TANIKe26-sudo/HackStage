# Cloudflareバックエンド

## 起動と更新

本人確認・年齢確認の申請、審査、承認待ちは廃止しました。登録後、Appwriteから届く確認コードでメールを確認し、アプリ内カメラでプロフィール写真を撮影・保存し、プロフィールを入力して利用できます。写真なしのプロフィール保存はAPIでも拒否します。AI推定の実行や「喉仏あり」の結果は必須ではありません。生年は自己申告のプロフィール項目です。過去の確認テーブルは移行時のデータ保全のため残りますが、APIは参照しません。

```powershell
cd C:\github_use\HackStage
npm install
npm run d1:migrate:local --workspace @nodobito/api
npm run dev:cloudflare --workspace @nodobito/api
```

別ターミナルから `npm run start --workspace mobile -- --go --lan --clear` でExpo Goを起動します。`apps/mobile/.env.local`のAPI URLには現在のPCのWi-Fi IPとポート8787を指定します。

本番は先に `npm run d1:migrate:remote --workspace @nodobito/api`、次に `npm run deploy:cloudflare --workspace @nodobito/api` を実行します。既存の登録情報を残して追加テーブル・列を作成します。D1・秘密情報は本番環境で別途準備します。

Cloudflare版が開発対象です。`npm run dev:api`もCloudflare版を起動します。従来のExpress/SQLite版は `npm run dev:api:legacy` で起動できますが、新機能の移植先ではありません。

## 認証とメール

| API | 入力・動作 |
|---|---|
| `POST /auth/signup` | `email`, `password`（9〜128文字）, 任意の`deviceName` |
| `POST /auth/login` | 同上。停止中のアカウントにも申し立て専用のアクセスを許可 |
| `POST /auth/logout` | Bearerセッションを失効 |
| `POST /auth/password/forgot` | `email`。コード有効期間15分 |
| `POST /auth/password/reset` | `email`, `code`, `password`。コードは一度だけ利用でき、全セッションを失効 |
| `POST /api/password/change` | `password`, `newPassword`。変更後は再ログイン |
| `POST /api/email/verification` | ログイン中のメールアドレスへ確認コードを送信 |
| `POST /api/email/confirm` | `code`でメールアドレス確認 |
| `GET/DELETE /api/sessions` | 端末セッション一覧・全失効 |
| `DELETE /api/sessions/:id` | 指定端末の失効 |

### Appwrite認証

登録・ログイン・メール確認・パスワード再設定はAppwrite Authへ接続します。[設定と実機テスト](appwrite-auth.md)を参照してください。ネイティブSDKは追加せず、Expo Goから既存API経由で利用できます。確認前は `/api/me`・メール確認・ログアウト・退会・セッション管理など以外のAPIを403で拒否します。メール送信はAppwrite標準SMTPを使用し、独自ドメイン・Resendは不要です。

`POST /auth/password/forgot` の返却には `userId` が含まれます。`POST /auth/password/reset` には `email`, `userId`, `code`, `password` を送信してください。コードはAppwrite側で検証します。登録メール確認も6桁・15分です。Appwriteでは再送しても有効期限内の以前のコードは残るため、最新コードの利用を案内しつつ、旧コードを一律無効とは表示しません。

開発用の従来認証は `AUTH_PROVIDER=local` を明示した場合のみ利用できます。`MAIL_MODE=local` も設定すると従来のローカル確認コードを利用できます。本番の `APP_ENV=production` ではこの切り替えを禁止し、常にAppwriteを使用します。

## 紹介・マッチング・プロフィール

- `GET /api/me`、`PATCH /api/profile`：既存モバイルと同じsnake_caseのプロフィール項目。居住地は `prefecture_code`（JIS X 0401の2桁コード）で登録し、表示用の `area` は都道府県名にそろえます。
- `GET /api/profiles/:id`：相手の詳細。`location_scope=hidden`または`meetup`なら相手へ居住エリアを返しません。
- `GET/PUT/PATCH /api/preferences/discovery`：`acceptedPurposes`、`acceptedPaces`、`preferredClassification`、`minAge`、`maxAge`、`locationRange`。地域範囲は `null`（未設定）、`same_prefecture`、`same_region`、`anywhere`。年齢・目的など双方の条件を照合します。
- `GET /api/discover?limit=10`：表示累計の少ない相手を優先し、同じ相手への再紹介は24時間空けます。地域範囲が同じ都道府県・同じ地方の場合は、地域を公開していて指定条件に合う相手だけを候補にします。未設定・どこでもOKなら地域非公開の相手も含めます。同じ地方は北海道、東北、関東、中部、関西、中国、四国、九州・沖縄の8区分です。ブロック・非表示連絡先・利用制限も除外します。有料優先表示はありません。
- `POST /api/likes`：`toUserId`。相互いいねだけでマッチし、同じいいねによる通知・マッチの重複を防ぎます。
- `GET /api/swipes/last`：過去のスワイプ履歴から、マッチ済み・ブロック・知り合い非表示・利用停止・紹介制限の相手を除外し、最後の未マッチ候補を返します。画面の開き直し・再ログイン後もDBの履歴から復元します。右スワイプは`POST /api/swipes/undo`（`toUserId`）でこの候補の操作を取り消して戻ります。戻せる候補がなければ何もしません。既存のマッチは変更しません。
- `GET /api/likes/received`、`GET /api/matches`：受信いいね・マッチ一覧。

候補画面の操作はiOS・Android共通です。右スワイプは前のプロフィールへ戻り、戻る相手がいなければ何もしません。左スワイプはスキップです。いいねは♥ボタンから明示的に送ります。候補終了画面の右スワイプも同じ「戻る」操作です。

一覧は原則`limit`（1〜100、紹介は最大30）と`offset`に対応します。

## 会話・デイリー・段階公開

- `GET/POST /api/matches/:id/messages`：本文`body`。取得は新しい履歴から返し、返却配列は古い順。`before`で過去、`after`で新着を追加取得します。`nextBefore`/`nextAfter`が次のカーソルです。
- `POST /api/matches/:id/read`：`sequence`。既読位置は後退しません。
- `GET /api/matches/:id/events`：Bearer認証つきSSE。`changed`でメッセージ番号・件数と既読位置の変更を通知します。本文は通常APIから取得してください。約60秒ごとに再接続し、`heartbeat`は無視します。ブロック・停止・制限時は切断します。
- `DELETE /api/matches/:id/messages`：会話履歴を非表示にし、30日後に削除します。双方に反映されます。
- `GET /api/daily`、`GET /api/daily/answers`、`POST /api/daily/answers`（`topicId`, `answer`）：日本時間の今日の課題に回答します。過去・未来の課題への回答は受け付けません。
- Cloudflare版のお題は「趣味はなに？」に固定しています。日付が変わっても質問文は変わりません。日ごとに課題ID・回答・達成状況を管理し、既存の当日課題はIDと回答を保持して固定文へ置き換えます。運営画面は閲覧のみで、`POST /admin/daily-topics`による登録・変更は`409 daily_topic_fixed`を返します。
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

Workers FreeのCPU上限は1リクエスト10msのため、写真の縮小・5段階の切り出し・JPEG圧縮はExpo Go内で実行します。モバイルは長辺720ピクセル・各段階128KiB以下に調整します。撮影フレームの`regions`は0〜4段階の入れ子になった5個の`{x,y,width,height}`（0〜1の比率）です。顔・首の自動検出ではないため、公開前に段階0のプレビューを確認してください。

1. `POST /api/capture-uploads`へ`width`・`height`・`regions`を送り、`uploadId`を取得します。
2. `PUT /api/capture-uploads/:uploadId/stages/:stage`へ切り出し済みJPEGの`dataUrl`を1枚ずつ送ります。APIはサイズ・JPEGフレーム・申告寸法との整合を確認し、画素のデコードや再圧縮はしません。
3. `POST /api/capture-uploads/:uploadId/complete`で5枚の存在を確認し、全段階をまとめて公開対象にします。完了前の画像は画像APIから取得できません。
4. 中断時は`DELETE /api/capture-uploads/:uploadId`で削除します。30分の期限後は定期処理でも破棄します。退会時は下書きも削除します。

画像は非公開のD1の`image_objects`・`image_chunks`に32KiBずつ保存します。全体像は段階4の画像を参照し、追加の全体画像は保存しません。従来の1画像1,800,000バイト制限は既存画像の保存層に残ります。旧`POST /api/captures`のサーバー切り出しはローカル互換用で、本番では`capture_preparation_required`を返します。写真データの送信元や切り出し内容をサーバーだけで保証するものではなく、アプリ内カメラと公開前確認を併用します。

`GET /api/profiles/:id/captures`で閲覧できる画像IDを取得し、`GET /api/captures/:id/image`で必要な段階だけを取得します。原画像の取得APIは公開しません。取得ごとにブロック・公開同意・達成段階・期限を確認し、`no-store`で配信します。旧版で保存された画像は公開範囲が不明なため本人だけ閲覧可能です。再撮影・再投稿すると段階画像が生成されます。

`DELETE /api/captures/:id`は同じ撮影の全段階と原画像を削除します。`GET /api/captures/:id/access-history`は所有者向けの閲覧履歴です。

AI推定では、認証済みの`GET /api/classifications/throat/references`から参考例2枚を取得します（`private, no-store`）。利用者が同意したときだけ、スマホ上で左から参考例「あり」・「なし」・撮影プレビューの1184×512比較画像を作り、`POST /api/classifications/throat`へ`comparisonDataUrl`・`referenceVersion:"v1"`・`consent:true`を送ります。比較画像は各128KiB以下で、保存せずWorkers AIへ渡します。APIは`present/absent/pending`の候補を返し、適用は利用者の確認後に行います。クライアント入力を信用して性別判定・本人確認・公開権限の解放を行うことはありません。従来の`dataUrl`方式と`POST /api/captures/:id/classification`のサーバー合成はローカル互換用で、本番では`classification_comparison_required`を返します。AIや参考画像の未設定・モデル規約の未同意は503です。[準備・起動・検証手順](throat-classification.md)も参照してください。

## デート予定・プライバシー

- `GET/POST /api/matches/:id/date-plans`：予定一覧・作成。`startsAt`, `placeLabel`, 任意の`exactLocation`, `scope`, `expiresAt`。
- `GET /api/date-plans/:id`：同意に応じて情報を返します。
- `PATCH/DELETE /api/date-plans/:id/consent`：共有範囲を変更・撤回。
- `POST .../confirm`、`POST .../arrive`、`POST .../cancel`、`POST .../reschedule`。

共有範囲は`{schedule,area,exactLocation,arrival}`。正確な場所は暗号化し、双方の確認・同意・有効期限が揃ったときだけ開示します。変更時には返却された`revision`を送ると競合を検出できます。再調整では双方の確認・同意・到着をリセットします。到着は利用者による申告です。

`POST /api/contacts/hide`は`contacts`配列をHMAC化し、どちらかが非表示に登録すると、お互いの「探す」候補から除外します。検索時に照合するので、相手が未登録でも、後から同じメールで登録すると適用されます。既存のトーク・マッチ・メッセージは変更しません。双方が登録した場合は、両方が解除するまで相互非表示が続きます。端末ですでに表示中のカードは再読み込みや画面の開き直し後に更新されます。`DELETE /api/contacts/hide`で解除できます。登録メールを照合に使います。電話番号を使う運用は別途必要です。

`DELETE /api/account`または既存互換の`POST /api/account/delete`は`password`で再認証し、アカウントと関連データ・D1内の画像を削除します。監査記録と既存バックアップは保存期間まで残ります。

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
| content | デイリー課題の一覧（現在は質問固定のため登録・更新不可） |
| safety | 通報・勧誘検知・異議申し立て・期限付き利用制限 |
| audit | 監査・閲覧記録・運用状況・スタッフ権限管理 |

`GET /admin/operations/summary`で件数と送信失敗数を確認できます。監査ログは90日保持します。Workers Observabilityを有効化しています。Cloudflare管理画面でエラーアラートを設定し、必要なら`OPERATIONS_WEBHOOK_URL`へ定期処理失敗通知を送信できます。

## バックアップ・復旧

`npm run backup:cloudflare --workspace @nodobito/api`で画像BLOBを含むD1全体をSQLへ書き出します。`API_BASE_URL`と`BACKUP_ADMIN_KEY`（監査キー）を環境変数に指定すると15分有効のメンテナンス制御で書き込みを止め、完了後に解除します。API停止中は `-- --writes-stopped` も利用できます。バージョン2のmanifestにSQLのチェックサムを記録します。旧R2方式のバージョン1バックアップは、この復旧スクリプトでは拒否します。

GitHub Actionsの`Cloudflare backup`は毎日日本時間4時と手動実行に対応します。リポジトリのproduction環境のSecretsへ`CLOUDFLARE_BACKUP_API_TOKEN`（D1 export/query）, `NODOBITO_BACKUP_ADMIN_KEY`を、リポジトリのVariablesへ`NODOBITO_API_BASE_URL`を設定してください。API URL変数が未設定ならジョブはスキップします。秘密情報が不足していれば失敗し、バックアップ成功として扱いません。保存期間は7日です。バックアップ中はアプリに一時的な503が返ります。

復旧は新しい空のD1を用意して実行します。

```powershell
npm run restore:cloudflare --workspace @nodobito/api -- --input <バックアップの絶対パス> --database <新しいDB名>
```

チェックサム検証後に復旧し、確認してから本番バインディングを新しいリソースへ切り替えてデプロイします。元の本番DBへの上書き復旧は拒否します。秘密鍵はバックアップに含めないため、`SESSION_SECRET`, `CONTACT_HASH_KEY`, `DATE_LOCATION_KEY`を安全に保管してください。定期的に別DBへの復旧訓練を行ってください。

## テスト

```powershell
npm run test:cloudflare --workspace @nodobito/api
npm run typecheck:cloudflare --workspace @nodobito/api
npm run typecheck --workspace @nodobito/api
```

APIテストは画像BLOBを含むSQLiteで認証・権限・同意・期限・画像配信・ブロック・既読・再設定・削除を確認します。本番D1、実メール、実Push、AI推論、バックアップ復旧は、それぞれの実環境設定後に別途確認してください。

## 旧ローカルR2から写真を移行

APIを止めてからリポジトリ直下で次を順に実行します。本番は変更せず、元のR2写真も削除しません。1,800,000バイトを超える旧画像は移行を停止するため、別途縮小または再撮影してください。

```powershell
npm run d1:migrate:local --workspace @nodobito/api
npm run images:migrate:local --workspace @nodobito/api
npm run references:local --workspace @nodobito/api
```

移行済みのキーはスキップするため再実行できます。旧R2画像を読み取る一時設定は移行時だけ使用し、通常起動・本番にはR2は不要です。
