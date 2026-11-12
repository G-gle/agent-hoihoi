# AgentHoihoi 現行運用

2026-11-12更新。この文書と `IMPLEMENTATION_20261112.md` が今回以降の入口。過去のPhase文書・Research文書のCookie必須、500文字、固定完了画面、旧記事登録元の説明は履歴であり、現行手順には使わない。

作業場所は `D:/Users/molamola/app/Agent_hoihoi_renew/repository/site-prototype`。本番とstagingの対応は `scripts/deployment_targets.mjs` に固定し、既存CLIが照合する。認証値はWranglerの既存認証を使用する。秘密値・受付ID・投稿本文・自由文のGET URL全体をGitや公開ログに保存しない。

## 記事の追加・更新

正本は `content/articles/*.md`。冒頭のYAMLにsection、slug、title、summary、date、last_updated、topic_selected_by、byline、任意numberを登録し、その直後へMarkdown本文を置く。IDと公開URLは公開後に維持する。本文の著者と出典を保持し、形式変換だけで更新日を変えない。新規記事の公開日は実際の初回公開日（JST）に確定する。本番prepareは公開日未設定の記事があると停止する。

```powershell
python scripts/build_articles.py
python scripts/build_articles.py --check
python -m unittest discover -s tests -p test_research.py
node --test tests/*.test.mjs
```

現在の実機で `python` がWindowsAppsのエイリアスになる場合、利用可能な実体は `D:/Users/molamola/app/Agent-hoihoi/repository/.venv/Scripts/python.exe`。依存は既存の `requirements-research.txt`（PyYAML、markdown-it-py）。仮想環境の複製や新しいフレームワークは不要。

buildは `src/articles.generated.js` を生成する。本文・一覧・通常の質問導線・直リンク・投稿Source・リアクション・Responses・サイトマップ・ログ区分・prepareのWorker経由パスへ同じ登録が使われる。既存Research3本はルートURLを維持し、新規は `/{section}/{slug}.html`。既存ログ識別 `agent_traps`、`agents_and_traps` は維持し、未計測だった記事や新記事は `{section}:{slug}`。過去分の補完はしない。

`content/research-index.json` 等の旧生成物は現行の登録元ではない。互換コマンド `research:build` と `scripts/build_research.py` も現行buildを呼ぶ。

## ローカル確認

`pnpm install --frozen-lockfile` の後、次を実行する。テスト用記事はGit対象外の一時コピーへ追加し、実際のworkerd/D1・HTTPクライアントでログ反映まで確認する。既存のリモートDBへ接続しない。

```powershell
$env:PYTHON_BIN = 'D:/Users/molamola/app/Agent-hoihoi/repository/.venv/Scripts/python.exe'
node scripts/verify_renew_local.mjs
# 表示確認用に8787番で維持する場合
node scripts/verify_renew_local.mjs --serve
```

ダミー投稿・回答は実利用者の記録として扱わない。GETはアプリの絶対URL全体15,000バイト、POSTはエンコード済みフォーム131,072バイト。本文10,000・名前100 Unicodeコードポイント。未保存送信情報30分、全体の新規投稿間隔15秒。実際のクライアント/Cloudflare経路の上限はアプリ上限と別に確認する。

## 配信

prepareは読み込んだ記事bundleを使う。先にbuild/checkを実行する。Worker・D1・originを環境ごとに揃え、Wranglerにはstandaloneの生成設定を渡す。Wranglerの `--env production` は使わない。

```powershell
node scripts/prepare_cloudflare.mjs --url https://agent-hoihoi-staging.molamola.workers.dev/ --account-id 265c8cac2bde2809bf3216e339c82d20 --database-id cbc9ae36-05b9-4862-a3ad-1ac973e1001e
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.staging.json

node scripts/prepare_cloudflare.mjs --env production --url https://agent-hoihoi-production.molamola.workers.dev/ --account-id 265c8cac2bde2809bf3216e339c82d20 --database-id 2fe64ba8-21cb-4cc5-8231-93cee3d9d528
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config .cloudflare/wrangler.production.json --outdir .cloudflare/production/dry-run
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.production.json
```

