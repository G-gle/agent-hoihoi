> 現行Phase 3の起動・追加マイグレーション・デプロイ・停止は [GUESTBOOK.md](GUESTBOOK.md) を優先してください。以下にはPhase 1時点の履歴が含まれます。

# Phase 1 — Cloudflare非公開テスト環境の運用

> **Phase 2更新：** 観測開始後の現行仕様・管理コマンド・停止・DB分離は [OBSERVATION.md](OBSERVATION.md) を参照してください。現行stagingは <https://agent-hoihoi-staging.molamola.workers.dev/>。以下の旧URL・未計測・Worker優先経路の記述はPhase 1当時の履歴です。

一般公開へ切り替える手順ではありません。Accessは常に維持してください。
計測、投稿受付・保存、承認、実測値の表示は未実装です。Guestbookは静的デモのままです。

## 実行環境と構成

- Node.js 22以上。作業環境は24.19.0。
- pnpm 11.25.0、Wrangler **4.151.3**（完全固定、`pnpm-lock.yaml`）。
- 既存記事の生成・検証にはPython 3.10以上（作業環境3.12.14）。
- `pnpm-workspace.yaml` はWranglerに必要なesbuild/workerdのインストール処理だけを許可します。
- Worker名：`agent-hoihoi-staging`。本番用Workerは作成しません。
- D1名：`agent-hoihoi-staging-db`、バインディング`DB`。
- 静的配信：`ASSETS`、`html_handling: none`、SPAフォールバックなし。
- Worker優先経路は`/api/internal/*`と`/`のみ。`html_handling: none`の`/`が404になるため、Workerで`/index.html`へ渡します。他はStatic Assetsへ。
- ローカルテンプレートは`wrangler.jsonc`。ゼロUUIDはローカル専用で実在DBを示しません。
- 配置用設定と配信物は`.cloudflare/`へ生成し、Git管理しません。
- プレビュー／バージョンURLは`preview_urls: false`。独自ドメイン・追加ルートは設定しません。

非公開テストURLと配置結果は[実施記録](verification/2026-10-21-cloudflare/README.md)を参照してください。
Cloudflareの画面でいうproduction URLを使っても、Access内の非公開テスト環境です。

2026-10-21の配置先は <https://agent-hoihoi-staging.molamola0612.workers.dev/>、アカウントIDは`265c8cac2bde2809bf3216e339c82d20`、専用D1のUUIDは`cbc9ae36-05b9-4862-a3ad-1ac973e1001e`です。正式な公開URLの決定ではありません。

## インストールとローカル検証

以下は`site-prototype/`で実行します。通常のNode.js＋pnpmがPATHにある環境を想定します。

```powershell
pnpm install --frozen-lockfile
pnpm exec wrangler --version
pnpm db:migrate:local
pnpm test
pnpm dev:db-check
```

別ターミナルで：

```powershell
pnpm verify:http --db-check on
pnpm db:rows:local
..\.venv\Scripts\python.exe scripts/verify.py --url http://127.0.0.1:8787/
..\.venv\Scripts\python.exe scripts/render_research.py --check
```

`verify:http`はループバックのみを受け付け、13静的ファイルと`/`の内容一致、404、APIのメソッド、同時POST3件を検証します。POST本文のSQL指定は無視されます。行数が`remaining = 0`であることを確認します。

Ctrl+Cで停止し、通常設定に戻します：

```powershell
pnpm dev
# 別ターミナル
pnpm verify:http --db-check off
```

未設定／falseのAPIはGET・POSTとも404です。有効時はPOST以外405です。
ローカルの`remote: false`と`--local`により、開発中にリモートDBへ書き込みません。
`.wrangler/`、`.cloudflare/`、`node_modules/`、`.dev.vars*`、`.env*`はGit対象外です。
ローカルHTTPにはAccessの保護はないため、127.0.0.1でのみ待ち受けます。

## 初回配置（必ずこの順序で実施）

### 1. 認証・アカウント・同名資産

```powershell
pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write d1:write
pnpm exec wrangler whoami
pnpm exec wrangler d1 list
```

