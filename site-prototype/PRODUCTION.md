# 本番準備・正式公開の手順

2026-10-23。本書は今回の本番準備結果と、正式公開の指示後に使う手順です。今回実施したリモート変更は専用D1の作成と既存3 migrationの適用だけです。本番Worker作成・デプロイ・Access変更・公開経路の有効化は未実施です。旧Phase文書の「本番DB未作成」「本番管理CLI非対応」「試験アクセスを残さない」は本書で更新します。

## 対象

| 項目 | 本番 | staging（維持） |
| --- | --- | --- |
| Worker名 | `agent-hoihoi-production`（未作成） | `agent-hoihoi-staging` |
| URL | `https://agent-hoihoi-production.molamola.workers.dev/`（候補） | `https://agent-hoihoi-staging.molamola.workers.dev/` |
| D1名 | `agent-hoihoi-production-db` | `agent-hoihoi-staging-db` |
| D1 UUID | `2fe64ba8-21cb-4cc5-8231-93cee3d9d528` | `cbc9ae36-05b9-4862-a3ad-1ac973e1001e` |
| 配置用設定 | `.cloudflare/wrangler.production.json` | `.cloudflare/wrangler.staging.json` |
| 配信コピー | `.cloudflare/production/public/` | `.cloudflare/public/` |

共通アカウントIDは `265c8cac2bde2809bf3216e339c82d20`、現在のworkers.devサブドメインは `molamola`。公開識別子は `scripts/deployment_targets.mjs` に固定しています。認証値は含みません。

開始時HEADは `c22b5851993f8943dfc0ef9d05af9d5d1c066cbe`。Worker一覧にはstagingだけがあり、配信Versionは `f77d9c79-8c5e-4095-bd90-72f383ff35ea`（100%）でした。本番D1は存在しなかったため1つ作成しました。

指示書の初期候補 `agent-hoihoi.molamola.workers.dev` と同名のWorkerもありませんでしたが、既存 `wrangler.jsonc` の本番名 `agent-hoihoi-production` を優先して上記候補に揃えました。名前の予約・将来の利用可能性の保証はしていません。正式公開直前にWorker一覧・用途・サブドメインを再照合し、別用途で使われていたら上書きせず停止します。候補を変更する場合は対象定義・生成物・手順を一緒に更新して再度dry-runします。

## D1初期化済み

作成後と適用直前の両方でUUID・名前をAPI照合し、`_cf_KV` 以外のテーブルがないことを確認しました。staging UUIDとの差も照合しています。

既存の `0001_environment_check.sql` → `0002_page_requests.sql` → `0003_guestbook.sql` をWrangler migrationsで順に適用しました。内容変更・データ移植・独自SQLの追加はありません。適用履歴は3件。観測生ログ0、日別集計0、投稿0、環境確認行0。`guestbook_gate` はmigration由来の1行（id=1、next_allowed_at=0）です。stagingの受付状態はコピーしていません。Cloudflare内部管理行とmigration履歴は訪問・投稿件数に含めません。

既に初期化済みなので、公開手順でDBの作り直しやデータ消去は行いません。新しいmigrationの追加は別の作業です。

## 配信物の生成と確認（ローカル）

以下のコマンドは `D:/Users/molamola/app/Agent-hoihoi/repository/site-prototype` で実行します。

```powershell
node scripts/prepare_cloudflare.mjs --env production --url https://agent-hoihoi-production.molamola.workers.dev/ --account-id 265c8cac2bde2809bf3216e339c82d20 --database-id 2fe64ba8-21cb-4cc5-8231-93cee3d9d528
node --test tests/environments.test.mjs
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config .cloudflare/wrangler.production.json --outdir .cloudflare/production/dry-run
```

`--env` はprepareスクリプトの選択です。Wranglerにはstandaloneの生成済み設定を渡し、`--env production` は付けません。元の `wrangler.jsonc` 内の無効化された本番雛形は、引き続き配置用には使いません。既存 `pnpm deploy` の宛先はstagingのままです。

生成設定は本番専用DB binding、`ENABLE_DB_CHECK=false`、`ENABLE_OBSERVATION=true`、`ENABLE_GUESTBOOK=true`、Cron `17 3 * * *`（03:17 UTC / 12:17 JST）、preview無効です。`workers_dev=true` は正式公開時に使う設定で、ファイル生成やdry-runだけでは経路を有効化しません。今回この設定をデプロイしていません。

基準は最終版 `public/` の13ファイル。7 HTML、CSS、JS、SVG、robotsはバイト一致でコピーします。差分は3 URLのsitemapと、llms末尾の環境注記のみです。llmsのstaging専用文を `Production site: https://agent-hoihoi-production.molamola.workers.dev/` に置き換え、既存5導線と本文を保持します。source public、site.config.json、Research全文、AI主体のフッター、HTML/CSSは変更しません。canonicalも追加しません。robotsのAllowを維持し、生成物中のlocalhost・staging参照を拒否します。

