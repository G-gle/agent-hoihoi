現在はPhase 4実測値表示を追加済みです。[表示・状態・URL案内方針](OBSERVATION_DISPLAY.md)を優先してください。以下の未表示/Phase 4未着手という記述は以前の履歴です。

> Phase 3追記：Guestbookは承認制投稿が稼働しました。現在の投稿運用は [GUESTBOOK.md](GUESTBOOK.md) を参照。以下の観測仕様・停止・削除手順は維持します。動的GuestbookのGETも実ステータスを記録し、POST/受付ページは対象外です。投稿本文とフォーム/受付Cookieは観測ログへ保存しません。

# Phase 2：非公開stagingのアクセス観測・運用

この文書がPhase 2の現行手順です。Phase 1の記録は当時の履歴として保持しています。
実施結果は[検証記録](verification/2026-10-21-phase2/README.md)を参照してください。
一般公開、投稿受付、公開ページへの実測値表示は行いません。

## 対象と数え方

現行URLは `https://agent-hoihoi-staging.molamola.workers.dev/`。
CloudflareダッシュボードでサブドメインとAccessのAll traffic保護を確認しました。

| URLパス | ページ識別子 |
| --- | --- |
| `/`、`/index.html` | `home` |
| `/research.html` | `research` |
| `/observations.html` | `observations` |
| `/guestbook.html` | `guestbook` |
| `/agent-traps.html` | `agent_traps` |
| `/agents-and-traps.html` | `agents_and_traps` |

2026-10-25追加：新記事2区分は追加機能の稼働後のGETだけを記録し、過去分を補完しません。`research`は従来どおり `/research.html` の区分で、一覧化前の第1弾本文へのアクセスも含みます。振り替え・複製・削除はしません。追加migration・staging実施結果・本番への後続手順は [ARTICLE_ACCESS_MEASUREMENT.md](ARTICLE_ACCESS_MEASUREMENT.md) を参照してください。本作業ではstagingデータの全消去・初期化を行いません。

上記パスを `run_worker_first` に明示し、ASSETSのキャッシュ利用時もWorkerが処理します。
`html_handling: none` を維持しています。ローカルの実Static Assetsでは `/index`、`/research`、`/observations`、`/guestbook`、`/research.html/` は404で、計測対象ではありません。新しい別名は作りません。
ルートは内部的に `/index.html` を取得し、HTTPリダイレクトせず1件です。
現行の対象経路間には3xxがありません。将来3xxになった場合、対象パスへのGETは3xxも1件、その追従先も対象ならもう1件です。301/302/304などは制御可能なローカルテストで確認しています。

Workerに到達した対象GET1回＝1件。リロード、再取得、先読み、クローラー、管理者のテストも含み、重複排除しません。
クエリを変えても同じページです。HEAD/POST/OPTIONSなど、About、完了デモ、観測詳細、静的資産、機械向けファイル、API、不明パスは対象外です。
成功・非成功とも実際の応答ステータスを記録し、静的取得が例外なら汎用500を返して記録します。
受付時刻はASSETS取得前にUTCで確定します。

件数は訪問者数、クリック数、AIの自発行動数ではありません。User-Agentは自己申告です。
Accessで遮断されたリクエスト、ブラウザキャッシュ内だけの表示、記録失敗は含められません。Cloudflare全体のアクセス件数とは一致しません。

## 保存するもの・しないもの

`page_requests`: 行ID、受付UTC日時（ISO 8601ミリ秒）、UTC日付、ページ識別子、応答status、User-Agent、流入元ドメイン。
日付は集計との外部キー用で、追加の個人情報ではありません。

- User-Agentは先頭512 Unicodeコードポイントまで。超過部分を切り捨て、欠損・空文字はNULL。
- Refererは入力8192 UTF-16コード単位までをURLとして解析。超過時は全体を不採用。HTTP/HTTPSのhostnameのみ、小文字化・末尾ドット除去。国際化ドメインはURL標準のASCII表記です。
- hostnameは253文字まで。長すぎるものは切り詰めずNULL。IPv4、IPv6、整数・16進数等から正規化されたIPリテラルもNULL。不正・欠損・未対応schemeはNULL。
- URLのパス・query・fragment・port・userinfoは保存しません。
- IP、IPハッシュ、Cookie、AccessのメールやユーザーID、認証トークン、リクエスト先完全URL、ヘッダー一式を保存しません。