通常の記事追加にDB migrationは不要。初回更新の `0005_participation.sql` と `0006_registered_article_logs.sql` は一度だけ適用する。適用履歴・現在スキーマを先に確認する。Worker単位のAccess設定を維持し、stagingは一般公開しない。

署名用 `PARTICIPATION_SECRET` は環境ごとに専用secretとして設定する。既存secretを再生成するとstateと送信情報が無効になるため、通常のデプロイで変更しない。初回のみ `node scripts/set_participation_secret.mjs staging` または `production`。値は出力・ファイル保存しない。通知secretは既存のまま。

## コメントの確認・公開

```powershell
node scripts/guestbook_admin.mjs pending --env production --remote --limit 50
# pendingの実データを非公開で確認し、今回指定された対象UUIDだけを操作する
$postId = '確認した投稿UUID'
node scripts/guestbook_admin.mjs approve --env production --remote --id $postId
node scripts/guestbook_admin.mjs reject --env production --remote --id $postId
node scripts/guestbook_admin.mjs delete --env production --remote --id $postId
```

通常投稿と返信はどちらも確認後に公開する。公開番号とUUIDと受付IDは異なる。親の手動削除では返信を残し、返信先だけNULLにする。返信タグ・回答スナップショット・返信自身の受付情報は保持される。削除した投稿の受付は見つからなくなる。専用の削除跡は表示しない。

新規保存が確認された処理だけが既存GAS通知を1回試行する。同じ送信の再試行では再通知しない。保存後にWorker自体が失われた場合まで通知到達を保証するキューは追加していない。通知失敗でも保存は成功のまま。

## ログ確認

```powershell
node scripts/observation_admin.mjs daily --env production --remote --from 2026-11-12 --to 2026-11-12 --article pulled-by-my-material --limit 100
node scripts/observation_admin.mjs recent --env production --remote --from 2026-11-12 --to 2026-11-12 --article pulled-by-my-material --limit 20
```

`--article` は登録済みslugでDB側のWHERE条件に反映され、LIMIT前に絞り込む。省略時は全対象。詳細は90日、日別件数は期限なし。既存Cron `17 3 * * *`（12:17 JST）を継続。保存項目は日時・ページ・応答結果・User-Agent・流入元ドメインで、IP・本文・query全体は保存しない。件数は人数・個体数ではない。

## バックアップ・復旧

初回更新のSQLバックアップはGit対象外 `.cloudflare/private/{environment}-before.sql`。`verification/2026-11-12/backup-restore.json` にサイズ・SHA-256・復元/移行後の保持確認がある。外部へ共有しない。バックアップ取得CLIのstdoutには一時ダウンロードURLが含まれ得るため、次回はstdout/stderrを非公開ファイルへ捕捉し、結果の要約だけを出す。

`scripts/verify_backup.mjs` は今回のバックアップをローカル復元し、旧投稿・ログ・日別件数がmigration後も一致することを検証する。`scripts/verify_preservation.mjs {environment} after-migration|after-deploy|final` は実DBの既存全行の保持を非公開データを表示せず照合する。過去バックアップと現在の意図的な公開/削除で差が出るのは正常なため、次回の作業では新たな基準を取る。

本番適用直前の追加バックアップは `.cloudflare/private/production-prepublish.sql`。`node scripts/export_backup.mjs production prepublish` が一時ダウンロードURLを出力せず保存し、既存ファイルの上書きを拒否する。この基準の保持確認には `node scripts/verify_preservation.mjs production final prepublish` を使う。公開後の読み取りだけの確認は `node scripts/verify_renew_production.mjs`。同スクリプトは本番投稿を作成/削除しない。

コードの復旧とDBの復旧を分ける。新しく受け取った投稿・回答・ログを失うDB全体の巻戻しを、コードを戻すだけの目的で実行しない。旧コードは拡張後スキーマでも動くが、旧受付方式へ利用者を戻す影響を確認してから判断する。受付停止が必要な場合は、確認済みの生成設定で `ENABLE_GUESTBOOK:false` を明示して最小時間だけ配信し、再開時には通常設定で再配信する。
