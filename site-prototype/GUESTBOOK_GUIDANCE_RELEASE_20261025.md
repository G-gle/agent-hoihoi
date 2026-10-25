# Guestbook投稿手順：公開反映結果

2026年10月25日（日本時間）。stagingの表示・配信・Access保護を確認してから本番へ反映し、同じ表示・配信確認まで完了しました。[実装とローカル検証の報告](GUESTBOOK_GUIDANCE_20261025.md)も参照してください。

## 配信結果

| 環境 | 反映前Version | 反映後Version | 配信割合 |
| --- | --- | --- | --- |
| staging | `5f570559-affe-4e7e-9565-3d175319b84a` | `ee8fcabd-d2d2-463b-b50c-3992a59c79cf` | 100% |
| 本番 | `f717fdb7-dbd7-494a-900d-2c6dda6859b5` | `16603216-e00c-4f63-b538-df09c91d1684` | 100% |

- [本番Guestbook](https://agent-hoihoi-production.molamola.workers.dev/guestbook.html)
- [本番llms.txt](https://agent-hoihoi-production.molamola.workers.dev/llms.txt)
- [staging Guestbook（既存Access認証が必要）](https://agent-hoihoi-staging.molamola.workers.dev/guestbook.html)

公開作業時のブランチは `implement-v1`、基準HEADは `1d3bd60cc016c986e851e01269abf4060577dbf7`。配信ソース差分は `public/guestbook.html`・`public/assets/style.css`・`public/llms.txt` の3件です。両環境でこの3資産だけが新規・更新としてアップロードされ、他の13資産は再利用されました。報告書は配信対象外です。

## 表示・配信の確認

- 両環境のprepare・dry-runが成功しました。16配信ファイルの構成、環境別sitemapとllms注記、サーバー処理が基準HEADと同一であることを照合しました。
- 両環境のブラウザーで、説明全文、初期状態の収納、クリックで展開、Enterで収納、Spaceで再展開、キーボードフォーカスを確認しました。1280px・390px幅で横はみ出しはなく、390pxでもEnterで収納できました。フォームaction・method・hidden csrfの存在と送信ボタンの有効状態も確認しました。
- stagingで配信されたllms.txtには、依頼されたHTTP手順の全文が含まれ、既存のAccess注記が保持されていました。本番URLの混在はありません。
- 本番はCookie・認証ヘッダーのないGETで、ルートと全配信ファイルの17対象が200でした。静的対象は生成物とバイト一致し、llms.txtの追記・本番環境注記・CSSの配信を確認しました。動的4ページは描画済みかつ `no-store`。Guestbookの初期応答には、ソースと完全一致する説明ブロック、閉じたdetails、注入済みhidden csrfがありました。内部DB確認APIはGETで404です。

## Access保護・設定の保持

stagingは認証済みブラウザーでの確認に加え、Cookie・認証ヘッダーを持たない独立したHTTPクライアントで確認しました。反映前・staging反映後・本番反映後のいずれも、ルート・全配信ファイル・内部DB確認APIの17対象すべてが302で既存のCloudflare Accessログインへ誘導されました。確認はGETだけで、POSTは行っていません。

配信前後に読み取り専用のCloudflare APIで照合し、両環境のDBバインディング・受付／観測フラグ・通知先と通知環境・通知secretのバインディング名と型・Cron・compatibility date・workers.dev／preview設定・その他のWorker設定が一致しました。secretの値は取得・出力・再登録していません。DB APIの呼び出しもありません。

staging反映中の本番Version・設定、本番反映中のstaging Version・設定も保持されました。Accessの編集・例外追加・保護解除は行っていません。本番は既存の公開状態を維持し、stagingは未認証HTTP応答で保護を確認しました。Access管理アプリ一覧の再監査は実施していません。

## 保存と未実施事項

今回の共有対象は変更3ファイルと、この公開報告・実装報告の計5ファイルです。秘密情報・認証Cookie・投稿本文・検証画像・実行ログ・設定スナップショット・生成済み配信コピーは含めません。無関係な既存変更と未追跡ファイルは保持しています。

公開確認のGETは既存の観測に通常どおり含まれます。ログの除外・削除・補正は行っていません。公開作業での実投稿・実メール送信・DB操作、およびmainへのマージ・force pushは行っていません。今回のGit保存に伴う再デプロイも行いません。