prepareの既定は従来どおりstagingです。本番の生成ではstagingの設定・probe・配信コピーに書き込みません。環境選択・アカウント・本番DB UUID・候補URLが一致しない指定や、本番probe生成は拒否します。生成コピー・dry-run出力はGitに含めません。

## 本番の管理コマンド（正式公開後）

CLIは `--env production --remote` の両方を要求します。設定内のWorker名・アカウント・DB binding名・DB名・UUIDを環境ごとの固定値と照合してから認証・接続します。環境省略・略称・オプション重複・productionのローカル代替は拒否します。staging用 `clear-staging` は本番では実行できません。投稿SQLのパラメータ分離とID単位の操作を維持しています。

```powershell
# 投稿の一覧から、今回の対象IDと本文を照合する
node scripts/guestbook_admin.mjs pending --env production --remote --limit 50
# 次の値は確認した投稿UUIDに置換してから実行する
$postId = '確認した1件の投稿UUID'
node scripts/guestbook_admin.mjs approve --env production --remote --id $postId
node scripts/guestbook_admin.mjs delete --env production --remote --id $postId

# UTC日付を実施日に置換して集計・記録を確認する
node scripts/observation_admin.mjs daily --env production --remote --from 2026-10-23 --to 2026-10-23 --limit 100
node scripts/observation_admin.mjs recent --env production --remote --from 2026-10-23 --to 2026-10-23 --limit 20
```

一覧・直近ログには実データが含まれるため、公開資料へ保存しません。トークンの手作業コピーは不要です。Wranglerの既存ローカル認証をメモリー内で利用します。本番への試験投稿・承認・削除は今回実行していません。

停止操作も正式公開後に必要な場合だけ実行します。先に次のローカル照合を実行し、失敗した場合はデプロイへ進みません。

```powershell
node --input-type=module -e "import {readTargetConfig} from './scripts/deployment_targets.mjs'; await readTargetConfig('production'); console.log('production target verified');"
```

```powershell
# 観測だけ停止：投稿受付は継続し、既存DB・日次削除Cronも維持
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json --var ENABLE_DB_CHECK:false --var ENABLE_OBSERVATION:false --var ENABLE_GUESTBOOK:true

# 受付だけ停止：承認済み一覧・既存投稿・観測は維持、POSTは503
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json --var ENABLE_DB_CHECK:false --var ENABLE_OBSERVATION:true --var ENABLE_GUESTBOOK:false

# 両方停止（必要時）
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json --var ENABLE_DB_CHECK:false --var ENABLE_OBSERVATION:false --var ENABLE_GUESTBOOK:false

# 両方再開：設定の既定値で再配置する
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json
```

これらはWorkerを再デプロイする操作です。停止中に通常デプロイすると両フラグがtrueに戻ります。1種類だけ再開する場合は、他方の現在の停止状態も明示してください。Access例外は独立した設定なので停止・再開時に再変更しません。今回停止操作は行っていません。

## Access：本番だけ一般公開する順序（未実施）

現在の管理画面で、アカウント全体のAccessが「有効」、スコープが「すべてのトラフィック」、認証ポリシーが「Cloudflare アカウント／許可」、セッション24時間であることを読み取りました。stagingにはこの保護を維持します。

正式公開の指示後、次の順で実行します。

1. Workers & Pagesのアカウント全体Accessが有効・全トラフィックのままであることを再確認する。Zero Trust > Accessコントロール > アプリケーションで、全Workers保護アプリの対象・ポリシーと、より優先されるhostname/pathルールの有無を確認する。前回の全WorkersアプリIDは `d12863a9-d32c-4d26-a61e-a218ece0b794`。対象を再読して一致を確かめ、全体ルールは編集・無効化・削除しない。
2. 下記の正式公開用コマンドで本番だけをデプロイする。新しいWorkerもまず既存の全Workers保護を継承する。認証済みブラウザで本番を確認し、Cookie/Authorizationなしの別クライアントで本番・stagingがともにAccessに遮断されることを確認する。この保護が確認できなければ次へ進まない。
3. Workers & Pages > **agent-hoihoi-production** > Accessで、アカウント保護をバイパスして「このWorkerを公開する（Make this Worker public）」を選ぶ。適用先が本番Workerだけであることを確認して確定する。全Workersカードの無効化は使わない。生成されるWorker単位の例外はdestination `type=worker`、`worker_id=今回作成された本番Workerの実ID`、policy `decision=bypass`、Include Everyoneに対応する。stagingやall_workers、ワイルドカードは対象にしない。Worker名と実IDを混同せず、作成後の例外アプリIDを戻し用に記録する。
4. Cookie/Authorizationのない新しいHTTPクライアントで、本番7ページと資産がAccessに止められず到達することを確認し、stagingは引き続きAccessへリダイレクト／遮断されることを確認する。stagingにサイト本文が出た場合は直ちに本番例外を戻し、全Workers保護を確認する。hostname/pathルールが本番を別に保護していた場合も、全体保護を外す操作へ進まず、その一致対象を調べる。
5. 戻す場合は本番WorkerのAccess画面で公開バイパスだけを解除するか、記録した本番限定の例外アプリだけを削除する。全Workers保護は残っているため本番も再びその認証を継承する。未認証で本番・stagingの両方が止まることを確認する。D1・投稿・観測データを削除しない。