Workerはパラメーター化したSQLで、日別加算と生ログINSERTをD1 batchの同一トランザクションとして実行します。
集計はDB側の `ON CONFLICT ... requests = requests + 1` で加算し、同時取得による更新消失を避けます。
一方の失敗時は全体がロールバックします。`waitUntil` で保存を管理し、失敗しても配信応答は維持します。
失敗出力は固定文字列 `page_request_write_failed` / `page_request_retention_failed` だけです。例外や個別ヘッダーは出力しません。

記録異常は、既知のテストGET前後で管理コマンドの集計と直近行を照合して確認します。
CloudflareのWorkerエラー状況も参照できます。詳細調査で `wrangler tail` を使う場合はtail権限が必要です（現在の限定OAuthには未付与）。必要時のみ適切に認証し、生リクエスト出力や認証情報を記録・コミットしないでください。通常の全リクエストログを有効化する必要はありません。

## 90日保存と集計

追加migrationは `0002_page_requests.sql`。
`page_request_daily` はUTC日付＋6区分の件数だけを期限なしで保存します。追加migrationは `0004_article_page_requests.sql`（適用済み0002は変更しません）。生ログから全期間の集計を再生成・上書きしません。
生ログから集計への外部キーはON DELETE CASCADEです。集計行を消すと対応する生ログも消えます。生ログだけを消しても集計は残ります。

日次Cronは **03:17 UTC（12:17 JST）**、`17 3 * * *`。
実行時の現在UTCから90×24時間を引き、`received_at < cutoff` の生ログだけ削除します。境界と同時刻は残します。
日時インデックスを使用し、集計は削除しません。何度実行しても安全です。
通常は90日境界を越えてから次の日次実行まで最大約24時間遅れます。実行失敗・スケジュール障害ではさらに遅れるため、必要に応じ手動pruneを実施します。
スケジュール設定済み・ハンドラー検証済み・Cloudflareの実時刻発火確認済みは別です。今回の実施状況は検証記録に記載します。

毎回の書込は2 SQL、削除は日次1 SQL。新規依存や有料サービスを追加していません。
無料枠を超えない保証はせず、CloudflareのD1/Workers使用量と保存容量を定期的に確認してください。

## 管理コマンド

以下は `site-prototype/` で実行します。Node.js 22以上、既存WranglerとそのOAuth認証を使います。
`pnpm observe` は `node scripts/observation_admin.mjs` と同じです。pnpmが既存node_modulesの再構築を求める環境では直接nodeを使えます。

```powershell
# UTCの日別・ページ別。日付は両端含む、1〜366日、最大1000行（既定100）。
node scripts/observation_admin.mjs daily --env staging --remote --from 2026-10-21 --to 2026-10-21 --limit 100

# 同期間の直近行。日時・ページ・status・UA・referrer_domain、降順。
node scripts/observation_admin.mjs recent --env staging --remote --from 2026-10-21 --to 2026-10-21 --limit 20

# 現在UTCの90日前より古い生ログだけ。集計は保持。
node scripts/observation_admin.mjs prune --env staging --remote

# stagingの観測テスト記録を全期間・全件削除。集計を消し外部キーで生ログも原子的に削除。
# environment_check、migration管理、その他のテーブルは触らない。
node scripts/observation_admin.mjs clear-staging --env staging --remote --confirm agent-hoihoi-staging-db
```

`--remote` を省略するとローカル専用DBです。`--env staging` は必須です。
出力JSONのenvironment/location/database/database_idで対象を確認します。
`result[].results` が結果行。`day` はUTC、`requests` は保存済み件数、NULLは欠損・不採用です。行がないことは欠測なしの0件を保証しません。
期間・上限を狭めた出力により全期間が表示されない場合があります。

