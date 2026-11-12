# AgentHoihoi 本体更新 作業記録

開始日: 2026-11-12 JST。依頼元: Implementation_Start_Codex_Instructions_20261112 と同梱8資料。サイト設計 v0.3 追補13・実装詳細案を基準に、4記事、質問、回答集計、投稿・返信・受付、案内とアクセス記録を実装し、検証後に既存Cloudflare環境へ反映する。

## 基準と保護

- 元作業場所: `D:/Users/molamola/app/Agent-hoihoi/repository`。`implement-v1` HEADとリモートは `e8773ed85c498057165075ab1333bedc6710f3ee`。元のルート文書等に未コミット変更・多数の未追跡検証ファイルがあるため変更しない。site-prototype の追跡ソースに未コミット変更なし。
- 作業場所: `D:/Users/molamola/app/Agent_hoihoi_renew/repository/site-prototype`。独立コピーのブランチ `implement-renew-20261112`。
- 既存のWorkers/D1環境照合、通知、管理CLI、観測データ保持と90日削除を継承する。秘密値、受付ID、投稿本文、送信URL全体はこの記録とGitへ出さない。
- 原稿4本の本文を維持。Muse原稿内の自己紹介・サイト紹介と共通著者表示に意味の重なりがあるが、本文として残し、共通部は著者・公開日・リアクションだけを表示する。Research末尾の固有呼びかけも残す。出典見出しは本文に含まれるものだけを表示する。

## 進行

1. 現行環境: ローカル・リモートGit照合済み。Cloudflare既存OAuth認証と対象アカウント一致、Worker/D1対応、実スキーマ、migration 0001〜0004適用済みを確認。開始時Versionはstaging `8c39c27c-79d1-4b71-b2e2-fcb5a67b7bea`、本番 `a0b2d969-635c-4e6c-9f75-6421bcd138a7`。
2. 完了: 4記事・HOME/独立一覧/About、共通質問・署名state・回答更新/Responses、GET/POST共通投稿・同時再試行照合・返信タグ・受付/ステータス、noindex/案内ファイル・新記事ログ連動、既存承認CLIのrejectと記事別ログ絞り込み、運用文書。
3. 完了: 両環境のSQLバックアップを `.cloudflare/private/` に保存。SQLiteへ復元し、0005/0006適用前後の旧投稿UUID/本文/日時/状態・詳細ログ全列・日別件数一致を照合。stagingは投稿2件/詳細154行/日別28行、本番は投稿9件/詳細510行/日別96行。証拠は `verification/2026-11-12/backup-restore.json`。秘密を含むバックアップ本体はGit対象外。
4. 完了: stagingのみ専用 `PARTICIPATION_SECRET` を非公開設定。migration `0005_participation.sql`、`0006_registered_article_logs.sql` を適用し、実DBでも既存全件保持・外部キー整合を照合。最終検証Version `533bd65e-7e6a-4578-bc5a-aea367da9cfc`。初回staging投稿で既存gateがミリ秒・新処理が秒だった不一致を発見し、DB値を変更せず既存単位へ揃えた。回帰テストを追加し、stagingで再検証済み。
5. stagingの実配信検証完了。利用者のAccess認証先許可・手動ログイン後に確認。4記事、共通質問、リアクション/Responses、GET/POST投稿、同じ送信の元受付への再送、受付非公開、承認後の公開リンク、返信、reject、Unfinished Outputs抽出、GET 15,000/15,001バイト、絵文字を含む10,000文字POST、全4記事のログを確認。今回のダミー4投稿・回答単位の4回答だけを削除。既存2投稿と全既存ログの保持を再照合。詳細は `verification/2026-11-12/staging-*.json`。
6. 本番は直前まで開始時Version/投稿9件のまま。新しい直前バックアップを `.cloudflare/private/production-prepublish.sql` に保存し、本番bundleのdry-run成功。Muse公開日を2026-11-12 JSTとして原稿に設定しbundle生成。本番の専用secret設定・migration・配信・公開後確認は次の手順。

## 実施した検証

- Nodeのテスト48項目: 環境ガード・通知・既存Cron/保持・DB処理・今回の参加導線。最終一括実行では47成功、既存の実D1並列観測テスト1件がMiniflare内部の例外復元処理で一時失敗。同ファイルを単独実行し3件すべて成功（アプリコードの変更なし）。その前の47項目一括も全成功、gate回帰追加後の参加テスト16件も全成功。
- Pythonの登録テスト3件: 4著者/URL/出典、通常の新記事登録、ID/メタ情報の重複拒否。成功。
- 実workerd/Miniflare + D1 + Node HTTPクライアント: 6件同時再送が1投稿/1受付、絵文字10,000コードポイントPOST成功、131,072バイトのPOST成功/超過413、絶対URL15,000バイトGET成功/超過414、通常登録で追加したテスト記事のGETが詳細ログ/日別件数を増やすことを確認。証拠は `verification/2026-11-12/local-runtime.json`。これはローカルHTTP経路の実測であり、本番Cloudflare経路や全外部取得ツールの上限を保証しない。
- 30分の送信情報期限は署名済み時刻を変えたローカルテストで確認。保存済み照合が期限・投稿間隔より先に働くことを確認。保存失敗・保存結果不明・受付不明・照会不能を区別し入力を保持する。SQL拒否と応答消失も注入して検証。
- ブラウザ: ローカルHOME、Muse独立一覧、通常リンクからの質問、スキップからMuse本文、共通著者表示とリアクションを確認。Cookie/JavaScriptを前提としないHTTP検証と組み合わせている。
- stagingの初回確認で自動承認レビューが既存Access認証先へのアクセスを拒否。利用者が明示許可し、手動ログインを完了。その後は配信済みstaging URLで確認できた。`wrangler dev --remote` は実staging DBへの追加副作用を理由に拒否されたため実行していない。認証/Access設定を変更する迂回はしていない。

## 再開位置

stagingの必要な確認は完了。本番専用secret、直前バックアップのローカル復元/移行確認、0005/0006適用・全件保持確認、deploy、公開後の表示・導線・ログを確認する。Muse公開日は2026-11-12を設定済み。本番の実投稿をテスト用に公開/削除しない。コードとDBを機械的に一緒に巻き戻さない。既存の新着受信も保持する。

日常運用の実装後コマンドは `OPERATIONS.md`。本記録の完了点から継続し、今回の調査・ローカル試験を初めから繰り返さない。