Cloudflare公式の [全Workers保護下で特定Workerを公開する手順とルール優先順位](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#make-a-worker-public-when-all-workers-are-protected) を2026-10-23に確認しました。Worker単位の例外がアカウント保護より優先され、hostname/pathルールはさらに優先されます。本番Workerが未作成のため、その画面の実際のラベルと実IDは正式公開時に照合します。今回は例外作成も実施していません。

## 正式公開の実行と短い確認（次の作業）

最初に対象・現在のGit差分・生成物・D1状態・All Workers保護を再照合します。D1初期化は繰り返しません。上記の生成とdry-runが成功した後、正式公開の指示の範囲内でのみ次を実行します。

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json
```

このコマンドが本番Workerを作成し、設定済みのURL・Cron・bindingを有効化します。配信Versionを記録し、Accessは上記の順序で本番限定の例外を設定します。

- 未認証で `/`（`/index.html`も）、`/research.html`、`/about.html`、`/observations.html`、`/guestbook.html`、`/guestbook-complete.html`、`/observations-detail.html` に到達することを確認する。HTML本文・主要導線を確認し、CSS・SVG・JS・robots・sitemap・llmsも確認する。
- stagingは未認証の別クライアントで引き続き遮断されることを確認する。認証済みブラウザの表示だけで判定しない。
- 本番で識別できる試験文を1件だけ投稿し、保存とpending一覧のID・本文を照合する。公開一覧にはまだ出ないことを確認し、上記CLIでそのIDを承認して表示を確認し、同じIDだけを削除して消えたことを確認する。生のID・本文を公開レポートへ転載しない。全件削除やstaging投稿のコピーはしない。
- 対象ページGETの前後で集計・直近記録を照合する。公開確認・管理者の少数のアクセスも通常どおり記録される。自動除外や既存ログの全件削除は行わない。Accessで遮断されたアクセスとPOST・受付・詳細・資産は観測対象外。
- sitemapが本番3 URL、llmsの環境注記が本番URLかつ5導線を維持していること、robotsが許可、主要リンクが本番内で整合することを確認する。Contactは運営者の確認済みとして再検証しない。

準備段階の変更範囲のテストは環境ガード・prepare分離・管理接続先です。F-01（完了ページの固定受信表示）、F-03（Research生成元aria-label差）は受容済みのまま保持し、テスト期待値を変更しません。Researchを再生成しません。既存の全監査がすべて成功したという意味ではありません。Cronの自然な定刻実行は公開後の低優先確認で、公開前の修正条件に戻しません。

## 今回の検証結果

- 新規の環境テスト4件と、既存の管理コマンド単体テスト1件が成功。環境省略・重複・混在UUID・本番ローカル・本番全件消去を拒否し、偽の認証CLIとmock通信による本番接続先の照合を実施しました。本番への投稿・承認・削除は実施していません。
- c22b585時点のprepare、変更後の既定prepare、既存staging生成物の設定・配信物・probeは全バイト一致。本番13ファイルのうち差分はsitemapとllmsの上記環境注記のみ。source public全13ファイルは不変です。
- 実際の本番生成設定と配信コピーでWrangler dry-runが成功。DB binding、無効のDB確認API、有効の観測・受付を確認しました。認証権限を持たないダミーtokenでローカルbundlingだけを実施しました。
- 終了時のリモートWorkerはstagingだけで、配信Version・設定は開始時と一致。stagingの生ログ112件、日別行11件、既存投稿2件、受付gate値は開始時から不変。本番の生ログ・日別行・投稿は0件のまま。未認証staging GETは302でCloudflare Accessへ遷移しました。
- Access管理画面の確認は読み取りだけです。全体保護は有効・全トラフィックのまま保持。Contact、F-01、F-03、低優先のCron確認に新たな必須修正はありません。
