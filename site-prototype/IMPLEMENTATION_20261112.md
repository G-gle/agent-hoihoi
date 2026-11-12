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
6. 本番の直前バックアップ `.cloudflare/private/production-prepublish.sql` をローカル復元し、migration前後の投稿9件/詳細511行/日別97行の全列一致を確認。本番専用secretと0005/0006を適用し、実DBでも全既存行を保持。Muse公開日2026-11-12 JSTの4記事を本番Version `df5b7af7-fed2-4c64-8ad1-a047d1407797` で100%配信。公開URL: https://agent-hoihoi-production.molamola.workers.dev/ 。コード実装コミット `daff93b`、作業ブランチ `implement-renew-20261112` をGitHubへpush済み。
7. 本番公開後の読み取り確認完了。全15ページ/案内が200、4記事の詳細ログと日別件数の増加、HOMEに記事一覧を展開しない構成、Muse公開日、質問/省略/投稿フォームへのstate引継ぎ、受付不明の404/noindex、Responsesのサイトマップ除外、stagingのAccess保持を確認。ブラウザでも本番HOME表示を確認。既存投稿は9件のまま、既存詳細511行/日別97行すべて保持（確認後の詳細540行/日別104行）。確認アクセスも通常どおり記録する。
8. 本番と同じ公開日入りのコミット `daff93b` をstagingにも整合反映。最終staging Versionは `05341d70-6d82-4d37-a6df-4765f67c7e60`（100%）。本番/stagingとも専用DB・署名secret・既存通知secret・通常の受付/ログ設定を維持。公開後記録と読み取り確認コマンドの追加は別の記録コミットでpushする。

## 実施した検証

- Nodeのテスト48項目: 環境ガード・通知・既存Cron/保持・DB処理・今回の参加導線。最終一括実行では47成功、既存の実D1並列観測テスト1件がMiniflare内部の例外復元処理で一時失敗。同ファイルを単独実行し3件すべて成功（アプリコードの変更なし）。その前の47項目一括も全成功、gate回帰追加後の参加テスト16件も全成功。
- Pythonの登録テスト3件: 4著者/URL/出典、通常の新記事登録、ID/メタ情報の重複拒否。成功。
- 実workerd/Miniflare + D1 + Node HTTPクライアント: 6件同時再送が1投稿/1受付、絵文字10,000コードポイントPOST成功、131,072バイトのPOST成功/超過413、絶対URL15,000バイトGET成功/超過414、通常登録で追加したテスト記事のGETが詳細ログ/日別件数を増やすことを確認。証拠は `verification/2026-11-12/local-runtime.json`。これはローカルHTTP経路の実測であり、本番Cloudflare経路や全外部取得ツールの上限を保証しない。
- 30分の送信情報期限は署名済み時刻を変えたローカルテストで確認。保存済み照合が期限・投稿間隔より先に働くことを確認。保存失敗・保存結果不明・受付不明・照会不能を区別し入力を保持する。SQL拒否と応答消失も注入して検証。
- ブラウザ: ローカルHOME、Muse独立一覧、通常リンクからの質問、スキップからMuse本文、共通著者表示とリアクションを確認。Cookie/JavaScriptを前提としないHTTP検証と組み合わせている。
- stagingの初回確認で自動承認レビューが既存Access認証先へのアクセスを拒否。利用者が明示許可し、手動ログインを完了。その後は配信済みstaging URLで確認できた。`wrangler dev --remote` は実staging DBへの追加副作用を理由に拒否されたため実行していない。認証/Access設定を変更する迂回はしていない。
- 本番のダミー投稿作成/削除を含む確認は、自動承認レビューが本番データ変更の明示的承認不足を理由に拒否。実行せず、該当処理を確認スクリプトから除去した。`scripts/verify_renew_production.mjs` は読み取りのみで、投稿・回答の保存や削除を行わない。保存/再送/公開判断/返信/タグはstagingとローカルで確認済み。本番の実投稿を試験用に承認/削除していない。
- 実際のメール受信箱への到達は今回独立照合していない。既存GASソースに新しい本文長を拒否する上限がないことと、既存通知secret/bindingの保持、通知単体12テスト（成功/失敗/timeout/1回のみの試行）を確認。通知失敗が保存成功を取り消さない方式を継続している。
- 本番ログの取得前後照合はクライアントとWorkerの時刻差の影響を避け、DBの取得前max(id)を基準にした。過去ログの推測補完はない。

## 完了状態と今後

今回の実装・4記事公開・データ移行・公開後読み取り確認は完了。未実施は本番の試験投稿/削除、メール受信箱との独立照合、更新後Cronの次の自然実行の観測。これらを成功済みとは扱わない。投稿の実処理はstagingで検証し、試験データは片付け済み。

元の作業場所と `implement-v1`/`main` は変更していない。今回の実装は作業ブランチに保存し、同じCloudflare本番Workerへ反映した。コードとDBを機械的に一緒に巻き戻さず、既存の新着受信も保持する。

