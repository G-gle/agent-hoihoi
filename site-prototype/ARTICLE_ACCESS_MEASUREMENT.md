# 記事別アクセス計測 — 実装・staging検証記録

最新状態（2026-10-25 JST）：本番0004 migration・Worker配置・公開後検証を完了。本番Versionは `f717fdb7-dbd7-494a-900d-2c6dda6859b5`、配信100%。結果・検証アクセス・Git保存は末尾の「本番反映記録」を参照。

初回実装時点の履歴：実施日2026-10-25 JST（2026-10-24 UTC）。この時点ではローカル実装と既存stagingへのmigration・配置・検証まで完了し、本番DB migration・本番deploy・本番への試験GET・投稿は未実施だった。以下のstaging記録は当時の事実として保持する。

## 開始状態と変更範囲

- ブランチ：`implement-v1`、開始HEAD：`5330dd9bd06772ab44ea724eb70ec1786852f1e7`。`git fetch origin implement-v1`後、HEADとoriginのahead/behindは0/0。強制reset・merge・commit・push・PR・タグ作成は行っていない。
- 作業場所：`D:/Users/molamola/app/Agent-hoihoi/repository/site-prototype`。適用されるAGENTS.mdは、親ディレクトリ群とリポジトリ内を確認した範囲では存在しなかった。
- 開始時の無関係な変更：リポジトリ直下の`README.md`、`SECURITY.md`、`docs/V1_SPEC.md`。未追跡の`.gitignore`、`app/`、`data/`、`docs/ACCEPTANCE.md`、`docs/OPERATIONS.md`、`docs/REVIEW_FIXES.md`、`pyproject.toml`、`requirements*.txt`、`templates/`、`tests/`、既存`site-prototype/verification/`を保持した。
- 今回の変更：`src/observation.js`、`src/observation_view.js`、`migrations/0004_article_page_requests.sql`、`wrangler.jsonc`、観測・環境テスト3ファイル、`public/observations-detail.html`、`public/llms.txt`、`public/assets/style.css`、`scripts/verify_access.mjs`、検証スクリプト3本、`OBSERVATION.md`、`OBSERVATION_DISPLAY.md`、本書と新規検証記録。
- `worker.js`、prepare両スクリプト、管理CLI、記事本文・Research一覧・Home・About・ゲストブック・メール通知実装は変更していない。prepareの既存PAGE_PATHS参照だけで生成物に新規経路が入ることを確認した。
- 後続のResearch完了資料は指定名ではローカルに見つからなかったが、現行HEADのResearch構成と`Agent_Hoihoi_Mail_Notification_Completed_20261023.md`を確認し、旧運用資料の「本番未構築」「通知未実装」等を現状と混同していない。Cronの定刻実行は再調査・手動起動していない。

## 計測と表示

| pathname | page | 詳細の英語ラベル |
| --- | --- | --- |
| `/`、`/index.html` | `home` | Home |
| `/research.html` | `research` | Research |
| `/observations.html` | `observations` | Field observations |
| `/guestbook.html` | `guestbook` | Guestbook |
| `/agent-traps.html` | `agent_traps` | Article 1: Agent traps |
| `/agents-and-traps.html` | `agents_and_traps` | Article 2: Agents and traps |

既存の共通処理で対象GETのみを非同期記録する。実レスポンスstatus、UTC受信日時・日付、UA上限、参照元ドメイン、日別加算＋生ログの同一batch、並行加算、失敗時も閲覧応答を返す動作、観測フラグ、90日生ログ削除と集計保持を維持した。pathname判定なのでquery付きも同じ区分となり、queryや完全URLを追加保存しない。新たな訪問者識別・投稿との紐付けはない。

詳細は1本のSELECTとprimary sessionで、6区分の全期間累計・取得時点・直近30 UTC暦日を同じsnapshotから取得する。概要の主表示は概要自身の累計のまま。全体の未測定・停止・取得失敗は維持し、既存4区分にデータがあれば記事未記録でも全体を未測定にしない。

記事区分で日別行がなければNULLを維持し、累計は`No retained records`、日別は`—`とする。最初の記録日から開始日を推定せず、開始前を測定済みゼロとして表示しない。日付のゼロ埋めもしない。既存4区分の0とその限界の説明は維持した。