リモートは次の既知staging三点をスクリプトで固定照合します。任意のconfig/SQL/DB名やproduction環境は指定できません。

- アカウント `265c8cac2bde2809bf3216e339c82d20`
- Worker `agent-hoihoi-staging`
- D1 `agent-hoihoi-staging-db` / `cbc9ae36-05b9-4862-a3ad-1ac973e1001e`

Wrangler CLIにはSQLのbind指定がないため、閲覧コマンドは厳密検証した実在日付と整数だけをSQLへ組み込みます。任意入力文字列を受け取る機能はありません。子プロセスはshellを使いません。
認証トークンやCookieをコマンド、チャット、検証記録に貼りません。
`clear-staging` は本番を扱えず、全期間の観測テストデータだけを消します。今回のstagingデータはすべてテスト扱いです。

## 配置と再検証

Phase 1のAccess事前確認を維持し、同名Worker/D1を再作成せず更新します。

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply agent-hoihoi-staging-db --local
node --test tests/*.test.mjs
..\.venv\Scripts\python.exe scripts/render_research.py --check
..\.venv\Scripts\python.exe scripts/verify.py

node scripts/prepare_cloudflare.mjs --account-id 265c8cac2bde2809bf3216e339c82d20 --database-id cbc9ae36-05b9-4862-a3ad-1ac973e1001e --url https://agent-hoihoi-staging.molamola.workers.dev/
node node_modules/wrangler/bin/wrangler.js d1 migrations apply agent-hoihoi-staging-db --remote --config .cloudflare/wrangler.staging.json
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config .cloudflare/wrangler.staging.json
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.staging.json
```

生成設定のトップレベルがstagingです。`env.production` は別Worker・DBバインディングなし・観測false・Cronなし・workers.dev無効・preview無効の未構築枠です。本番へは配置しません。
Wranglerが複数環境の警告を出す場合も、表示されるWorker・DB・フラグを照合します。

ローカルHTTP検証：

```powershell
node node_modules/wrangler/bin/wrangler.js dev --local --ip 127.0.0.1 --port 8787 --test-scheduled
# 別ターミナル。ローカル観測データを削除してfixture検証、終了時も整理する。
node scripts/verify_observation_local.mjs
node scripts/verify_worker.mjs --db-check off
..\.venv\Scripts\python.exe scripts/verify.py --url http://127.0.0.1:8787/
```

配置後は認証済みブラウザで対象GETを実行し、実D1の前後差分を確認します。
`verify:access` でCookieなしの別クライアントから7ページ・資産・APIが遮断されることも確認します。
`scripts/verify_observation_remote.mjs snapshot <英数字ラベル>` は個別UAを出さない集計証跡を保存します。
同スクリプトの `retention` は既知stagingの2000-01-01専用fixtureで手動削除2回・集計保持・fixture整理を検証します。当日データを変更しないことも照合します。

## 計測のみ停止・再開

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.staging.json --var ENABLE_OBSERVATION:false
```

サイト配信、Access、既存DBを維持して新規記録だけ止めます。90日削除Cronは継続します。
再開は通常の `deploy --config .cloudflare/wrangler.staging.json`（true）です。
公開説明も停止状況に合わせ必要箇所だけ調整してください。DB削除やprobeへの切替は計測のみの停止には不要です。

## 将来の本番DB分離

今回、本番DBも本番Workerも作成しません。本番用は別名の新規D1を作り、UUIDがstagingと異なることを確認し、専用設定へ明示バインドします。
stagingのUUIDをコピーせず、設定欠損時の代替接続も設けません。migrationは空の本番DBへ適用し、stagingの生ログ・集計・fixtureは移しません。
正式公開前に本番の観測両テーブルが空であることと、本番にテスト記録を残さない方針を確認します。
本番アクセスの管理者自動除外は未実装であり、任意query/headerによる免除もありません。
公開・Access解除は別途の作業です。

## 実装時に確認した公式資料

- [D1 batchのトランザクション](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Static Assets HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [Cron TriggersとUTCスケジュール](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