通常のブラウザOAuthを使用します。パスワード・APIトークン・Access Cookieをチャットやファイルに貼り付けません。
ブラウザからlocalhostの認証戻り先に接続できない場合は、同じ権限で`pnpm exec wrangler login --device --browser=false --scopes account:read user:read workers:write workers_scripts:write d1:write`を使用します。表示されたCloudflare公式確認URLでデバイスコードを承認し、CLIの成功表示を確認してください（コードは記録へ保存しない）。この方式はlocalhostのコールバックを使用しません。
Workers & Pages一覧とD1一覧を確認します。同名資産があれば用途・所有を確認し、無関係な資産を上書き・削除しません。対象アカウントを確定してから進めます。

### 2. Accessを確認

Workers & Pages → Cloudflare Access／Protect all Workers → 編集。
有効、**All traffic／すべてのトラフィック**、Cloudflare account許可、24時間を確認します。
編集画面の選択だけでなく、保存済みの一覧でもproductionとpreviewの両方の保護を確認します。

Zero Trust → Accessコントロール → アプリケーションで、全Workerポリシー以外に対象Worker・ホスト・パス向けのEveryone許可やBypassがないか確認します。
Worker作成後はWorkerのAccess画面でも継承と例外の有無を確認します。
アカウントのメンバー画面で許可範囲を確認し、メールアドレスを記録せず人数と範囲だけを実施記録へ残します。
確認できなければ、ここでリモート配置を止めます。

### 3. 仮応答だけを配置

以下のプレースホルダーを、確認済みアカウントIDに置き換えます（IDは秘密情報ではありません）。

```powershell
pnpm prepare:cloudflare --probe --account-id <確認済みアカウントID>
pnpm deploy:probe
```

同じ`agent-hoihoi-staging`へ`src/probe.js`のみを配置します。HTML、静的ファイル、D1は含めません。
認証済みアクセスの仮応答は503と固定文言`Staging environment unavailable.`です。
未認証の新規HTTPクライアントでは503本文を取得できず、Accessへ転送または拒否されることを確認します。
実行結果に表示されたworkers.dev URLを記録します。

### 4. テストD1を作成し、配置用ファイルを生成

```powershell
pnpm exec wrangler d1 create agent-hoihoi-staging-db
pnpm prepare:cloudflare --account-id <確認済みアカウントID> --database-id <実在D1のUUID> --url https://agent-hoihoi-staging.<サブドメイン>.workers.dev/
pnpm db:migrate:remote
pnpm exec wrangler deploy --dry-run --config .cloudflare/wrangler.staging.json
```

新規作成は初回のみ。既存の同名テストDBを再利用するときは`d1 info`でUUIDと用途を照合します。
`prepare:cloudflare`は`public/`を`.cloudflare/public/`へコピーし、そちらのサイトマップ3件のみをテストURLへ変更します。
`site.config.json`の`publicBaseUrl`と元の`public/sitemap.xml`は変更しません。
配信物にlocalhost等が残ればエラーになります。コピー後にページを変更した場合は必ず再生成します。

### 5. DB確認を一時的に有効化して配置

```powershell
pnpm deploy:db-check
```

許可アカウントでAccess認証したブラウザから`/api/internal/db-check`を直接開き、**Run temporary database check**を押します。GET自体は405で書き込みを行いません。HTMLを要求するブラウザだけに同一オリジンPOST用フォームを返します。通常ナビやllmsには載せず、API無効化後はフォームも404になります。Cookieやトークンのコピーは不要です。

開発者ツールを利用する場合は同じ処理を以下で実行できます：

```javascript
await fetch('/api/internal/db-check', {method: 'POST', cache: 'no-store'}).then(async r => ({status:r.status, body:await r.json()}))
```

200と`{"ok":true,"write":true,"read":true,"deleted":true}`を確認します。
サーバー生成UUID・時刻と固定文字列だけを保存し、同じIDを読み戻して比較し、削除と不在確認を行います。
失敗時も削除を試み、読み戻し不一致や削除失敗なら500です。SQL・スタック・認証情報は応答しません。全API応答は`Cache-Control: no-store`です。

```powershell
pnpm db:rows:remote
```

`remaining = 0`を確認します。CLIの成功だけではWorkerのDB確認成功とは判定しません。
失敗時はAPIを無効化し、DBを調査してください。今回の専用テストDBの`environment_check`に残ったテスト行を消す場合だけ、対象を照合して次を使用できます：

```powershell
pnpm exec wrangler d1 execute agent-hoihoi-staging-db --remote --config .cloudflare/wrangler.staging.json --command "DELETE FROM environment_check"
pnpm db:rows:remote
```

### 6. 認証済み／未認証の配信を確認

