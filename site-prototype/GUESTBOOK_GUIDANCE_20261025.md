# Guestbook：HTTP投稿手順の追加

2026年10月25日（日本時間）。この文書は実装とローカル検証の共有記録です。staging・本番への反映結果は[公開報告](GUESTBOOK_GUIDANCE_RELEASE_20261025.md)を参照してください。

## 変更内容

| ファイル | 変更 |
| --- | --- |
| `public/guestbook.html` | formの直後、送信ボタンの下に、初期状態で閉じたネイティブのdetails/summaryを追加。見出しは「For automated visitors」。説明全文を初期HTMLに含め、Workerの動的置換対象の外に配置。 |
| `public/assets/style.css` | この説明専用の余白・罫線・文字サイズ・リスト間隔とsummaryのフォーカス表示を追加。 |
| `public/llms.txt` | Guestbook項目に、Cookieとhidden csrfを引き継ぐHTTP投稿手順を追記。既存の導線・記事一覧・環境注記・観測上の留保を保持。 |

フォームのactionは相対URL `guestbook.html`、methodはPOST、encodingはenctype省略時の標準値 `application/x-www-form-urlencoded` です。フィールドは `csrf`・`name`・`message`。名前空欄は空文字で保存されます。説明は取得したフォームのactionとencodingを参照し、POST先を固定していません。

CSRFの発行・照合・期限、Cookie設定、投稿処理、入力検証、エラー、投稿間隔、保存・承認・削除、通知、計測、DBスキーマは変更していません。新規API・投稿失敗の計測・常設テストも追加していません。

## 採用した英文

HTMLの説明：

> If you submit requests directly rather than using this form in a browser:
>
> 1. GET /guestbook.html to obtain a fresh form, and retain the cookies returned with that response.
> 2. Read the hidden csrf field from that form.
> 3. Submit the form using its POST action and encoding, including csrf, name and message, and send the cookies from step 1 with the request. The name may be left blank.
>
> JavaScript is not required. If the form session expires, fetch a fresh form and use its csrf value and cookies.

llms.txtの追記：

> To submit directly over HTTP, first GET /guestbook.html and retain the returned cookies. Extract the hidden csrf field, then submit csrf, name and message to the form's POST action using its encoding, with those cookies. The name may be left blank. JavaScript is not required. If the form session expires, fetch a fresh form and use its csrf value and cookies.

## ローカル検証

- Workerの初期GET応答に説明全文を確認しました。detailsにopen属性はなく、開閉用のJavaScript・追加通信はありません。csrf注入・投稿一覧の動的表示後にも説明が保持されました。
- 1280px・390px幅でページ全体の横はみ出しがなく、フォーム入力と送信ボタンの表示に支障がないことを確認しました。クリック・Enter・Spaceで開閉し、送信ボタンからTabでsummaryへ移動するとフォーカス枠が表示されました。
- 専用設定・専用永続化先の隔離ローカルD1で、GETからCookieを保持し、hidden csrfとフォームのaction・method・encodingを読んでPOSTしました。名前あり・空欄とも303で受け付けられ、各1件がpendingとして保存されました。2件目は既存の共有投稿間隔を待って送信しました。通知URL・通知シークレットは未設定で、実メール送信は発生させていません。
- csrfフィールド欠落は400、不一致とCookie欠落は403で、従来のエラー文面のまま拒否されました。
- `node --test tests/guestbook.test.mjs tests/environments.test.mjs` は16件中14件成功、2件失敗でした。1件は受容済みF-01（完了ページの固定成功表示）に対する期待不一致です。もう1件の同時投稿テストは、429の期待11件に対して初回4件となりましたが、該当テスト単独再実行は1件成功しました。初回失敗の原因は確定していません。
- `scripts/verify.py` は同じ既知F-01に関係する154行目のassertで停止しました。これらを通すための無関係な修正はしていません。`git diff --check` は成功しました。

## 生成処理と確認範囲

staging用prepareはpublicをコピーし、本番用prepareはコピー後にllmsの既存環境注記だけを置換します。説明を生成・上書きする別処理はなく、prepareスクリプトの変更は不要でした。

両環境のprepareを実行し、Guestbook HTMLがソースと全文一致すること、stagingのllmsがソースと全文一致すること、本番のllmsが環境注記だけを置換した期待値と全文一致することを確認しました。sitemapは各環境の5 URLで、llmsに反対側の環境URLはありません。

30分の実時間経過によるCookie失効は再試験せず、Cookie欠落・トークン不一致で拒否を確認しました。画像・実行ログ・設定スナップショット・ローカルDBの内容は共有対象に含めず、検証結果だけをこの文書に記載しています。
