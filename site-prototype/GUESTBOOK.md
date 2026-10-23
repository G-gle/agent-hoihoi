現在はPhase 4実測値表示を追加済みです。[表示・状態・URL案内方針](OBSERVATION_DISPLAY.md)を優先してください。以下の未表示/Phase 4未着手という記述は以前の履歴です。

# Phase 3：承認制Guestbookの運用

2026年10月21日。対象は既存の非公開stagingのみです。
URL：<https://agent-hoihoi-staging.molamola.workers.dev/>
現在の状態・検証結果は [Phase 3検証記録](verification/2026-10-21-phase3/README.md) を参照してください。

## 動作と保存内容

通常のHTMLフォームで `POST /guestbook.html` → D1に `pending` 保存 → 303で受付ページ → 管理コマンドで承認 → 共通GuestbookのHTMLに表示します。JavaScriptは不要です。専用管理画面・公開管理APIはありません。

`guestbook_posts` はランダムUUID、UTC投稿日時、任意の名前、本文、`pending/approved` だけを保存します。新規投稿の状態はSQL内の固定値 `pending` です。投稿者の状態指定・未知のフィールド・重複フィールドは拒否します。公開SELECTは承認済みの日時・名前・本文のみ。名前なしは `Anonymous`、新しい順に最大50件、日時はUTCと表示します。HTML/Markdown/URLはプレーンテキストとしてエスケープし、改行を保持します。

フォームと受付ページは必ずWorkerを先に通し、`Cache-Control: no-store`、CSP、primary D1 sessionで取得します。Static Assetsの条件付きレスポンスを動的HTMLへ流用しません。観測処理は従来どおり独立し、対象4ページのGETと実応答ステータスだけを記録します。POST・受付・詳細ページは観測対象外です。

保存コミット成功時だけ、本文を含まない固定URLへ303リダイレクトします。成功時に発行したランダム投稿IDの短期HttpOnly Cookieと、DB内の直近10分の投稿が一致する場合だけ「受信済み・承認後公開」を表示します。Cookieなし・期限切れ・偽造・削除済みの直接訪問は「最近の投稿を確認できない」という中立表示です。再読み込みはGETなので再保存しません。応答喪失後に手動再送した場合の重複排除までは行いません。

## 初期設定と保護

変更箇所は `src/guestbook.js` の `LIMITS` です。画面の上限表示にも反映されます。

| 設定 | 初期値 |
| --- | --- |
| 任意の名前 | 80文字 |
| 必須本文 | 1〜500文字（前後の空白を除去、改行をLFへ統一） |
| URLエンコード後のリクエスト本文 | 最大8,192バイト（ヘッダーとストリームの両方で確認） |
| 受付間隔 | サイト全体で15秒に1件、承認待ち保存に成功した投稿が対象 |
| 公開一覧 | 最新50件 |
| 管理の承認待ち一覧 | 既定50件、`--limit 1〜100` |
| フォームCookie | Max-Age 1,800秒 |
| 受付CookieとDB投稿照合期限 | 600秒 |

サーバーの文字数はUnicodeコードポイント数です。ブラウザーの `maxlength` はUTF-16単位のため、一部の絵文字ではフォームの方が厳しくなります。空白のみ・制御文字・不正UTF-8/URLエンコードは400、本文過大は413、未対応の形式/圧縮は415、CSRF/送信元不備は403、連投は429（Retry-After: 15）、停止中・DB障害は503です。DB障害時に受付成功は表示しません。

連投制限は `guestbook_gate` の1行（次回受付可能なミリ秒時刻のみ）と、投稿INSERT＋更新の原子的D1 batchで実施します。同時送信でも1件だけが保存されます。IP・IP由来ハッシュ・訪問者識別子を保存しません。別の正当な訪問者も直前の投稿により一時制限される、小規模staging向けの方式です。大量GET・無効POST・継続的な妨害への包括的な防御ではありません。

外部サイトからの送信は、同一Origin/Fetch Metadata検証とdouble-submit CSRFで拒否します。CookieはSecure・HttpOnly・SameSite=Strict・Path=/、Domainなしの `__Host-` 名で、フォームの隠しトークンと一致させます。Originを送らない通常のネイティブクライアントも、GETのCookieと隠しフィールドを保持すればURLエンコードPOSTできます。JavaScript・CAPTCHA・アプリ側ログインは不要です。staging全体のCloudflare Accessは引き続き必須です。

フォームCookieのトークンはDBへ保存せず、Cookieの期限はクライアントで適用されます。受付Cookieは投稿UUIDだけで、本文・名前はURLやCookieに入れません。どちらのCookieも観測DBには保存しません。アプリログに本文・認証情報・生IP・SQL例外を出力しません。Cloudflareの基盤側の処理は従来どおり別です。