日常運用の実装後コマンドは `OPERATIONS.md`。本記録の完了点から継続し、今回の調査・ローカル試験を初めから繰り返さない。

## レビュー3点修正（2026-11-12、stagingのみ）

依頼: `AgentHoihoi_Review_Fixes_Codex_20261112.md`。着手時は `implement-renew-20261112` / `b9a2074`、未コミット差分なし。受け取ったレビューは表示/CSSの指摘で、回答・投稿の保存確認は行っていないとの説明だった。以下の保存・遷移・DB確認は今回こちらで実施した結果。

### 修正

1. `public/assets/style.css` のHOME質問グリッドを全幅で1列へ変更。HTMLは元からWho→訪問経験の順だったので維持。質問・選択肢・説明文と、既存のWho→訪問経験→Responsesの処理は変更せず、部分回答・省略を含めて確認した。
2. `src/site.js` に `articleEntry` を設け、独立一覧とResponsesの4記事タイトルで同じ生成処理を使用。通常の `/participate` へ記事ID・本文URL・state・source・backを渡す。Responsesのbackは現在の流入文脈を保持する。質問通過/省略時にbackが落ちていた箇所も目的地まで引き継ぐよう修正。検索用本文URL・canonical・サイトマップの生成は変更していない。
3. ResponsesのChange responseを、現在の署名stateからDBで読んだ `(question_id,target_id)` の保存行がある場合だけ生成。共通4問と記事ごとのリアクションに同じ判定を使用。Other/Not sureを有効な保存済み回答として扱い、新しい回答入口は追加していない。

### 実際の確認

- 関係するローカルテスト `node --test tests/review_fixes.test.mjs` の6件が全成功。Cookie/JavaScriptを使わないWorkerリクエストで、HOME2問の同一単位保存と再送、どちらか片方/両方未回答の省略、未回答/不正state、Whoだけ/共通回答済み、4記事のリンクと本文直リンク/サイトマップ、Other/Not sure、記事単位の変更、同じ行の更新を検証。初回の全試験・migration・投稿/通知試験は繰り返していない。
- stagingの既存Access認証を継続利用し、設定変更なし。幅1280×1000と390×1000の実ブラウザでWho→訪問経験の縦配置を確認。両方とも2問の左位置・幅が一致し、2問目の上端が1問目の下端より下。横はみ出しなし。画像は `verification/2026-11-12-review-fixes/home-desktop.jpg` と `home-mobile.jpg`。
- stagingでResponsesへの直接訪問/有効な未回答stateは全集計が見え、変更リンク0件。Whoだけ回答し訪問経験を省略するとResponsesへ進み、Whoの変更リンクだけを表示。DBでもWhoの1行のみだった。
- 未回答のResponsesの記事タイトルからWhoを質問。Whoだけ回答後はChooser→Purposeへ進む。省略して記事へ進んだ後、次の通常導線で未回答を再質問。共通3問が回答済みの場合は4記事とも目的の本文へ進むことを確認した。
- Other/Not sureでも該当項目の変更リンクが表示される。Muse記事だけリアクションを回答すると、その記事だけ変更リンクを表示。選び直しでIt made sense.が0件、It raised a question.が1件となった。不正stateでは変更リンク0件で4記事の集計を閲覧できた。
- 別の試験単位でもHOMEのWho→訪問経験→Responses（#visit）を実操作し、同じ単位に2行だけ保存。2単位の最終DBは計7行で期待値と一致し、選び直し/表示による二重加算なし。
- 試験用2回答単位の7行だけを終了時に削除し、同じstateのResponsesで変更リンクが0件に戻ることも確認。既存回答をまとめて削除せず、投稿・通知・本番データは操作していない。DB確認/片付けの結果は同じ証跡フォルダの `answers-*.json`。試験単位の識別情報はGit対象外 `.cloudflare/private/review-fixes-groups.json`。

### 配信・確認先

- staging Version: `1e4697d2-a636-4cb9-9b84-99c80b38120a`。確認用URL: https://agent-hoihoi-staging.molamola.workers.dev/ 、https://agent-hoihoi-staging.molamola.workers.dev/responses.html 。HOMEをブラウザに表示して利用者の確認用に保持。
- **本番未反映。** 今回の依頼では本番deploy・DB migration・原稿変更・投稿/メール通知の再試験を行っていない。開始時の本番Versionは `df5b7af7-fed2-4c64-8ad1-a047d1407797`。最終照合は `versions-after.json` に記録する。
- 作業ブランチは `implement-renew-20261112`。修正・対象テスト・画像/検証証跡のコミットは `8aee7cc`（push済み）。この記録と最終Version照合は後続の記録コミットで保存する。次回はこのstagingを利用者が確認した結果から継続し、本番反映の指示があるまで本番へdeployしない。
