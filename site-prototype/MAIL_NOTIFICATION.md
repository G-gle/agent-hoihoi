# 新着投稿メール通知（2026-10-23）

## 実装

新規投稿のD1 transactionが正常完了した後だけ、`ctx.waitUntil()` に通知を1件登録します。保存に使ったID・ISO日時・名前・改行を正規化した本文を、そのままGASへJSON POSTします。受付応答（303、完了ページ、receipt Cookie）は通知完了を待ちません。投稿はpendingのままです。

`src/guestbook_notification.js` は標準のリダイレクト追従を使い、HTTP成功とJSONの `ok === true` の両方でGAS送信成功を判定します。通信と応答JSON読み取りを合わせて20秒で打ち切ります。通信断・タイムアウト・不正な応答は送信結果不明として記録し、再送しません。設定不足は成功と区別してskipします。ログは固定のイベント名、環境、保存ID、結果、分類だけです。

DB migration、通知状態の保存、重複防止、再試行、キュー、Cronの追加はありません。既存の受付制限、管理CLI、観測処理、公開サイトの本文・資産は変更していません。過去のpending投稿は通知しません。

既存フォームは名前の空欄をそのまま保存・通知要求へ使用します。当初のGASは空欄名を拒否する仕様でしたが、運営者が同じURLで名前空欄対応版へ更新しました。更新後の本番実投稿による確認結果は末尾の追記に記録しています。Workers側で空欄を別名へ置き換えていません。

## 設定と運用

prepareが環境別standalone設定へ以下の公開varsを生成します。

- `GUESTBOOK_NOTIFY_URL`：提供済みGAS `/exec` URL。
- `GUESTBOOK_NOTIFY_ENVIRONMENT`：`staging` または `production`。クライアントからは選択できません。
- `GUESTBOOK_NOTIFY_SECRET`：公開varsには含めません。運営者がGASと同じ既存値をWorkers secretへ対話入力します。

`scripts/set_guestbook_notify_secret.mjs --env staging|production` は生成済み設定のWorker名・アカウント・DB UUID・通知設定を照合してから、Wranglerの対話入力へ移ります。作業ディレクトリに依存せず、秘密値を引数やファイルへ保存しません。Wranglerの `secret put` は既存Workerの新しいVersionを配信する操作でもあります。

リポジトリの `site-prototype/` から、環境を明示して実行します。Node.js 22以降と既存Wrangler認証が必要です。

```powershell
node scripts/set_guestbook_notify_secret.mjs --env staging
node scripts/set_guestbook_notify_secret.mjs --env production
```

prepareの `--env` は生成対象の選択です。Wranglerへ `--env production` を付けず、`.cloudflare/wrangler.production.json` または `.cloudflare/wrangler.staging.json` を指定します。prepare → 対象・生成物検証 → dry-run → deployの既存手順を維持します。今回の保存作業では再デプロイせず、DB作成・migration適用・Access設定変更も行いません。

## GASソースの保存と再現

名前空欄対応版を `gas/Agent_Hoihoi_Mail_Notification.gs` に保存しています。運営者から提供された更新済みソースとバイト一致を確認しました。`name` は文字列であれば空文字を受け付け、メール内の `Name:` も空欄のままです。

再現する場合は、このファイルをGASプロジェクトへ貼り付け、Script propertiesに通知先の `NOTIFY_TO` と共有秘密値の `NOTIFY_SECRET`（32文字以上）を設定します。通知先や秘密値はソースに記載しません。`testEmail` を手動実行してMailApp権限を承認し、Webアプリを「実行ユーザー：自分」「アクセスできるユーザー：全員」で公開します。既存URLを維持する更新は既存デプロイのバージョンを更新し、Workers secretには同じ共有秘密値を使用します。この手順の説明に伴うGASの再公開や試験送信は今回行っていません。

## 検証・配置状況

