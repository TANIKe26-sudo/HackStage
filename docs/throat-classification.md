# 喉仏の写り方をAPIで推定する

ユーザー提供の2枚を、1枚目=`present`（局所的な突出が見える例）、2枚目=`absent`（突出が目立たない例）として比較に使用します。2枚でモデルを学習する仕組みではありません。新規画像の精度は別の評価用画像で検証する必要があります。

## 実装

- `POST /api/classifications/throat`：ログイン済みユーザーの撮影プレビューを一時的に受け取り、推定します。
- `POST /api/captures/:id/classification`：自分が所有する首周りの切り出し画像を推定します。
- どちらも `consent: true` が必要です。対象画像やAIの生の回答はログへ保存しません。直接推定APIの対象画像はR2にも保存しません。
- Workers AIの `@cf/meta/llama-3.2-11b-vision-instruct` に、左=ありの参考例・中央=目立たない参考例・右=判定対象の3パネル画像を渡します。縦横比を保持し、衣服・背景・肌色・ほくろなどの一致を判断基準にしないよう指示します。
- 結果は `present` / `absent` / `pending`。不鮮明、遮蔽、判定対象部位が写っていない、曖昧な回答・不正なJSONは `pending` にします。設定不足やAI接続失敗は503で返し、正常に推定できたふりをしません。
- `absent` は画像上で突出が目立たないという意味で、身体的に存在しないことの証明ではありません。性別・年齢・本人確認には使いません。
- 推定だけではプロフィールを書き換えません。撮影プレビューで結果を確認して写真を採用し、その後プロフィールの完了操作で保存します。

```json
{
  "dataUrl": "data:image/jpeg;base64,...",
  "consent": true
}
```

正常応答の例（これは仕様例であり実画像の推定結果ではありません）：

```json
{
  "classification": "present",
  "reason": "visible_prominence",
  "requiresUserConfirmation": true,
  "referenceVersion": "v1",
  "source": "workers-ai-reference-comparison"
}
```

## 参考画像の準備

リポジトリ直下で実行します。元画像は変更せず、長辺720pxの参考JPEGを `apps/api/private/throat-references/` に作成します。このディレクトリはGit管理外です。元画像・生成画像をコミットしないでください。

```powershell
npm run references:prepare --workspace @nodobito/api -- --present "C:\path\present.png" --absent "C:\path\absent.png"
npm run references:local --workspace @nodobito/api
```

ローカルR2の `system/throat-references/v1/present.jpg` と `.../absent.jpg` に登録します。写真取得APIへ公開するレコードは作りません。実際の写真やローカルパスはリポジトリへ含めないため、別の開発者の環境では本人の許可のある方法で参考画像ファイルを渡すか、それぞれの許可済みサンプルを用意します。

## Workers AIの有効化

このモデルの利用には、Cloudflareアカウント上で[Metaのライセンスと利用ポリシーへの同意](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/)が必要です。実装・開発スクリプトは同意リクエストを自動送信しません。規約を確認した本人がCloudflare側で同意を完了してください。未同意の場合は `classification_model_license_required` を返します。

Cloudflareへログインし、モデルを利用できる状態になったら、通常のAPIを止めて以下で起動します。

```powershell
npm run dev:cloudflare:ai --workspace @nodobito/api
```

生成した一時設定ファイルでAIだけをリモート接続し、D1・R2はローカルに固定します。`wrangler dev --local` はAIへのリモート接続まで無効にするため、このコマンドでは指定しません。生成設定はGit管理外で、通常終了時に削除します。

AI推論はローカル起動時でもCloudflare上で実行され、アカウントの利用枠・料金が適用されます。[Workersのローカル開発](https://developers.cloudflare.com/workers/local-development/)

スマホのAPI URLは通常と同じPCのWi-Fi IP・8787です。AI未設定の通常APIでも登録・ログインは使えますが、AI推定は503になります。

別ポートでAIだけ試す場合：

```powershell
npm run dev:cloudflare:ai --workspace @nodobito/api -- --port 8788
```

本番では `wrangler.jsonc` の `env.production` に `"ai": { "binding": "AI" }` を追加し、以下で参考画像を本番の非公開R2へ登録したうえでAPIをデプロイします。この変更では本番へのアップロード・デプロイを実行していません。

```powershell
node apps/api/scripts/upload-throat-references.mjs --remote
```

参考画像はユーザーの撮影レコードとは別のシステム用オブジェクトです。バックアップ・他環境への移行時は、非公開の参考JPEGとチェックサムのmanifestも別途保管してください。

## 動作確認

```powershell
npm run test:cloudflare --workspace @nodobito/api
npm run classification:evaluate:local --workspace @nodobito/api
```

前者はモデルをモックしたAPI契約・同意・所有権・画像のパネル順序・不正回答時の保留などのテストです。後者は8788のローカルAPI経由で実際にWorkers AIへ接続し、参考画像自身を対象にして疎通確認します。一時アカウントは終了時に削除します。参考例と同一画像を使うため、この結果を未知画像への精度として扱ってはいけません。

規約同意後の実接続で、モデルがJSON指定にもかかわらず `**Classification:**`、`**Visibility:**`、`**Reason:**` の3行のMarkdownを返すことを確認しました。この完全な形式も許可された値のみ解析します。不完全・余分な文章・不明な値は引き続き保留にします。生のモデル回答や対象画像をログへ保存しません。

2026-11-18の疎通確認では参考画像2枚とも有効な応答を取得できましたが、両方を `present` と推定し、ユーザー指定の `absent` 例を誤判定しました。応答形式の修正は精度の保証ではありません。分類モデル・比較方式の精度改善は残っています。2枚を正解にするために判定結果を固定する処理はありません。