公開注記：

> Separate article counts cover requests recorded since this feature was enabled, with no historical backfill. Research totals refer to /research.html, including Article 1 before that URL became the research index.

> An article dash (—) means no retained count, not a measured zero. It can include dates before separate article recording began; neither a dash nor the first record establishes activation time.

`research`の過去分には一覧化前の第1弾本文へのリクエストが含まれる。データの振り替え・複製・削除・過去分補完は行っていない。稼働日時はページ内に断定表示していない。

6区分に合わせて観測表だけ最小幅800px・単語途中の改行抑制へ調整し、既存の横スクロール領域、regionラベル、tabindex、見出しを維持した。ローカル1280pxは表1080pxで収まり、390pxは領域335px内で横スクロールする。stagingの実viewport366pxでも文書幅351pxで全体の横はみ出しはない。キーボードArrowRightで表にフォーカスしたままscrollLeftが増えることを確認した。

## migration・保全・原子性

追加ファイル：`migrations/0004_article_page_requests.sql`。適用済み0001〜0003は変更していない。

1. 6区分CHECK付きの新親テーブルと、その新親を参照する新子テーブルを作成する。
2. 親の全日別値、生ログの全列（ID、NULL、UA、参照元を含む）をコピーする。
3. 旧子→旧親の順でDROPする。新子の参照先は新親なので、この時点で連鎖削除されない。
4. 新親→新子の順で正式名へRENAMEし、日時索引を再作成する。FK参照先が正式名になり、ON DELETE CASCADEも維持される。

外部キー検査の無効化・遅延だけに依存しない。現行スキーマに他の参照テーブル・独自trigger等がないことをstagingで事前確認した。将来スキーマが増えた場合は同じ前提を再確認する。テーブルのコピー中は一時的に追加容量が必要であり、D1容量・実行時間上限や一時的なリクエスト失敗の可能性を本番直前にも確認する。