- 作業開始：`implement-v1` / `61b6332221e0b3adba0c299aaa6b12c4d7ca4857`。既存の無関係な未コミット・未追跡ファイルは保持。
- 開始時本番Version：`8ab9c95a-5654-40e3-bf41-0d7f01e400f9`（100%）。staging：`f77d9c79-8c5e-4095-bd90-72f383ff35ea`（100%）。
- 通知単体テスト12件＋Worker/D1統合テスト4件が成功。保存値の一致、1回だけの要求、拒否・rollback時0回、設定skip、HTTP失敗、GAS拒否、HTML、不正JSON、通信・本文読み取りのタイムアウト、再送0回、通知待ちなしの303とpending非公開を検証。
- `node --test tests/*.test.mjs`：45件中44件成功。失敗1件は既存の完了ページ固定表示（受容済みF-01）。今回の変更で期待値やサイト本文を変えていません。ローカルD1はsandboxのlocalhost通信制限外で検証。
- Git保存時の再確認：通知単体12件、環境設定4件、通知Worker/D1統合4件の計20件が成功。保存したGASソースも構文とmockで空欄名受理・本文改行と日時維持・不正payload拒否・認証拒否・GETを確認。実メールの再送信はしていません。
- 両環境のprepare・固定対象照合・Wrangler dry-runは成功。source `public/`、DBスキーマ、受付制限、既存Cronに変更なし。
- Windowsから認証Cookieなしの外部GET：HTTP 200、`{"ok":true,"service":"agent-hoihoi-mail","version":1}`。
- Windowsから不正な秘密値の外部POST：HTTP 200、`{"ok":false,"error":"unauthorized"}`。通知送信成功とは別の確認。
- 反映前の未認証stagingは302でAccessへ遷移、本番は200。認証済みブラウザではstagingフォームを表示。既存投稿はstaging 2件、本番0件。本文を出力しないハッシュをローカルの `.cloudflare/mail-notification/before.json` に記録。Access設定は変更していません。
- Google内の `testEmail` 受信成功は運営者の事前確認として扱い、今回の外部試験とは区別。
- 秘密値登録：運営者が両環境へ対話入力済み。リモートbindingに `GUESTBOOK_NOTIFY_SECRET`（secret_text）があることを確認。値は取得・出力していません。
- staging：通知コードをVersion `044c38ad-152e-48f6-931a-7cbe635823ee` へ通常deploy済み。資産のアップロード差分なし、DB binding・既存Cronを維持。配置元は上記HEAD＋本書の変更ファイルのローカル差分。配置時にソースハッシュを照合済み。
- stagingで識別用投稿1件を送信し、pending保存、保存値の一致、公開一覧に未表示、完了画面への遷移を確認。通知結果ログは `sent / gas_send_succeeded`（GAS `ok:true`）。運営者が `[STAGING]` 件名のメール受信とID・保存日時・名前・本文・改行の一致を確認。その後、照合済みの試験IDだけを既存CLIで削除。既存2投稿は開始時ハッシュと一致。再送していません。
- 反映後の未認証Access検証：14 GET対象、内部API POST、投稿POSTの計16ケースすべてでstagingの保護を確認。
- 本番：Version `c07e9cc3-5086-4836-83e7-032aea807754` へ通常deploy済み。配置元は上記HEAD＋本書の変更ファイルのローカル差分で、ソースハッシュ照合済み。資産の差分アップロードなし、本番D1・既存Cron・公開経路を維持。
- 本番で識別用投稿を1件だけ送信し、pending保存、保存値、公開一覧に未表示、完了画面への遷移、通知ログ `sent / gas_send_succeeded`（GAS `ok:true`）を確認。運営者が本番件名（`[STAGING]` なし）のメール受信とID・保存日時・名前・本文・改行の一致を確認。その後、承認せず当該試験IDだけを既存CLIで削除済み。再送していません。
- 配置後の未認証本番GET：ルートを含む14ページ・資産がすべて200。静的配信物は生成済み本番ファイルと一致、動的ページのno-store・pending非公開、内部DB確認APIの404、stagingのAccess遷移を確認。
- 最終照合（2026-10-23 20:52 JST）：両環境の配信Versionは上記と一致（100%）。stagingの既存2投稿、本番0投稿は開始時ハッシュと一致。試験投稿2件だけを個別削除し、既存投稿・観測記録・集計は消去していません。観測件数の増加には今回の確認アクセスが含まれます。
- 本依頼の配置・実通知・受信照合・試験投稿の片付けは完了。通知に関係する本書の変更ファイルだけを `implement-v1` へ保存する対象とし、無関係な既存差分を保持しています。受容済みF-01は残ります。空欄名対応の追加確認は末尾に記録しています。

GASの `ok:true` はGAS送信処理の成功です。実際の受信確認は別に行い、両環境とも運営者が環境、投稿ID、保存日時、名前、本文・改行の一致を確認しました。

ローカル証跡は `.cloudflare/mail-notification/` 内に記録：`source-manifest.json`（配置元の各変更ファイルSHA-256と基準コミット）、`source-tracked.patch`、`before.json`／`final.json`、環境別fixture・通知結果JSONL、stagingのAccess確認、本番HTTP確認、受付画面PNG。秘密値や通知先アドレスは含めていません。既存の `verification/` は変更・取り込みしていません。

## 変更ファイル

- `src/guestbook_notification.js`（追加）、`src/guestbook.js`、`src/worker.js`
- `scripts/guestbook_notification_config.mjs`（追加）、`scripts/set_guestbook_notify_secret.mjs`（追加）
- `scripts/prepare_cloudflare.mjs`、`scripts/prepare_production.mjs`
- `tests/guestbook_notification.test.mjs`（追加）、`tests/guestbook.test.mjs`、`tests/environments.test.mjs`
- `gas/Agent_Hoihoi_Mail_Notification.gs`（名前空欄対応済みソース）
- 本書

秘密値・通知先メールアドレス・ローカル証跡・生成物はGit保存対象に含めません。本書から参照する `.cloudflare/` 内の証跡もローカル専用で、同梱しません。

参考：[Workers waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)、[GAS Content Service](https://developers.google.com/apps-script/guides/content)、[GAS Web Apps](https://developers.google.com/apps-script/guides/web)。

## 追記：GASの名前空欄対応後の実投稿確認

2026-10-23、運営者が同じGAS公開URLを名前空欄対応版へ更新した後、本番から名前を未入力にした識別用投稿を1件だけ送信しました。Workersのコード・設定変更、再配置、secret再登録、通知の再送は行っていません。

- 受付HTTP 303、完了ページへのLocation、D1の `name = ""`、pending保存、公開一覧に未表示を確認。
- 保存日時：`2026-10-23T12:04:00.637Z`（21:04:00.637 JST）。本文は名前空欄試験であることを示す3行の固定テキスト。
- 当該IDの通知ログ：`sent / gas_send_succeeded`。GASの `ok:true` を確認。
- 運営者が受信メールを提示し、当該ID・保存日時・本文の一致を確認。メール内の `Name:` は空欄です。名前空欄投稿でも同じURL経由の実メール受信まで確認済み。
- 試験投稿は承認せず、照合した当該IDだけを既存CLIで削除済み。削除後の本番0投稿、stagingの既存2投稿は試験前ハッシュと一致。配信Versionは前回のまま、本番公開・stagingのAccess保護も維持。
- 証跡：`.cloudflare/mail-notification/anonymous-attempt.json`、`anonymous-fixture.json`、`anonymous-complete.json`、`production-notification-results.jsonl`。既存の証跡ファイルは上書きしていません。
