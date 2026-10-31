# Web掲載番号03（原稿04）：掲載準備結果とWindows Codexへの配置依頼

2026年10月31日（日本時間）。Workで原稿の掲載用整形・生成・ローカル検証を完了。**staging・本番への実配置は未実施**。既存Windows環境のCloudflare認証を利用して、下記の順に反映してください。

## 掲載する内容

- タイトル：Owed, Approved, Urgent: When the Trap Is Not an Instruction
- 原稿：Libraryの `agent-hoihoi-research-note-04-revised-v2.md`（`libfile_30a17e2b483c81919977e62a73936c21`）。入力SHA256は `d2d759afe28516570799fda4cd21c890c89ee8a97c0ac7aaac6a2e34a4d6f2ca`。
- 掲載用Markdown：`content/research/owed-approved-urgent.md`。
- Web掲載番号03、公開日2026-10-31、署名Muse。ユーザーの指定により、原稿ファイル名の04とは別にWebでは連番を使用する。一覧は01・02・03の3本になる。別原稿 `agent-hoihoi-research-note-03.md` は今回の掲載対象ではない。
- 本番での予定パス：`/owed-approved-urgent.html`。
- 草稿表示と二重のタイトル・日付を除去。公開日をメタデータへ移し、出典をクリック可能にし、Sourcesを目次へ追加。既存記事とGuestbookは相対リンクに整形した。
- 書式変更を正規化した可視本文が入力原稿と一致することを確認。意味・数値・順序・出典番号は変更していない。掲載済みの01・02から独立して読める原稿を使い、別原稿03への依存はない。

## 実施済みの確認

- `build_research.py` と `--check` 成功。01・02・03の3記事、再生成差分なし。
- 記事用Pythonテスト9件合格。実記事追加後に固定記事数・試験用番号の衝突で3失敗・1エラーを再現し、既存テストだけを現行台帳と未公開原稿の番号に追従するよう修正して解消した。生成処理・本体処理は変更していない。
- 環境用Nodeテスト4件合格。Node全体は依存導入前には未導入による起動失敗があり、固定lockfileどおり導入後に実行すると、受容済みF-01のreceipt表示不一致のみ失敗した。F-01は変更しない。
- `render_research.py --check` 成功。既存記事01の原稿と生成物の完全一致を保持。
- staging・productionそれぞれのprepareを実行。新記事、sitemap、llmsへの収録、環境別URL、生成済み静的本文の一致を確認。
- Wrangler 4.151.3の両環境dry-runで梱包・バインディング列挙・終了表示を確認。実配置は行っていない。
- ブラウザーでResearchから記事への導線、1つのタイトル、本文6節とSourcesの7目次、出典8件、Sourcesへの移動を確認。
- PC表示と390pxのiframe内表示で、記事・Research一覧の横はみ出しなし。iframe内は縦スクロールバーを除く375pxでscrollWidth=clientWidth。実端末のタッチ操作試験ではない。
- `requirements-research.txt` と `pnpm-lock.yaml` に従って依存を導入。依存定義・lockfileは変更していない。

## Windows側で実施する作業

既存リポジトリ：`D:/Users/molamola/app/Agent-hoihoi/repository`。作業対象は `site-prototype/`。正本ブランチは `implement-v1`、取り込み前の基準SHAは `62e89bdcfa30e1b11eef147b8c5967af45d6bc14`。

1. 現在の作業ツリーとリモート先端を確認し、この変更のPRを `implement-v1` に取り込む。既存の無関係な変更は保持する。既に取り込み済みなら再適用しない。mainへは反映しない。
2. Windowsでは `$env:PYTHONUTF8='1'` を設定し、既存の `../.venv/Scripts/python.exe` を使用。build、`--check`、記事用テスト9件、既存記事renderの `--check` を実行する。必要な依存だけを固定版で補う。
3. `RESEARCH_PUBLISHING.md` と前回の `RESEARCH_DEPLOYMENT_20261030.md` に従い、現在の配信Versionと設定を確認する。古い報告書のVersionを現行値として扱わない。
4. 現行ターゲットでprepare → 生成物照合 → dry-run → Access保護下のstagingへ反映 → 表示・配信確認 → productionへ反映 → 公開GET確認の順に進む。両環境は下記コマンドの `--config` を明示する。stagingのトップレベル設定を対象にする場合、Wranglerの環境指定警告には `--env=""` を使用できる。

```powershell
pnpm exec wrangler deploy --dry-run --config .cloudflare/wrangler.staging.json --env=""
pnpm exec wrangler deploy --config .cloudflare/wrangler.staging.json --env=""
# stagingでの確認後
pnpm exec wrangler deploy --dry-run --config .cloudflare/wrangler.production.json
pnpm exec wrangler deploy --config .cloudflare/wrangler.production.json
```

5. Researchの番号01・02・03、新記事のタイトル・日付・本文・目次・出典リンク・Guestbook導線、llmsとsitemapへの収録を確認する。新記事に表はない。既存01・02・Home・Guestbookも簡潔に確認する。stagingの未認証アクセスは従来どおりAccessで遮断されることを確認する。
6. DBバインディング、受付・観測・通知設定、secretの名前と型、Cron、compatibility date、workers.dev・preview等が既存設定と一致することを確認する。記事更新のためのDB操作・migration・初期化、試験投稿、Access設定変更、秘密値の取得・再登録は不要。
7. 配置元SHA、配信Version、検証結果、残件を完了報告へ保存し、通常push後にfetchして同期を確認する。記事の公開確認が終わるまで「公開済み」と報告しない。

## 既知事項

F-01は完了ページの固定成功表示に関する受容済み事項。Nodeのreceiptテストと `verify.py` の該当アサーションは失敗するため、正規の全検証成功とは報告しない。今回の範囲でGuestbookやテストのF-01期待値を改修しない。

新記事単独のアクセス集計は今回追加していない。既存の計測範囲を維持する。配信設定・観測・通知・Lite版の変更はない。
