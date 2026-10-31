# Research note 03：staging・本番公開反映結果

2026年10月31日（日本時間）。「Owed, Approved, Urgent: When the Trap Is Not an Instruction」をWeb掲載番号03として公開した。stagingから本番へ順に配置し、認証なしの本番GETで新記事の200応答と生成物とのバイト一致を確認した。

- [公開記事03](https://agent-hoihoi-production.molamola.workers.dev/owed-approved-urgent.html)
- [本番Research一覧](https://agent-hoihoi-production.molamola.workers.dev/research.html)
- [対象PR #2](https://github.com/G-gle/agent-hoihoi/pull/2)

## 配置元と配信Version

取り込み前のローカルHEADと取得した `origin/implement-v1` は、ともに指示書の基準 `62e89bdcfa30e1b11eef147b8c5967af45d6bc14` と一致した。対象PRのbaseは `implement-v1`、先端は `8d306553f227a46923cb74fef4cd07d27e643fc8`。8ファイルの変更を確認し、競合なくfast-forwardした。配信元SHAはこの `8d306553f227a46923cb74fef4cd07d27e643fc8` であり、本報告書の文書コミットとは区別する。

反映前Versionは、今回の読み取り専用Cloudflare APIから取得した現行値である。

| 環境 | 反映前Version | 反映後Version | 配信割合 |
| --- | --- | --- | --- |
| staging | `59f310be-7bdd-4692-9d40-89a404d3419f` | `8c39c27c-79d1-4b71-b2e2-fcb5a67b7bea` | 100% |
| 本番 | `ec740091-9f89-4ae5-9179-6301d260810b` | `a0b2d969-635c-4e6c-9f75-6421bcd138a7` | 100% |

各環境のprepare、生成物照合、Wrangler 4.151.3のdry-run、staging配置・表示と保護の確認、本番dry-run・配置・公開GETの順に実行した。配置コマンドは `.cloudflare/wrangler.staging.json` / `.cloudflare/wrangler.production.json` を必ず `--config` で明示し、stagingでは `--env=''` を指定した。実際のアップロード対象は両環境とも新記事・Research一覧・llms・sitemapの4静的ファイルで、14既存ファイルはアップロード済みとして再利用された。

## ローカル検証

- `$env:PYTHONUTF8='1'` と既存 `../.venv/Scripts/python.exe` を使用。buildと `--check` は3記事・更新0件・削除0件で成功。依存の追加や固定版の変更は不要だった。
- 記事用Pythonテスト9件成功。最初のサンドボックス実行ではWindowsの一時フォルダーに対するアクセス拒否で停止し、通常環境で再実行して解消した。
- `render_research.py --check` 成功。既存記事01の完全な原稿からの描画一致を保持した。
- 環境用Nodeテスト4件成功。Node全体は、通常環境で45件中43件成功・2件失敗。1件は受容済みF-01のreceipt文言不一致。もう1件はローカルMiniflare/D1の `agents_and_traps concurrent writes` 検査で、`tests/observation.test.mjs` 単独再実行では当該検査を含む4件すべて成功した。初回サンドボックス実行のlocalhost接続拒否も通常環境で解消した。全体テストが一度ですべて成功したとは扱わない。
- 正規 `scripts/verify.py` は受容済みF-01の `No recent submission confirmed` アサーションで停止した。前回と同じ診断スクリプトで該当1行だけをメモリ内で除外した結果、10 HTMLページ・128内部参照、本文と順序、既存記事01の5表と13外部参照、6 URLのsitemap、全記事を収録したllmsなど残りの検査は成功した。正規の全検証成功とは報告しない。GuestbookとF-01期待値は編集していない。
- `pnpm` のラッパーは実行前の自動依存確認でサンドボックス外ストアへのsymlinkを試み、アクセス拒否で停止した。このため掲載手順で許容される直接実行を使い、buildの `--check` 後に `node scripts/prepare_cloudflare.mjs` を実行した。テストは `node --test`、Wranglerは既存 `node_modules/wrangler/bin/wrangler.js` をNodeから起動した。依存定義・lockfileの差分はない。

## 生成物・公開表示・HTTP

- 配置用18静的ファイルを各環境で照合。記事を含む通常ファイルは `public/` とバイト一致し、llmsの環境注記とsitemapのoriginだけを環境別に確認した。実行側 `src/` も配信元HEADと内容一致した。
- 両環境のResearch一覧は01・02・03の3本。新記事のタイトルは1つ、公開日は `2026-10-31`、署名はMuse。本文6節とSourcesの7目次、全参照先の存在、出典8項目とそこに含まれる5つのHTTPSリンクを確認した。新記事に表はない。原稿04をWeb03として使用し、別原稿03は追加していない。
- stagingは既存認証済みブラウザーで表示を確認した。両環境でResearchから新記事、Sourcesへの移動、本文中のGuestbookリンクからフォームへの移動を確認した。GuestbookはPOST actionとCSRFフィールドの存在をGETで確認し、試験投稿は行っていない。
- 記事03はPC幅1280pxと390px幅で確認した。390px幅では縦スクロールバーを除く `clientWidth = scrollWidth = 375`。両環境のResearch・既存01・02・Home・Guestbookも390px幅で横はみ出しなし。既存01の5表・02の8表、確認したページ内アンカーの参照先を保持した。ブラウザーのviewport検査であり、実端末のタッチ操作試験ではない。
- stagingのllmsとsitemapへの新記事収録を認証済みブラウザーで確認した。本番のllmsとsitemapは公開GETで環境別生成物とバイト一致した。
- 本番はCookie・認証ヘッダーなしのGETで、ルートと18ファイルの計19対象が200。新記事を含む静的対象は配置用生成物とバイト一致。動的4ページは描画済みで `no-store`、Guestbookの既存案内とCSRF注入を確認した。内部DB確認APIはGETで404。
- stagingの未認証GETは同じ19対象で既存Cloudflare Accessへ転送された。内部DB確認APIもAccess保護を維持。本番反映後にも再確認した。

## 配信設定と既存変更の維持

今回取得したbefore / after-staging / finalスナップショットを比較し、両環境のDB UUID、全バインディング、受付・観測フラグ、通知先・通知環境、secretの名前と型、Cron、compatibility date、workers.dev、preview、その他Worker設定が一致した。staging配置中は本番Version、本番配置中はstaging Versionを保持した。

DB API操作・migration・初期化、秘密値の取得・再登録、Access設定変更、試験投稿は実施していない。CloudflareへのAPI認証には既存Wrangler認証を使用し、資格情報は出力・証跡保存・コミットしていない。新記事単独のアクセス集計、観測・通知・Lite版の変更はない。

既存の `README.md`・`SECURITY.md`・`docs/V1_SPEC.md` の未コミット差分を保持した。取り込み前と配置後の `git diff --binary` のSHA256は、ともに `2c69b792fc7c30ea25881591a485a8bdcacf754cea6626b12b2c8dd5f6c4dff8`。既存未追跡ファイルも保持し、報告書以外の新たな追跡ソース差分はない。

## Git保存と残件

記事コミットは `implement-v1` に通常pushし、fetch後のHEADと `origin/implement-v1` が配信元SHAで一致、ahead/behindは0/0と確認した。GitHub APIではPR #2がclosed・`merged: true`、取り込みSHAが同じであることを確認した。取り込み時刻は2026年10月31日12:27:45 JST。mainの先端は `461ac07de2850682c06ca1edc0020f982a34abaf` のまま。

本報告書も文書コミットとして通常pushし、fetch後にHEADと `origin/implement-v1` の一致・ahead/behind 0/0を確認した。最終Git HEADは本報告書を含む文書コミットで、上記配信元SHAとは異なる。

証跡はローカルの `.cloudflare/article03-20261031/` に保存した。設定スナップショット・生成設定・生ログ・試験出力・既存差分のバックアップはコミット対象に含めない。

依頼範囲の記事公開と配信確認に残件はない。受容済みF-01は継続。Node全体実行で一度失敗したローカルD1並行検査は単独再実行で成功しており、今回のWorkerソース変更はないが、一時的失敗の原因特定・テスト安定化は実施していない。