Wrangler **4.151.3**はmigration本文と管理行INSERTを同じqueryへまとめる。ローカルではD1 batch、リモートではD1 query APIで実行することをインストール済みCLIで確認した。公式の[migrations apply仕様](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply)は、失敗したmigrationのロールバックと、それ以前に成功したmigrationの保持を明記している。[D1 API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)は複数SQLをbatchとして受け付ける。[外部キーの公式仕様](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)と[CASCADEの注意点](https://developers.cloudflare.com/d1/sql-api/sql-statements/#pragma-defer_foreign_keys--onoff)も確認した。

ローカルの実Wranglerで旧表DROP・RENAME後に故意のCHECK違反を発生させ、全データ・schema・索引・migration管理行が適用前に戻ること、正常ファイルで再実行できることを検証した。リモートに故意の失敗を投入する試験は行っていない。リモートの原子性判断は上記公式契約・実CLI経路と、stagingでの正常適用・全保存値照合を根拠とする。SQL断片を個別コマンドで順番に手作業実行する運用は避ける。

| 検証 | 結果 |
| --- | --- |
| 空の隔離ローカルD1 | 全4migration適用、FK検査0件 |
| 旧3件適用済みfixture | 既存4区分・複数日・同日複数区分・集計のみの古い行を含む日別5行、生ログ4行を全保存値で照合 |
| ID・欠損値 | 生ログID 7/19/42/103、UA/参照元のNULL・空文字・statusを保持 |
| 投稿・gate等 | fixtureの投稿・gate・environment_checkと既存migration行を保持 |
| FK・索引・制約 | 複合主キー、正式親を参照する2列FK、CASCADE、日時索引、新規区分CHECKを確認 |
| 旧コード互換性 | 旧snapshot SQLと旧記録SQLが拡張schemaで動作。実stagingでも旧版詳細・Research GETが正常 |
| 失敗注入 | 後半CHECK違反で全変更ロールバック、正常ファイル再実行成功 |
| staging | 日別13行、生ログ125行、投稿2行、gate1行の全保存値・IDがmigration前後で完全一致。FK検査0件 |

stagingでは最初のmigration要求が認証エラー7403で停止した。未適用一覧を読み直して0004が未適用であることを確認し、同じ既存認証で再実行して成功した。Accessや認証権限は変更していない。

退避先はGit管理外の`.cloudflare/article-access-private/`。SQL export（42,982 bytes）、単一statementによる全保存値snapshot、Time Travel bookmarkを取得した。生ログや投稿本文を共有レポートに転載しない。SQL exportを**使い捨てローカルD1だけへ実際に復元**し、全行・全保存値・管理行・FKを照合済み。既存stagingと本番への復元操作は実施していない。

[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)は今回bookmark取得まで確認。保持期限はプラン依存（Free 7日／Paid 30日）で、遠い将来もこのbookmarkが使えるとはしない。復元はDB全体を上書きし、復元点以後の投稿・観測記録を失い、実行中queryを中断する。SQL exportには既存DBを安全に自動上書きする機能はなく、非破壊の検証先で読込・整合性を確認してから復旧計画を立てる。

## テスト結果と根拠

| 検証 | 結果・証跡（verification/2026-10-25-article-access/ 配下） |
| --- | --- |
| 開始ベースライン | Node 45件中44成功・既知F-01のみ失敗：baseline-tests.txt |
| 最終回帰 | `node --test --test-concurrency=1 tests/*.test.mjs`：45件中44成功・同じF-01のみ失敗、新規失敗0：final-tests.txt |
| 実ローカルD1 | 並行加算、batch失敗時rollback、UTC境界、UA/参照元、両記事の90日境界と集計保持：observation.test.mjs |
| 表示状態 | 未測定、停止、DB不在・SQL失敗、既存データのみ、記事記録なし、記事あり、30日境界と全期間、概要主値：observation_view.test.mjs |
| 実HTTP＋D1 | GET11件の生ログ・日別が完全一致、全対象のHEAD/POST/OPTIONSと対象外経路は記録なし：local-http.json |
| 35日fixture | Research累計106、日別表示30行、範囲外を除外、記事未記録セルはdash：local-http.json |
| migration | 空DB・既存DB・失敗と再試行、全値照合：migration-local.json |
| バックアップ | SQL exportの隔離ローカル復元・全値照合：backup-restore-local.json |
| 生成と配信経路 | ローカル・staging・production用生成設定に両記事あり。prepareスクリプト変更不要：scope-and-config.json、環境テスト |
| dry-run | staging/productionとも成功：dry-run-staging.txt、dry-run-production.txt |
| ブラウザ | 六区分・注記・表・狭幅・キーボード：browser-layout.json、local-browser-layout.json、staging-detail.jpg、detail-preview.jpg |
| Access | 匿名GET17経路の302→Accessを確認：access-before.json、access-final.json |
| 既存Python回帰 | リポジトリ直下の93件成功：python-tests.txt。初回はsandbox一時領域の制約、制限外で再実行成功 |
| 静的検証 | verify.pyは変更していない完了ページの既知F-01 assertionで停止：static-checks.txt。後続チェック全成功とは報告しない |

途中の最終再確認では、観測fixtureにMiniflareの`Native`参照復元内部のAssertionErrorが2回発生した（並列suiteと単独再実行）。失敗ログは`miniflare-runtime-failure.txt`と`observation-recheck.txt`へ保持した。期待値や製品コードを変更せず、fixtureの段階名をエラーに添える診断を追加した後の単独実行は4件成功（`observation-diagnostic.txt`）、最終の直列全体実行も既知F-01以外44件成功だった。これはF-01とは別の検証環境での断続的失敗で、根本原因や恒久解消は断定しない。実Wranglerのmigration検証、実HTTP＋D1、リモートstagingの全値・GET増分は別経路で成功している。

投稿保存・通知・管理のNode回帰はローカルD1／mockで検証した。リモート投稿・承認・削除・実メール再送は行っていない。リモートCronの手動起動・保持期間変更・ログ削除・DB初期化も行っていない。F-01の期待値・完了ページは変更していない。ローカルDB検証はmockだけではなく、Miniflare D1と実Wrangler経路を併用した。

## stagingの版・時刻・検証アクセス

| 項目 | 値 |
| --- | --- |
| Worker / D1 | agent-hoihoi-staging / agent-hoihoi-staging-db |
| D1 UUID | cbc9ae36-05b9-4862-a3ad-1ac973e1001e |
| 開始時Version | f547cd13-8873-4fc0-947c-3469d152cd3c |
| 計測機能を初めて配置したVersion | 82958739-8028-4b0e-825f-bf71374730a3 |
| 上記deployment created_on | 2026-10-24 17:43:32.216085 UTC / 2026-10-25 02:43:32.216085 JST |
| 最終Version（表幅調整を含む） | 5f570559-affe-4e7e-9565-3d175319b84a |
| 最終deployment created_on | 2026-10-24 18:06:36.367830 UTC / 2026-10-25 03:06:36.367830 JST |
| 最終DB照合 | 2026-10-24 18:09:40.883 UTC / 2026-10-25 03:09:40.883 JST |

deployment時刻はCloudflareのdeployment記録で確認した値。全拠点が同時に切り替わった瞬間を断定するものではない。稼働記録にはdeployment時刻・配置コマンド開始終了・Versionを併記し、最初のGET日を開始日時の代用にしていない。

migration直後の旧コード検証では、記事GET1件は生ログに増分なし、Research GET1件は200で+1だった（受信UTC 17:42:13.805 / JST 02:42:13.805）。migrationだけでは記事計測は始まらない。

新コード配置後のブラウザ操作は、記事GET3件、Home2パス各1件、Research・概要・Guestbook各1件、About1件、詳細1件。対象GETは合計8件で、受信時刻は **2026-10-24 18:01:39.331〜18:01:48.097 UTC（2026-10-25 03:01:39.331〜03:01:48.097 JST）**。ブラウザの操作時刻とは時計差があるため、計測値の時刻はD1のUTC受信時刻を根拠とする。

| 区分 | 配置後の試験GET | 生ログ増分 | 日別増分 | status |
| --- | ---: | ---: | ---: | --- |
| home | 2 | 2 | 2 | 全て200 |
| research | 1 | 1 | 1 | 200 |
| observations | 1 | 1 | 1 | 200 |
| guestbook | 1 | 1 | 1 | 200 |
| agent_traps | 2（通常1＋query付き1） | 2 | 2 | 全て200 |
| agents_and_traps | 1 | 1 | 1 | 200 |

query付きGETも同じ区分となり、queryは生ログへ保存されなかった。About・詳細と追加の詳細再読込・画面確認は記録を増やしていない。匿名Access検証は前後各17 GETで、サイトに到達せず記録増分なし。今回の旧コード検証+1と新コード検証+8を含め、生ログは125→134、日別行は13→17。試験分は削除していない。

最終累計はHome83、Research17、概要7、Guestbook24、第1弾2、第2弾1。これはこの時点のstaging値であり、本番値ではない。

通知URLの一致はハッシュ、secretはbinding名・型の保持だけを確認した。値の取得・表示・再登録はしていない。ENABLE_DB_CHECK=false、ENABLE_OBSERVATION/ENABLE_GUESTBOOK=true、通知environment=staging、DB分離、preview無効を保持。Cronは既存の`17 3 * * *`のまま配置した。Access設定操作は一切行わず、匿名の両記事・既存ページ・資産・APIの保護を前後で確認した。

本番は設定・配信Versionの読み取り照合のみ。Version `eecf89df-22c5-49c7-8f19-503136ab5d2d`と設定は開始時から不変。本番D1へのquery・migration・試験書込、本番サイトへの試験GETは行っていない。

## 後続の本番適用手順（staging報告時点では未実施）

以下はstaging報告時点に用意した手順。本番適用の明示指示を受けた後に実施するものとして記録した。本番への実施結果は末尾に追記している。

1. ブランチ・HEAD・未コミット変更を再確認し、本差分を含む反映対象を確定する。新しい正当な変更を上書きしない。既存通知・Access・Cron・preview設定を保持する。
2. 固定対象を照合する：account `265c8cac2bde2809bf3216e339c82d20`、Worker `agent-hoihoi-production`、D1 `agent-hoihoi-production-db`、UUID `2fe64ba8-21cb-4cc5-8231-93cee3d9d528`。staging UUIDとは異なることを確認する。
3. 下記prepare後、`readTargetConfig('production')`による対象照合、生成物のrun_worker_first・vars・binding・Cron・previewを確認する。両記事の静的assetsがWorkerを通ることを確認する。
4. 本番の現行Version・schema・適用済みmigration・容量を読み取り、今回の前提（旧4区分、既存3migration、追加参照・triggerなし）を再確認する。新しいschemaがあれば先に互換性を調べる。
5. SQL export、Time Travel bookmark、全保存値snapshotを**本番専用のGit管理外ディレクトリ**へ取得する。exportの署名付きURL等を共有ログへ出さない。snapshotは本書のstaging検証と同じ一括SELECT構成で、対象を固定照合した本番の読み取りとして取得し、個別UA・投稿本文を共有しない。退避ファイルの読込可否・サイズ・ハッシュと復旧期限を確認する。staging用検証スクリプトを本番照合の代用にしない。
6. dry-run後、**migration先行→全保存値・FK・索引・既存コードの正常性を照合→deploy**とする。migrationだけでは旧Workerが記事を記録し始めることはない。
7. deployment時刻・Version・配置開始終了をUTC/JSTで記録する。この時点で初めて本番の機能開始記録を確定する。公開説明は現行の「稼働後のみ・補完なし」と整合させ、具体日付を追加するなら確認済みdeployment記録を使う。
8. 公開後は両記事をGET各1回、詳細をGET1回する最小限の確認を行う。受信時刻・status・日別と生ログの該当増分を確認し、通常の他アクセスと区別する。詳細は記録対象外。HEADやqueryによる除外・試験ログの削除を行わず、検証GETも通常記録として残して件数を報告する。投稿・実メールの再試験は追加指示がなければ行わない。
9. stagingの匿名保護、本番の配信状態、通知binding・フラグ・DB分離・preview・Cronの保持を再照合し、成功判定を報告する。開始前の記録をArticle 1へ振り替えない。

```powershell
node scripts/prepare_cloudflare.mjs --env production --account-id 265c8cac2bde2809bf3216e339c82d20 --database-id 2fe64ba8-21cb-4cc5-8231-93cee3d9d528 --url https://agent-hoihoi-production.molamola.workers.dev/
node --input-type=module -e "import {readTargetConfig} from './scripts/deployment_targets.mjs'; await readTargetConfig('production'); console.log('Pinned production target verified');"
node node_modules/wrangler/bin/wrangler.js d1 migrations list agent-hoihoi-production-db --remote --config .cloudflare/wrangler.production.json

# 本番専用の非公開退避先を準備して実行。CLI出力は非公開ファイルへ。
node node_modules/wrangler/bin/wrangler.js d1 export agent-hoihoi-production-db --remote --config .cloudflare/wrangler.production.json --output .cloudflare/article-production-private/before.sql *> .cloudflare/article-production-private/export.log
node node_modules/wrangler/bin/wrangler.js d1 time-travel info agent-hoihoi-production-db --config .cloudflare/wrangler.production.json --json > .cloudflare/article-production-private/bookmark.json

node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json --dry-run --outdir .cloudflare/article-production-dry-run
node node_modules/wrangler/bin/wrangler.js d1 migrations apply agent-hoihoi-production-db --remote --config .cloudflare/wrangler.production.json
# ここで退避済み各行の全保存値、集計値、既存migration管理行とFK・索引を照合。
# 稼働中の通常増分は時刻・IDで確認し、行数一致だけで判断しない。
node node_modules/wrangler/bin/wrangler.js d1 execute agent-hoihoi-production-db --remote --config .cloudflare/wrangler.production.json --command "PRAGMA foreign_key_check; PRAGMA foreign_key_list(page_requests); PRAGMA index_list(page_requests); PRAGMA index_list(page_request_daily);" --json
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json
```

実行時は各コマンドの終了コードを確認し、失敗した後に次の変更コマンドを続けない。成功判定は、保存済み各行・集計値の保全、FK違反0、新CHECK・主キー・索引、配信Version、2記事GET各1件の記録と200、6区分表示、設定保持が揃うこと。

## 失敗時の対応

- migration失敗：Wranglerの当該migration rollbackを前提とするが、通信切断で結果不明の場合は先に`d1_migrations`・schema・保存済み行・FKを読み取る。未適用か確認せずSQLを断片実行しない。0004が未適用で旧状態が保全されていれば、原因を修正してmigration全体を再実行する。
- migration成功、deploy失敗：拡張schemaを残して旧Workerを継続できることをローカルとstagingで確認済み。旧4区分は記録を継続し、記事の独立計測はまだ始まらない。DBを縮小せずdeployを修正・再実行する。
- deploy後の不具合：退避した**実際の旧Version**へWorkerをrollbackするか、確認済み旧ソース・旧生成設定を再配置する。コード切り戻しはDBを戻さない。今回stagingの機能追加前Versionは`f547cd13-8873-4fc0-947c-3469d152cd3c`だが、本番では実適用直前の本番Versionを使う。新コードのPAGE_PATHSからprepareして「旧設定」と思い込まない。
- 旧版への切り戻し後も新2区分データは拡張DBに残る。旧表示には出ないが消さず、修正後に再び表示できる。新記事ログが入ったDBを無条件で旧4区分CHECKへ縮小しない。
- データ破損が確認された場合のみ、退避SQLと直前bookmarkを基に別途復旧方針を決める。Time Travel restoreは全DBの後続投稿等も失う破壊的操作なので、現在の状態も退避し、失われる範囲・復元期限・権限を確認してユーザー指示の下で行う。今回のstagingで破壊的なTime Travel復元は試していない。
- 復旧時にAccessを弱めたり、既存投稿・集計・観測ログを全消去して成功扱いにしない。復旧後は全値照合とFK確認、旧4区分・新2区分の対応範囲を報告する。

## 証跡の扱い

共有可能な結果は`verification/2026-10-25-article-access/`。退避SQL・生ログ全値・投稿本文は`.cloudflare/article-access-private/`、復元確認DBや隔離fixtureは`.cloudflare/`内にあり、Git管理外。認証token、Cookie、secret値は証跡へ保存しない。通常の既存Wrangler認証だけを使用した。

画面の`detail-preview.jpg`は**ローカルfixture**、`staging-detail.jpg`は**実staging**。両者の件数を取り違えない。バックアップを取得したこと、隔離ローカルへ復元したこと、リモートへ復元していないことは別々の実施事実として扱う。

## 本番反映記録 — 2026-10-25

ユーザーから受領した `Agent_Hoihoi_Article_Access_Production_Instructions_20261025.md` に従い、退避→0004適用→全保存値照合→本番deploy→公開後検証を実施した。本番のコード切り戻し、DB全体復元、初期化、新規データ破棄、Access設定変更は行っていない。

### 対象・ソース・配置結果

| 項目 | 確認結果 |
| --- | --- |
| ブランチ・反映前HEAD | implement-v1 / 5330dd9bd06772ab44ea724eb70ec1786852f1e7 |
| 開始時リモート差分 | fetch後ahead/behind 0/0 |
| account | 265c8cac2bde2809bf3216e339c82d20 |
| 本番Worker / D1 | agent-hoihoi-production / agent-hoihoi-production-db |
| 本番D1 UUID | 2fe64ba8-21cb-4cc5-8231-93cee3d9d528 |
| 反映直前の本番Version | eecf89df-22c5-49c7-8f19-503136ab5d2d、100% |
| 反映後の本番Version | f717fdb7-dbd7-494a-900d-2c6dda6859b5、100% |
| 新deployment ID | fdcdf6fb-3546-450d-8aa7-72fcc70a5d79 |
| deployment created_on | 2026-10-25 01:40:56.007596 UTC / 10:40:56.007596 JST |
| 配置コマンド開始・終了 | 01:40:47.203992〜01:40:58.653485 UTC / 10:40:47.203992〜10:40:58.653485 JST |
| 反映ソースmanifest SHA256 | 6794533b000706a8a547f92131e0dee03197a499a339340e7065f347c54a204a |
| 本番・検証済みstaging共通script etag | 98c182da1ddfd667f870a33392488700c8df032c58681db6418b4e0a3a45dbcc |
| staging Version | 5f570559-affe-4e7e-9565-3d175319b84a、100%、前後不変 |

反映対象はstaging検証済みの実装・migration・依存バージョンから変更していない。稼働ソースは反映前HEAD上の未コミット差分を含むため、HEADだけでなくmanifestとファイル別ハッシュで識別した。実配置後のCloudflare script etagが検証済みstagingと一致し、生成物の両記事経路も配信Versionの`raw_run_worker_first`で確認した。報告書・証跡・検証補助スクリプトはWorkerに含まれず、後からの記録更新を理由に再deployしていない。

機能開始記録はこのdeploymentのVersionとcreated_onを基準に確定した。全拠点の同時切替瞬間を意味せず、最初の試験GET時刻を機能開始日時の代用にしていない。公開文面は「機能開始後のみ・過去分補完なし」の説明を維持した。

### 本番退避とmigration保全

適用前のschemaは未改変の0002と正規化比較で一致し、旧4区分CHECK・旧3migration・対象テーブルへの追加参照や独自triggerなしを確認した。Wranglerは4.151.3。既存prepare→対象・生成物照合→dry-run成功後に、未適用0004だけを既存のmigration apply経路で適用した。

- 適用開始・終了：2026-10-25 **01:39:49.356713〜01:39:53.476654 UTC / 10:39:49.356713〜10:39:53.476654 JST**。CLI実行結果は10 commands、1.57ms、終了コード0。
- 日別8行、生ログ66行の全列・ID・NULL等、投稿1行、gate1行、既存3migrationの全保存値が適用前後で一致。適用直後に通常アクセスによる増分もなく、行数だけでなく全保存値とハッシュで確認した。environment_checkは0行。
- 新6区分CHECK、日付＋page複合主キー、正式親`page_request_daily`への2列FK、ON DELETE CASCADE、`page_requests_received_at`索引を維持。`PRAGMA foreign_key_check`は0件。
- DB容量77,824 bytes。コピー・索引等の余裕を保守的にDB全体の3倍233,472 bytesで評価しても、Freeの最小想定容量500MiBを十分下回る。[公式D1上限](https://developers.cloudflare.com/d1/platform/limits/)のSQL実行時間30秒も確認し、今回の小規模DBで実適用は1.57msだった。将来の大規模DBで同じ所要時間を保証しない。
- SQL exportは19,808 bytes、SHA256 `acfc84073e0581a3999710cd310ed1f45154dfa4efd7575b7d8ca038c0565b52`。UTF-8読込を確認し、使い捨ての**メモリSQLite**へ読込んで全保存値・migration管理行・FKが退避snapshotと一致することを確認した。これは今回のバックアップ読込確認であり、D1復元経路を新たに実行したという意味ではない。D1 exportの隔離Wrangler復元経路は前段のstaging検証で確認済み。
- 直前Time Travel bookmark、DB全保存値snapshot、旧Version・実配信構成を本番専用のGit管理外`.cloudflare/article-production-private/`へ保存した。Time Travelはproduction backendでbookmark取得可能なことを確認した。[保持期限](https://developers.cloudflare.com/d1/reference/time-travel/)はFree 7日／Paid 30日であり、プランを決めつけず、復旧検討は保守的に7日以内とする。SQL exportの署名付きURLやbookmark自体、全保存値snapshotはGit・共有報告へ含めていない。

### 公開後の検証アクセスと表示

記事はクエリや除外ヘッダーを使わない通常GETを**各1回だけ**送信した。非同期記録を待つ際はDB読取だけを行い、記事GETを再送しなかった。

| パス | 送信回数 | D1受信時刻UTC / JST | 検証記録ID・区分 | status | 生ログ・日別 |
| --- | ---: | --- | --- | --- | --- |
| /agent-traps.html | 1 | 01:41:44.102 / 10:41:44.102 | 68 / agent_traps | 200 | 各+1 |
| /agents-and-traps.html | 1 | 01:41:47.812 / 10:41:47.812 | 69 / agents_and_traps | 200 | 各+1 |

各GETの直前・直後snapshotで該当する新記録と日別+1が一致し、既存保存値も保持された。各試験の窓内では一致する新記録は1件だったが、訪問者の身元や観測期間全体の自然流入の不存在を断定するものではない。

詳細はブラウザで1回取得した。接続に約10分かかり、ブラウザAPIでnavigation statusを読む機能が非対応だったため、別HTTPクライアントで**詳細だけ1回補足GET**して200を確認した。補足GETは02:09:30.549〜02:09:30.893 UTC / 11:09:30.549〜11:09:30.893 JST。ブラウザの操作区間は01:42:26.812〜01:52:56.248 UTCで、表示内の取得時刻は01:52:55.154 UTCだった。

したがって基本3 GETに補足1 GETを加え、**今回送信した本番HTMLのGETは合計4回（記事2、詳細2）**。ブラウザのCSS・favicon取得は別にあり、計測対象外。両方の詳細GETは観測記録を増やしていない。記事や詳細の再読込はせず、リサイズ・スクロールで表示確認した。試験記録は通常どおり残し、削除していない。

試験とは別にHomeの新記録1件（ID67、受信01:40:57.914 UTC / 10:40:57.914 JST、200）が配置後のsnapshotに現れた。今回の試験GETとは区別して日別+1へ照合し、発生元は断定していない。全体の生ログ66→69、日別8→11行は、このHome1件と記事2件で説明でき、既存保存値の欠落や変更はなかった。

詳細の確認時点の累計はHome26、Research11、概要5、Guestbook25、第1弾1、第2弾1。6区分の見出し・累計・日別3行、Researchの過去分注記、記事の未記録を示すdash4セル、開始前を0件と扱わない注記を確認した。390pxでは文書幅375px・表領域335px・表800px、1280pxでは文書幅1265px・表領域/表1080pxで、ページ全体の横はみ出しなし。キーボードで表をフォーカスし、ArrowRightでscrollLeftが40px増加した。

### 既存機能・設定・既知事象

投稿1行の全保存値とgateは最終確認まで不変。投稿・承認・削除・実メール送信は試していない。通知URLは既存値と照合し共有証跡ではハッシュだけ、secretはbinding名・型だけを確認した。secret値の取得・表示・再登録はしていない。

ENABLE_OBSERVATION=true、ENABLE_GUESTBOOK=true、ENABLE_DB_CHECK=false、通知environment=production、専用D1 UUID、preview無効を保持。Cron `17 3 * * *`は配置結果でも既存値のまま。Cron定刻の再調査・手動起動・Observability設定変更はしていない。stagingのVersion・binding・配信構成は前後一致し、前後各17経路のCookieなしGETは全てAccessへ遮断された。stagingのdeploy・migration・認証済み試験GETは追加していない。

保存済みのNode直列回帰45件中44成功（既知F-01のみ失敗）、Python93件成功、実Wrangler・HTTP＋D1・stagingの独立検証を確認した。稼働コード・migration・依存・環境が検証時点から変わらないため全テストの反復はしていない。Miniflareの断続的内部例外は前段の記録どおり未解決の環境事象として保持し、解消したと扱わない。今回、コードやmigrationに起因する新規問題は検出していない。ブラウザの接続遅延・status読取非対応と補足GETは検証上の制約として上記に記録した。

コード切り戻し・DB全体復元は未実施。万一切り戻す場合は、退避した実旧Version `eecf89df-22c5-49c7-8f19-503136ab5d2d`と旧assets配信経路へ戻す。コードrollbackではDBは戻らず、拡張schemaと新2区分データを保持する。DB不整合が判明した場合は以後の変更を停止し、現状態も退避して別途指示を受ける。本番反映・公開後検証に未達項目はない。

### Git保存と共有証跡

機能差分・migration・テスト・運用資料・検証補助4スクリプトと、内容を確認した集約証跡だけを`implement-v1`へ保存対象とした。ルートREADME/SECURITY/docsの変更、別アプリの未追跡ファイル、過去の無関係なverificationは含めない。生成設定、SQL退避、全保存値snapshot、個別UA・参照元、投稿本文、Cookie・token、ローカルDB、私用ログ・画像はGitへ含めない。

- 本番共有証跡：`verification/2026-10-25-article-access-production/release-verification.json`、`detail-browser.json`、`access-before.json`、`access-final.json`。
- staging共有証跡：`verification/2026-10-25-article-access/validation-summary.json`、`migration-local.json`、`backup-restore-local.json`、`scope-and-config.json`。
- 初回検証の詳細txt・HTTP記録・画像はローカル保管のままとし、共有用の検証結果は上記集約JSONへ整理した。
- 保存コミットSHA、通常push先、再fetch後のHEAD一致とahead/behindはGit保存後の完了応答で報告する。反映時点ソースは上記manifestで識別し、後から追加した本番報告を理由に再deployしない。
