# Research一覧・記事組み込みの確認報告

2026年10月24日（日本時間）。本書はローカル組み込み時点の記録です。その後、一覧の番号表示を調整し、stagingで確認して本番へ反映しました。最新の公開状態は [公開結果](RESEARCH_RELEASE_20261024.md) を参照してください。

まず **http://127.0.0.1:4173/research.html** を開いてください。

| 対象 | HTMLファイル | ローカルURL |
| --- | --- | --- |
| Research一覧 | [public/research.html](public/research.html) | http://127.0.0.1:4173/research.html |
| 第1弾 | [public/agent-traps.html](public/agent-traps.html) | http://127.0.0.1:4173/agent-traps.html |
| 第2弾 | [public/agents-and-traps.html](public/agents-and-traps.html) | http://127.0.0.1:4173/agents-and-traps.html |
| Home | [public/index.html](public/index.html) | http://127.0.0.1:4173/index.html |

再起動する場合は、Python 3が利用できる環境で `site-prototype/` に移動し、`python scripts/serve.py --port 4173` を実行します。終了はCtrl+Cです。

静的プレビューのため、投稿処理や観測記録は実行しません。

## 変更ファイル

すべて `site-prototype/` からの相対パスです。

| ファイル | 変更内容 |
| --- | --- |
| `public/research.html` | 指定の2本を掲載するResearch一覧 |
| `public/agent-traps.html`（新規） | 作業開始時の第1弾HTMLを移し、一覧へ戻るリンクを追加 |
| `public/agents-and-traps.html`（新規） | 確認済み第2弾を組み込み、カテゴリ表示・戻る導線・サイト内URLを調整 |
| `public/assets/article2.css`（新規） | 確認済み第2弾専用CSSをそのまま複製 |
| `public/assets/style.css` | 後続の番号表示調整で、Homeと一覧のグリッド列幅・間隔を共通化 |
| `public/index.html` | 記事紹介部分に両記事への直接リンク。既存の一覧へのリンクも保持 |
| `public/llms.txt` | Research一覧と個別2記事を案内。既存の観測概要・Guestbook等の掲載方針は保持 |
| `public/sitemap.xml` | Home・一覧・2記事・Aboutの5 URL。ローカルURL設定は維持 |
| `scripts/render_research.py` | 第1弾の生成先を `agent-traps.html` に変更。戻るリンクと現行フッターのaria-labelを反映 |
| `scripts/write_sitemap.py` | 元のサイトマップ生成処理に2記事を追加 |
| `scripts/prepare_cloudflare.mjs` | staging用サイトマップの生成対象に2記事を追加 |
| `scripts/prepare_production.mjs` | 本番候補サイトマップの生成対象に2記事を追加。既存の全資産コピー処理を維持 |
| `scripts/verify.py` | 9ページ構成・新しい記事配置・リンク・サイトマップの検査対象を更新 |
| `tests/environments.test.mjs` | 生成物のサイトマップ5 URL・llmsの7導線を検査 |
| `tests/observation.test.mjs` | 新記事2 URLが計測対象外のままであることを既存検査に追加 |
| `README.md` | 新しい構成と本報告への参照を追記 |
| `RESEARCH_INTEGRATION.md`（新規） | この報告 |

検証コード・画像・結果はローカルの `verification/2026-10-24-research-integration/` に保管しています。配信資産・Git保存対象には含めていません。サイト一式のコピーやZIPは作成していません。

## 確認結果

- PC幅1280px・スマートフォン相当幅390pxのEdgeで、一覧・Homeの変更箇所・両記事の表示を確認。ページ全体の横はみ出し、ブラウザーエラー、資産取得エラーはありません。
- Researchタブ→一覧→両記事、記事→一覧、Home→両記事を実際にクリックして確認しました。一覧と両記事ではResearchが現在カテゴリとして表示されます。
- 第2弾から第1弾第3章へ移動し、`agent-traps.html#chapter-3` と章IDの一致を確認しました。両記事の目次・観測概要・Guestbookのリンク先も確認しました。サイト内リンクから本番へ移動しません。
- 第1弾の本文・表・目次は開始時HTMLとDOMで一致。第2弾の本文・表・目次は確認済みHTMLと、指定されたサイト内URL変更を除いてDOMで一致。両記事の控えめなフッターリンクの文言・aria-labelも保持しました。記事組み込み時点では共有CSSは変更せず、後続の番号表示調整で一覧とHomeのグリッド指定だけを共通化しました。
- 第2弾の招待文は初期状態で閉じ、クリック／タップ、Tab→Enter→Spaceで開閉できます。キーボードのフォーカス表示も確認しました。
- `render_research.py --check` は成功。通常の再生成でもResearch一覧と第1弾HTMLが変わらないことを確認しました。第1弾を旧Markdownから作り直して移す方法は使っていません。
- 環境別生成・Worker・観測の関連テスト **19件成功**。環境別生成は一時領域でstaging・本番候補を作り、2記事と専用CSSを含む資産の保持、サイトマップ、環境分離を確認しました。実環境の設定・配信・DBには接続していません。
- Wranglerの **dry-run成功**。静的資産17ファイルを読み込み、Workerをビルドしました。新記事は既存Static Assetsで配信されるため、ルート・Workerソースの追加変更は不要です。
- 既存の `scripts/verify.py` は、今回の9ページ・リンク・第1弾本文の検査を通過後、受容済みF-01（投稿完了ページの固定成功表示）に関する既存アサーションで停止します。この無関係な問題とテスト期待値は変更していません。F-01より後のサイトマップ・llmsの内容は別の確認と環境別テストで検証しました。

外部出典の再調査・外部リンクの現在のHTTP応答、スマートフォン実機、Edge以外のブラウザーは未確認です。試験投稿や通知試験は行っていません。

## 維持した範囲と制約

ブランチは `implement-v1`、HEADは `a3fb4c97edc1bc5911119f39abf323c5936c4762` のままです。作業開始前の無関係な変更を保持し、本番・stagingへのデプロイ、コミット・pushはしていません。DB・受付・承認・通知・Cron・robots・Access・Lite版も変更していません。

旧URL `research.html#chapter-*` は一覧のURLになるため、外部に残るリンクから旧記事の各章へ直接到達できません。今回は互換転送を追加していません。今後の参照先は `agent-traps.html#chapter-*` です。

既存のResearch観測は `/research.html` のURL単位です。今回の構成を将来公開した後は、同じ `research` 区分が記事本文ではなく一覧のリクエストを数えます。過去の集計は保持し、新しい2記事の計測・イベント・DB項目は追加していません。

後続の番号表示は幅1280px・390pxで確認し、番号「01」「02」の位置・フォント・列幅・間隔がHomeと一致すること、タイトルに重複番号がないことを確認しました。一覧はHTML直接編集で、専用の生成元はありません。

PC・スマートフォン相当の一覧とHome変更箇所の画面例、`browser-results.json`、`preservation-results.json` は前記のローカル検証フォルダーに保管しています。画像・ログはこの報告書に同梱しません。