投稿本文にはアクセス生ログの90日削除を適用しません。今回は自動削除せず管理者がID指定で削除できます。投稿の保存期間、正式公開時の説明・削除依頼手順はPhase 5で決めます。

## ローカル起動

以下はすべて `site-prototype/` で実行します。Node 22以上、既存のpnpm/Wranglerを使用します。

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

<http://127.0.0.1:8787/guestbook.html> を開きます。ローカルD1とリモートD1は別です。従来のPython静的サーバーはWorkerを動かさないため、投稿・一覧の検証には使いません。テストは `pnpm test`、実HTTP配信は `node scripts/verify_worker.mjs`、記事・導線照合は `..\.venv\Scripts\python.exe scripts/verify.py` です。

## stagingへの追加反映

先に未認証HTTPでAccessが有効なことを確認し、既存の固定staging設定を使用します。D1 IDとアカウントIDは既存の `OBSERVATION.md` を参照。秘密情報ではありませんが、別のDBを代入して操作しないでください。

```powershell
node scripts/verify_access.mjs --url https://agent-hoihoi-staging.molamola.workers.dev/
node scripts/prepare_cloudflare.mjs --url https://agent-hoihoi-staging.molamola.workers.dev/ --account-id 265c8cac2bde2809bf3216e339c82d20 --database-id cbc9ae36-05b9-4862-a3ad-1ac973e1001e
pnpm db:migrate:remote
pnpm deploy
```

0003を追加し、0001/0002と観測データは保持します。生成設定の `ENABLE_DB_CHECK=false`、`ENABLE_OBSERVATION=true`、`ENABLE_GUESTBOOK=true`、preview無効、既存Cronを確認してください。Accessを解除したりDB確認APIを有効化する必要はありません。productionにはDBがなく、機能フラグもfalseです。本番作成・本番DB適用・一般公開は今回の対象外です。

## 日常の確認・承認・削除

```powershell
# ローカル（--remoteなし）
node scripts/guestbook_admin.mjs pending --env staging --limit 50
node scripts/guestbook_admin.mjs approve --env staging --id <UUID>
node scripts/guestbook_admin.mjs delete --env staging --id <UUID>

# 認証済みローカル端末から、既存非公開staging D1を操作
node scripts/guestbook_admin.mjs pending --env staging --remote --limit 50
node scripts/guestbook_admin.mjs approve --env staging --remote --id <UUID>
node scripts/guestbook_admin.mjs delete --env staging --remote --id <UUID>
```

`<UUID>` は一覧で確認した1件のIDに置き換えます。削除は承認済みにも使えます。承認は `pending` の対象だけを変更し、再承認・存在しないIDは `unchanged`、削除済みIDの再削除も0件で安全に終了します。全件削除コマンドはありません。JSON出力で対象ID・結果を確認できます。本文はJSON文字列として出力し、端末制御文字を実行させません。実データの一覧を公開の検証資料へ保存しないでください。

`--env staging` は必須で、productionは拒否します。リモートでは既知のWorker名・アカウント・D1 IDを照合します。ローカルはWranglerのDB binding、リモートはWrangler認証をメモリー内で取得してD1 REST APIへ `sql` と `params` を分離して送信します。ID・件数を含めSQL値はバインドし、投稿本文をSQL文字列へ埋め込みません。認証トークンを手でコピーしたり、公開ファイル・設定に埋め込んだりする必要はありません。認証が切れたら端末で `wrangler login` を行います。

## 受付停止・再開

受付だけ止めても、承認済み一覧・既存投稿・観測・Accessは維持します。

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.staging.json --var ENABLE_DB_CHECK:false --var ENABLE_OBSERVATION:true --var ENABLE_GUESTBOOK:false
```

停止中はフォームのボタンを無効化し、直接POSTは503です。再開は同じコマンドの `ENABLE_GUESTBOOK:true`、または通常の `pnpm deploy`。生成設定の既定はtrueなので、通常デプロイで再開することに注意してください。観測だけの停止・90日ログ削除・既存管理コマンドは [OBSERVATION.md](OBSERVATION.md) の手順を維持します。

## 残る作業

Phase 4：観測実測値の表示。Phase 5：投稿保持期間と公開運用方針。専用管理画面、返信・いいね・検索、プロフィール、AI識別、一般公開は未実装です。
観測ログ削除CronのCloudflare予定時刻での初回自動発火は引き続き未確認です。次回予定は2026年10月22日12:17 JST。ローカル手動Cron検証と区別して引き継ぎます。

実装時に確認した公式資料：[D1のSQL/paramsインターフェース](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)、[Wrangler認証トークン取得コマンド](https://developers.cloudflare.com/changelog/post/2025-12-18-wrangler-auth-token/)。認証値はコマンド内で取得し、画面や検証資料へ出力しません。
