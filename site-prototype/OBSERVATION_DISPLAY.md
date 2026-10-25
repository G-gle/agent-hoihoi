# Phase 4：実測データ表示・導線完成

2026年10月21日。対象はAccess保護中の非公開stagingのみ。

## 表示と取得

- 概要はその概要ページへのGET累計1つと取得時点だけを主表示する。Researchのリンククリック数やAI到達数ではない。
- 詳細は6区分の全保持期間の累計、最古/最新集計日、UTC取得時点、直近30 UTC暦日の表と限界を表示する（記事2区分の追加記録は [ARTICLE_ACCESS_MEASUREMENT.md](ARTICLE_ACCESS_MEASUREMENT.md)）。
- 最古の**日別集計日**を「First confirmed record date」と表示する。稼働開始時刻や連続観測の保証とはしない。生ログから開始や累計を計算しない。
- 1本のSELECTで全累計・期間・日別表を同じSQLiteスナップショットから取得する。primary D1 session、Cache-Control: no-store、条件付きassetヘッダーを持ち込まないHTML応答。JS不要。個別ログ・UA・流入元・未承認投稿はSELECT/表示しない。
- 日別表のない日は埋めず、記録がある日の未記録ページは従来4区分だけ0とする。この0は無停止の証拠ではない。新規記事の行がなければ日別は「—」、累計は「No retained records」とし、開始前と測定済み0を混同しない。最初の記録日から稼働開始日を推定しない。累計は30日表示範囲で制限しない。

## 状態

有効＋日別記録あり＝数値（対象ページだけ未記録なら0）。有効でも集計が空＝Not measured（開始済みの0件を証明できないため）。フラグ無効＝Not measured＋一時停止説明、保持値は隠す。DB未接続/SQL失敗＝Temporarily unavailable。0に置換しない。全状態で共通ナビ/Guestbookリンクを維持する。新たな状態テーブルやmigrationは追加しない。

## 維持した集計条件

Home（/ と /index.html）、Research、概要、Guestbook、第1弾、第2弾。GETのみ、既存の全HTTP応答ステータス（DB制約100〜599、リダイレクト/エラー含む）を1回記録する。HEAD/POST/詳細/完了/About/資産/APIは除外。UTCの0時で日付を分ける。受信時刻を既存Workerで採取し、応答生成後にwaitUntilで日別加算＋生ログINSERTを原子的に行う。概要の今回アクセス自身は表示スナップショットに含まず、後の取得に反映される。二重記録や表示側の手動加算はしない。生ログ90日、集計長期保存、停止/再開/Cronを維持。

## 配信・生成元とURL案内

`public/observations*.html`は手書きテンプレート正本。Workerの`src/observation_view.js`がマーカー内を置換する。Researchのみ`content/`から`render_research.py`で生成し、本文は変更しない。`.cloudflare/public`は`prepare_cloudflare.mjs`で毎回正本からコピーする。詳細をWorker優先パスに加えたが、記録対象のPAGE_PATHSには加えていない。

通常ナビHome/Research/About、フッターBOTS→共通Guestbookを維持。Research第6章補足→概要→共通Guestbook→通常HTML投稿成功→既存受付→詳細。詳細へのアンカーは受付だけ、詳細と受付はmeta noindex（詳細はHTTPヘッダーでもnoindex）。直接詳細閲覧可能。新しい認証/URLトークン/Cookie解放はない。既存Guestbookの短期受付照合だけ継続。sitemapは通常3ページ、llmsは通常3ページ＋概要＋Guestbook。robotsはAllow: /、詳細/受付のDisallow列挙なし。noindexはアクセス制御や秘密保持ではない。

## 環境・実行

DBスキーマ変更なし。設定は詳細をWorker優先へ追加しただけ。固定staging Worker `agent-hoihoi-staging`、D1 `agent-hoihoi-staging-db`（cbc9ae36-05b9-4862-a3ad-1ac973e1001e）。production枠のDBなし/機能false/preview無効を維持し、本番操作はしない。

ローカル：`node --test tests/*.test.mjs`、`..\.venv\Scripts\python.exe scripts/verify.py`、`..\.venv\Scripts\python.exe scripts/render_research.py --check`。既存Pythonテストはリポジトリ直下の`.venv`で実行。起動/デプロイ/停止は[OBSERVATION.md](OBSERVATION.md)と[GUESTBOOK.md](GUESTBOOK.md)の既存手順。staging反映の前後に`verify_access.mjs`を実行する。`verify_phase4.mjs <ラベル>`は固定stagingの集計・投稿状態・生ログ件数だけを取得し、個別ログや本文を保存しない。

検証・デプロイ版・画面・残存データは[Phase 4検証記録](verification/2026-10-21-phase4/README.md)を参照。定刻Cron初回は未確認、次回2026年10月22日12:17 JST。Phase 5・一般公開には進まない。
