# Home整理・記事追加共通化：公開反映結果

2026年10月30日（日本時間）。PR #1の3コミットを `implement-v1` にfast-forwardで取り込み、ローカル検証、staging反映・確認、本番反映・確認、通常pushを実施した。実記事03以降は追加していない。

## 配信結果

| 環境 | 反映前Version | 反映後Version | 配信割合 |
| --- | --- | --- | --- |
| staging | `ee8fcabd-d2d2-463b-b50c-3992a59c79cf` | `59f310be-7bdd-4692-9d40-89a404d3419f` | 100% |
| 本番 | `16603216-e00c-4f63-b538-df09c91d1684` | `ec740091-9f89-4ae5-9179-6301d260810b` | 100% |

- [本番Home](https://agent-hoihoi-production.molamola.workers.dev/)
- [本番Research](https://agent-hoihoi-production.molamola.workers.dev/research.html)
- [staging Home（既存Access認証が必要）](https://agent-hoihoi-staging.molamola.workers.dev/)

配置元は `912b712c1c19ab09fb36d8fd3df78d7e4a7c4b7c`。反映対象の `public/`・`src/`・生成処理は同コミットと一致する。今回の報告書は配信対象外。各環境の生成設定を `--config` で明示し、dry-run成功と結果確認を挟んでstagingから本番へ順番に反映した。

## 検証結果

- Pythonは既存の `repository/.venv/Scripts/python.exe`（3.12.14）を使用。不足していた `requirements-research.txt` の固定依存3件だけを導入。既存Node依存とlockfileは更新していない。
- buildと `--check` は成功。既存2記事、追加記事なし、削除なし。初回buildの3ファイル更新はチェックアウト時のCRLFからLFへの正規化で、Git上の内容差分はない。再実行は更新0件。
- 専用テスト9件成功。確認用の第3記事を持つ一時コピー内で実行する環境テスト4件も成功。Windows既定CP932ではテストの暗黙の文字コード指定と子プロセス出力の読み取りが失敗したため、`$env:PYTHONUTF8='1'` を設定して再実行し解消した。追跡テストの編集は行っていない。
- `render_research.py --check` 成功。Nodeは45件中44件成功（通常2記事状態の環境テスト4件を含む）。残る1件は受容済みF-01のGuestbook receipt表示不一致だけ。
- 正規の `scripts/verify.py` は同じF-01の `No recent submission confirmed` アサーションで停止。該当1行だけをメモリ内で除外した診断は、9ページ・107内部参照、記事本文・順序・13外部参照、発見用ファイルなどの残りの検査に成功した。正規の全検証成功とは扱っていない。アサーション、Guestbook本文・動作は維持した。
- サンドボックス内での一時フォルダー・ローカル接続・Wranglerログ書き込み制限による失敗は、通常の実行環境で再実行して解消した。新しい未解消のテスト失敗はない。

## 表示・配信・保護

- 両環境でHome、Research、既存記事01・02、Guestbookを1280px・390px幅で確認。ページ全体の横はみ出しなし。Homeの個別記事リンクと固定記事数表示は撤去され、Researchへの導線を保持。Researchの2記事の番号・タイトル・概要・リンクを確認した。
- 記事01の5表、記事02の8表、本文、目次参照先、フッターを保持。確認したページ内アンカーに欠落なし。GuestbookはGETでフォーム、既存案内、hidden csrf、POST actionを確認した。試験投稿は行っていない。
- 配置用17ファイルを各環境の生成設定と照合。環境別sitemapの5 URL、llmsの既存記事リンク・環境注記を確認。本番生成物にlocalhost・staging URL・staging用公開案内は混在しない。
- 本番はCookie・認証ヘッダーなしのGETで、ルートと17ファイルの計18対象が200。静的対象は生成物とバイト一致。動的4ページは描画済みかつ `no-store`、Guestbookの案内はソースと一致しcsrf注入済み。内部DB確認APIはGETで404。
- stagingは認証済みブラウザーで閲覧。未認証HTTPクライアントでは18対象と内部DB確認APIが既存Cloudflare Accessへ302転送。本番反映後にも保護を再確認した。ログイン時の一時的な `invalid state` はstagingから開き直して再ログインし解消した。
- 読み取り専用Cloudflare APIで、両環境のDB UUID・全バインディング・受付／観測フラグ・通知先／環境・secretの名前と型・Cron・compatibility date・workers.dev／preview・その他Worker設定が反映前後で一致した。本番反映中もstaging Versionは保持され、staging反映中も本番Versionは保持された。秘密値の取得・出力・再登録、DB API操作、migration、Access設定変更は行っていない。

## Git保存と残件

取り込み前HEADと `origin/implement-v1` は `1164fca7fed1fb8c0977cc742c540941050709e9`。PR先端は指示書記載の `912b712c1c19ab09fb36d8fd3df78d7e4a7c4b7c` と一致し、競合なくfast-forwardした。通常push後、GitHub APIで [PR #1](https://github.com/G-gle/agent-hoihoi/pull/1) が `merged: true`・closed、取り込みSHAが同先端であることを確認した。取り込み時刻は2026年10月30日17:04 JST。

本報告書を含む文書コミットも `implement-v1` に通常pushし、fetch後の `HEAD` と `origin/implement-v1` の一致、ahead/behindが0/0であることを照合した。最終HEADはこの文書を含むコミットで、配信元SHAとは区別する。既存の `README.md`・`SECURITY.md`・`docs/V1_SPEC.md` の未コミット差分と未追跡ファイルを保持し、今回のソース差分は残していない。既存追跡ファイルの未コミット差分は作業前後で一致した。mainへの反映、force pushは行っていない。

証跡はローカルの `.cloudflare/research-20261030/` に保存。生成済み設定、設定スナップショット、認証情報、DBデータ、画像、生ログはコミット対象に含めない。

実記事03以降の掲載、確認用新記事のモバイルプレビュー、実メール送受信、Access管理アプリ一覧の再監査は未実施。今回の依頼範囲の反映・確認に未完了事項はない。

補足として、stagingの `llms.txt` 単独ブラウザー表示で一部の英語約物が文字化けした。本番GETの `Content-Type` は既存の `text/plain`（charsetなし）で、UTF-8として取得した本文は正常、かつ生成物とバイト一致する。Worker・当該本文の内容は基点から変更されておらず、既存の文字コード判定に起因すると考えられる。今回は配信ヘッダーの改修を追加せず保持した。
