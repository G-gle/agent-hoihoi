# Research一覧・2記事・Home導線・番号表示の公開結果

2026年10月24日（日本時間）。既存のprepare → 対象照合 → dry-run → staging反映・確認 → 本番反映・確認の順で完了しました。既存のDB・投稿・通知・Access設定を維持しています。本書は公開時点の完了記録です。後続のGit保存は別作業で、再デプロイを伴いません。

## 公開URL

- [Home](https://agent-hoihoi-production.molamola.workers.dev/)
- [Research一覧](https://agent-hoihoi-production.molamola.workers.dev/research.html)
- [第1弾：AI Agent Traps](https://agent-hoihoi-production.molamola.workers.dev/agent-traps.html)
- [第2弾：Which AI Agents Encounter Which Traps?](https://agent-hoihoi-production.molamola.workers.dev/agents-and-traps.html)
- [stagingのResearch一覧（既存のAccess認証が必要）](https://agent-hoihoi-staging.molamola.workers.dev/research.html)

## 配信Version

| 環境 | 反映前 | 反映後 | 配信割合 |
| --- | --- | --- | --- |
| staging | `044c38ad-152e-48f6-931a-7cbe635823ee` | `f547cd13-8873-4fc0-947c-3469d152cd3c` | 100% |
| 本番 | `c07e9cc3-5086-4836-83e7-032aea807754` | `eecf89df-22c5-49c7-8f19-503136ab5d2d` | 100% |

最終のリモート照合は2026年10月24日22:00 JSTごろです。配置元は `implement-v1` / `a3fb4c97edc1bc5911119f39abf323c5936c4762` に、今回までのローカル差分を加えた状態です。サーバー処理の `src/` は同HEADと同一で、今回のサーバーコード変更はありません。

## 確認結果

- 公開前の環境分離・Worker・観測の関連テスト19件が成功しました。両環境の生成済み設定でdry-runも成功しました。
- 配信対象はHTML 9件、資産4件、機械向けファイル3件の計16ファイルです。本番はルートを加えた17対象でHTTP 200を確認しました。静的対象は生成した本番ファイルとバイト一致し、観測概要・観測詳細・Guestbook・完了ページは動的表示と `no-store` を確認しました。内部DB確認APIはGETで404です。
- stagingでは既存のCloudflare認証を使用して一覧・Home・両記事・CSSを確認しました。一覧とHomeの各記事リンク、第2弾から第1弾第3章へのリンク、戻る導線を実操作で確認し、第1弾5表・第2弾8表の表示を確認しました。第2弾の招待文は初期状態で閉じ、クリック・Enter・Spaceで開閉し、キーボードフォーカスを表示します。
- 本番でも一覧→両記事、記事→一覧、Home→両記事、第2弾→第1弾第3章、観測概要→Guestbookの導線を実際にたどりました。目次の参照先に欠落はありません。両記事と一覧のResearchカテゴリ表示、Field observations・Guestbookリンクを確認しました。
- 本番のResearch一覧に「01」「02」が表示され、タイトル内に番号の重複はありません。共通の番号・グリッド指定でHomeと同じ配置を使っています。
- 本番画面を1280px・390px幅で確認し、一覧と第2弾にページ全体の横はみ出しがありません。第2弾は初期状態で閉じ、クリックで展開し、Enterで収納・Spaceで再展開します。フォーカス表示も確認しました。390px幅でも開閉でき、共通CSSと第2弾専用CSSが読み込まれています。
- sitemapはHome・一覧・両記事・Aboutの5 URL、llmsは既存の掲載方針を保持した7導線を案内します。robotsの方針は変更していません。
- 本番反映後にも、stagingのルート・全ファイルの17対象を認証情報なしのGETで確認し、すべて既存Accessへ転送されました。本番は認証情報なしで公開されています。Accessの設定変更・例外の作成・保護解除は行っていません。管理対象のAccessアプリ一覧は今回のAPIでは得られなかったため、保護の保持は既存認証での閲覧と未認証クライアントの実応答で確認しています。

## 保持したもの・実行しなかったこと

反映前後で、両環境のDB UUID・スキーマのハッシュ・既存投稿の件数と内容ハッシュ・受付gateのハッシュが一致しました。通知URL・通知環境・secretのバインディング名と型、受付・観測フラグ、Cronの設定、preview無効設定も一致しています。secretの値は取得・出力・再登録していません。

DB作成・migration・投稿・承認・削除・メール試験・GAS変更・Access変更は行っていません。メール通知の実送信・受信の再試験は行わず、既存コードと設定の保持を確認しました。無関係な未コミット変更は保持しています。

確認のGETは通常の観測対象に含まれます。観測ログや過去の集計を移動・削除していません。Researchの観測区分は引き続き `/research.html` のURL単位で、今後は一覧へのアクセスを数えます。新しい記事別計測は追加していません。

旧 `research.html#chapter-*` は一覧のURLになるため旧記事の章へ直接到達しません。新しい参照先は `agent-traps.html#chapter-*` です。互換転送は追加していません。既存の受容済みF-01には手を加えていません。

## ローカル証跡

`.cloudflare/research-release-20261024/` に反映前・staging後・最終の設定／投稿ハッシュ、配置元SHA-256、未認証stagingチェック、本番HTTPチェック、ブラウザー確認結果、確認画像を保存しました。これらは配信対象・コミット対象に含めていません。秘密値・認証Cookie・投稿本文は保存していません。

本番Research一覧と招待文の展開状態のPC・390px幅の画面例は、上記ローカル証跡フォルダーに保管しています。画像・ログはこの報告書に同梱しません。