認証済みブラウザで7ページ、`/`と`/index.html`、CSS・JS・favicon、llms・robots・sitemapを確認します。
通常ナビHome / Research / Aboutと次の2経路を実際にたどります。

- Research第6章補足 → 観測概要 → Guestbook → 完了デモ → 観測詳細。
- フッターBOTS ↗ → 同じGuestbook → 完了デモ → 観測詳細。

PCとモバイル幅、記事6章・Sources and scope・5表・13外部参照、未計測表示、送信無効状態も確認します。
認証Cookieを持たない別プロセスのHTTPクライアントで全13ファイル、ルート、APIへのPOSTを確認してください。
`pnpm verify:access --url https://agent-hoihoi-staging.<サブドメイン>.workers.dev/`はCookieや認証ヘッダーなしでこの確認を行い、転送先query・ヘッダー・ログインHTMLを出力せず、結果だけをJSONにします。`--out <記録ファイル>`で保存できます。
`curl.exe -I`のステータスだけでは不十分です。例えば以下で本文と転送先を確認できます（認証Cookieは指定しない）：

```powershell
curl.exe -sS -L -o .cloudflare/unauthenticated.html -w "status=%{http_code} final=%{url_effective}\n" https://agent-hoihoi-staging.<サブドメイン>.workers.dev/
curl.exe -sS -D - -o .cloudflare/unauthenticated-api.html -X POST https://agent-hoihoi-staging.<サブドメイン>.workers.dev/api/internal/db-check
```

生ヘッダーやAccessログインページは認証情報を含み得るためGitへ保存せず、検証記録にはURLのqueryを省略して結果だけ記録します。
Accessのログイン画面が最終200でも、サイトの本文・対象アセット・APIのJSONが返っていなければ区別できます。
ポリシー拒否の401/403の場合も本文がサイト本文でないことを確認します。
未認証POSTの前後で専用テーブルに残存行がないことを確認し、Accessの転送・拒否と合わせて判定します。

Worker設定のDomains & Routesで全到達経路を列挙します。通常workers.dev以外に独自ドメイン・追加ルートがないこと、preview/version URLが無効であることを確認してください。
過去のversion URLがあれば実際に確認します。使う経路はすべて保護、使わない経路は無効化を確認し、未確認を完了扱いしません。

### 7. APIを無効化して再配置（最終状態）

```powershell
pnpm deploy
pnpm db:rows:remote
```

通常配置の`ENABLE_DB_CHECK`はfalseです。認証済みでもGETとPOSTが404になること、未認証は引き続きAccessで遮断されることを確認します。
再配置後のバージョンIDと残存行数を実施記録へ追記します。

## 2回目以降の更新

Accessの有効状態・対象アカウント・例外を再確認 → ローカル検証 → `prepare:cloudflare`で配信物再生成 → 必要なリモートマイグレーション → `pnpm deploy` → 認証済み・未認証検証。
Worker/D1を再作成する必要はありません。DB確認が必要なときだけ`deploy:db-check`を使い、確認後は必ず`deploy`で無効化します。

## 停止・再開

```powershell
pnpm deploy:probe
```

Accessを維持した同じWorker名で仮応答に戻し、認証済みでも本文・静的ファイル・APIを返さないことを確認します。
DBは接続から外れますが削除しません。Accessを無効化しないでください。
再開は配信物を再生成して`pnpm deploy`。ローカル開発の停止はCtrl+Cです。

## 将来公開前の確認とPhase 2引き継ぎ

今回、Accessの解除・検索登録・外部告知・公開URLの恒久決定は行いません。
公開前はAPI無効、テスト行ゼロ、正式URL、プライバシー・保存・停止方針、認証や公開範囲の再設計を確認します。
`robots.txt`やnoindexは認証の代わりにはなりません。
Phase 2で計測を追加する場合は、Static Assetsの既定動作ではHTMLがWorkerを通らないため、対象HTMLを明示して`run_worker_first`へ追加する必要があります。
Lite版の配信ファイル・GitHub Pages設定・GAS・既存Python版はこの配置の対象外です。

## 公式資料（実装時に確認）

- [WorkersとCloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Static Assetsの設定](https://developers.cloudflare.com/workers/static-assets/binding/)
- [D1マイグレーション](https://developers.cloudflare.com/d1/reference/migrations/)
- [ローカルとリモートD1の分離](https://developers.cloudflare.com/d1/best-practices/local-development/)
