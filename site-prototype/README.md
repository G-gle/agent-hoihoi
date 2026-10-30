## 2026年10月30日：Home整理と新規記事の共通生成（配置前）

Homeの個別記事リンクを外し、記事一覧はResearchに集約した。
新規記事はMarkdown原稿から共通テンプレートで生成し、一覧・llms.txt・sitemapを同時更新する。
既存01・02の記事本文・URLは保持する。以下の過去記録にあるHomeの直接リンクは撤去済み。

- [原稿の形式、Museへのひな形、Codexの掲載手順](RESEARCH_PUBLISHING.md)
- 原稿ひな形：`templates/research-note.md`
- 生成：`python scripts/build_research.py`
- 更新漏れ確認：`python scripts/build_research.py --check`

本番反映と実記事03以降の掲載は別工程。

## 2026年10月24日：Research一覧と2本の記事（公開済み）

Researchは `public/research.html` の一覧から、第1弾 `public/agent-traps.html` と第2弾 `public/agents-and-traps.html` へ進む構成です。Homeからも両記事に直接進めます。第1弾の生成先は `agent-traps.html` に変更し、現行フッターを保持しています。一覧の「01」「02」はHomeと共通の番号・グリッド指定を使います。stagingで確認後、本番へ反映済みです。

- [公開URL・配信Version・確認結果・保持した設定](RESEARCH_RELEASE_20261024.md)
- [組み込み時点の変更ファイル・確認結果・プレビュー方法](RESEARCH_INTEGRATION.md)

以下の過去記録にある「research.htmlが第1弾全文」「7ページ」「sitemap 3 URL」は今回の一覧化前の構成です。

## 2026年10月23日：全文版v2の反映（ローカルレビュー）

Home下段、Aboutの本文と指定2文の視覚的非表示、Guestbook、受領成功文、観測概要・詳細を全文版v2に合わせました。Researchと既存Worker／D1処理を維持し、staging・本番へは未デプロイです。

- [v2完了報告・全項目の反映状況・検証ログ・PC／モバイル画面](verification/2026-10-23-copy-v2/README.md)

以下は以前の実装・運用履歴です。現在の文言・表示は上記v2資料を参照してください。

---

## 2026年10月23日：文言・Contact・Open margins（ローカルレビュー）

現行7ページとWorker／D1の処理を維持し、英文、About末尾のContact form、Homeの採用挿絵、フッターhoihoiを更新しました。staging・本番へは未デプロイです。

- [変更ファイル・適用英文・確認結果・未確認事項・PC／モバイル画面](verification/2026-10-23-copy-contact/README.md)

以下は前段階の実装・運用履歴です。現在の文言は上記レビュー資料を参照してください。

---

## Phase 4：実測値表示（非公開staging）

概要の累計、詳細の4ページ累計・UTC日別表、取得状態の区別を追加しました。Accessを維持し、本番・一般公開は未着手です。

- [表示仕様・運用](OBSERVATION_DISPLAY.md)
- [Phase 4検証結果・スクリーンショット](verification/2026-10-21-phase4/README.md)

以下のPhase 0〜3記録は履歴です。実測未表示などの旧記述よりPhase 4文書を優先してください。

# Agent Hoihoi — English site / private staging

## Phase 3：承認制Guestbook

2026年10月21日、英語版7ページの非公開stagingに、HTMLフォーム投稿→D1承認待ち保存→管理コマンド承認→一覧表示・削除を追加しました。サイト全体のCloudflare AccessとPhase 2の観測を維持しています。実測値表示・本番作成・一般公開は行いません。

- [現在の仕様・起動・反映・承認・削除・停止・初期設定](GUESTBOOK.md)
- [Phase 3検証記録と画面](verification/2026-10-21-phase3/README.md)
- [既存の観測運用](OBSERVATION.md)

以下はPhase 2以前の履歴です。「投稿デモ」「静的のみ」等は当時の状態です。現状は上記Phase 3文書を優先してください。従来の静的プレビューではGuestbookの動的機能は動きません。

---

# 過去の実装記録：English static prototype

## Phase 2：非公開stagingの最小観測

4ページのGETをD1へ保存し、UTC日別集計と90日生ログ削除・管理コマンドを追加しました。
現行stagingは <https://agent-hoihoi-staging.molamola.workers.dev/>。Accessを維持し、投稿は保存されないデモ、実測値はページに表示しません。

- [現行の仕様・日本語運用手順・管理コマンド・停止・本番DB分離](OBSERVATION.md)
- [Phase 2の実施結果と未確認事項](verification/2026-10-21-phase2/README.md)

以下はPhase 1以前の履歴です。旧URLや未実装の記述より、上記のPhase 2文書を優先してください。

## Phase 1：Cloudflare Workers / D1

2026-10-21、既存7ページを維持したWorkers Static Assets用の構成とD1接続確認APIを追加しました。
**非公開テスト環境専用です。Accessは解除しません。** DB確認APIは通常無効です。
Phase 1は配置・検証まで完了しました。非公開テストURL：<https://agent-hoihoi-staging.molamola0612.workers.dev/>（Cloudflareアカウント認証が必要）。

- [日本語の起動・配置・マイグレーション・停止手順](CLOUDFLARE.md)
- [Phase 1の実施結果・配置先・未確認項目](verification/2026-10-21-cloudflare/README.md)

Node.js 22以上、pnpm 11.25.0、Wrangler 4.151.3を使用します。`pnpm install --frozen-lockfile` → `pnpm db:migrate:local` → `pnpm dev`でローカル起動します。
従来のPython静的プレビューも利用できます。以下はCloudflare追加前の静的サイトについての説明・検証履歴です。最新の配置状態とDB構成は上記のPhase 1記録を参照してください。

2026-10-21更新。既存のアイボリー・濃いグレー・青のデザインと7ページ構成を維持し、訪問者向けの本文、タイトル、description、フォーム、アクセシビリティ用ラベル、llms.txtを英語化しました。

**ローカル確認用の静的プロトタイプです。** 実際の観測、アクセス・クリック集計、投稿受付、送信、保存は未実装です。公開環境へのデプロイは行っていません。既存のPython版・GitHub Pages用Lite版・公開設定は変更していません。

## Windowsで起動する

PowerShellで次を実行します。追加パッケージは不要です。

```powershell
cd D:\Users\molamola\app\Agent-hoihoi\repository\site-prototype
..\.venv\Scripts\python.exe scripts\serve.py
```

これは今回の作業環境で確認した既存Python実行環境を使うコマンドです。既存アプリは起動しません。独立して利用する場合はPython 3.10以降で `py -3 scripts\serve.py` または `python scripts\serve.py` と実行できます。

ブラウザーで http://127.0.0.1:4173/ を開きます。停止はターミナルでCtrl+C。サーバーは127.0.0.1だけで待ち受け、アクセス履歴を記録しません。投稿処理のない、Python標準ライブラリによる静的プレビューです。

ポートが使用中なら `scripts\serve.py --port 4174` とし、http://127.0.0.1:4174/ を開きます。サイトマップの確認用URLも合わせる場合は、`site.config.json` の `localBaseUrl` を変更し、`scripts\write_sitemap.py --local` を実行します。

`public/index.html` の直接閲覧でもページ間の遷移は動きます。ルートURLでの機械向けファイル確認にはHTTPサーバーを使ってください。

## 7ページと導線

| ページ | ファイル | 主な接続先 |
| --- | --- | --- |
| Home | `public/index.html` | Research、About、フッターのBOTS |
| Research | `public/research.html` | 6章の目次、外部参考資料、第6章末尾のField observations |
| About | `public/about.html` | 運営方針、Research、BOTS |
| Field observations | `public/observations.html` | 未計測の概要、共通Guestbook |
| Guestbook | `public/guestbook.html` | 任意の名前・メッセージの外観デモ、完了デモへのリンク |
| Completion page (demo) | `public/guestbook-complete.html` | 送信・保存なしの明示、詳細ページ |
| Detailed field observations | `public/observations-detail.html` | 未計測の期間・母数・集計条件、概要への戻りリンク |

上部ナビは全ページでHome / Research / Aboutのみです。フッターは控えめな **BOTS ↗ → Guestbook** の1リンクです。以前のDATAリンクは削除しました。

- 経路A：Research第6章の **Supplementary material: Field observations** → 観測概要 → Guestbook → 完了デモ → 詳細。
- 経路B：フッターの **BOTS ↗** → 同じGuestbook → 同じ完了デモ → 詳細。

観測概要への主入口は記事中の小さな補足リンクです。初期HTMLの通常アンカーとして存在し、CSSで隠したりJSで生成したりしていません。キーボードのTabとEnterで利用できます。ユーザーエージェントによるHTML切り替えもありません。

## Research記事の正本と生成

タイトル：**AI Agent Traps: Mechanisms, Taxonomies, and Real-World Observations**

提供された `AIAgentTraps20261021.md` を正本とし、バイト単位で同一のコピーを `content/AIAgentTraps20261021.md` に保持しています。原稿内の日付October 20, 2026も変更していません。

導入、第1〜6章、Sources and scopeを全文掲載しています。段落の意味・順序、見出し階層、強調、コード表記、箇条書き、5つの表、13件の外部参照を保持しています。唯一のリンク先変更は、第6章末尾の `FIELD_OBSERVATIONS_URL` → 相対URL `observations.html` です。大きなボタンやカードにはしていません。

`research.html` は生成済みの静的HTMLなので、閲覧時のMarkdown処理やJavaScriptは不要です。原稿を更新する場合はコピー側を更新してから、以下を実行してください。

```powershell
..\.venv\Scripts\python.exe scripts\render_research.py
..\.venv\Scripts\python.exe scripts\render_research.py --check
```

`render_research.py` はこの原稿で使われているMarkdown構文だけを扱う小さな標準ライブラリ製ツールです。汎用Markdownエンジンや新しい依存関係は追加していません。表には横スクロール可能な領域とフォーカス枠を設けています。原稿の例示文や引用を実行・命令として扱う処理はありません。

`verify.py` はレンダラーとは別のテキスト抽出で原稿と掲載本文を照合し、全文・順序・外部リンクの保持を確認します。元の提供ファイルが作業フォルダーにある場合は、コピーのバイト一致も確認します。

## 構成

```text
site-prototype/
├─ public/                  配置する静的ファイルのみ
│  ├─ index.html / research.html / about.html
│  ├─ observations.html / observations-detail.html
│  ├─ guestbook.html / guestbook-complete.html
│  ├─ assets/style.css / guestbook.js / favicon.svg
│  └─ llms.txt / robots.txt / sitemap.xml
├─ content/AIAgentTraps20261021.md
├─ scripts/
│  ├─ render_research.py     記事だけを静的HTML化
│  ├─ verify.py              英語化・全文・リンク・任意のHTTP検証
│  ├─ serve.py               ローカルプレビュー（変更なし）
│  └─ write_sitemap.py       URL設定からサイトマップ生成（変更なし）
├─ site.config.json         公開URLは未設定（変更なし）
├─ verification/2026-10-21/  今回の検証結果と画像
└─ README.md
```

`public/` だけで配信できます。content、scripts、検証資料、既存アプリのデータを公開対象に含める必要はありません。新しいページ、バックエンド、DB、ホスティング依存の基盤は追加していません。

## 機械向けファイル

- **llms.txt**：全文英語化。Home、Research、About、Field observations（概要）、Guestbookを通常の相対リンクで説明。記事第6章とBOTSからの経路、未稼働状態も記載。操作の強要はありません。
- **robots.txt**：確認のうえ変更なし。`User-agent: *` / `Allow: /` の許可方針を維持。
- **sitemap.xml**：確認のうえ変更なし。Home / Research / AboutのローカルURL3件のみ。観測・Guestbook・完了ページは追加していません。

本番URLは仮定していません。`site.config.json` の `publicBaseUrl` はnullです。正式なHTTPS URLが確定してから設定し、`scripts\write_sitemap.py --public` を実行します。未設定時はエラー終了し、サイトマップを書き換えません。ローカル版へ戻す場合は `--local` を使います。

サイトマップに載せないことは秘匿や検索除外を意味しません。noindexの方針は引き続き未決定です。詳細・完了URLも直接開ける静的ページです。llms.txtもAIによる発見を保証しません。

## 検証

```powershell
..\.venv\Scripts\python.exe scripts\verify.py
..\.venv\Scripts\python.exe scripts\render_research.py --check
# 別ターミナルでプレビューを起動した状態で
..\.venv\Scripts\python.exe scripts\verify.py --url http://127.0.0.1:4173/
```

今回の結果：

- 7ページの英語lang、表示・メタデータ・ラベルの英語化、内部77参照の整合性を確認。
- 記事本文と原稿の全文・順序が一致。第1〜6章、Sources and scope、5表、13外部参照を保持。
- 全13静的ファイルのHTTP 200と内容一致を確認。
- 2経路の実操作、無効な送信ボタン、Enter送信防止、完了画面の説明、詳細までの移動を確認。
- 全7ページを幅320 / 390 / 768 / 1280pxで表示し、ページ全体の横はみ出しなし。5表は領域内で横スクロール。矢印キーでもスクロールできることを確認。
- 既存Python版テストも実行し、93件成功。既存FastAPI/Starlette依存の非推奨警告1件あり。依存関係は今回変更していません。
- Lite版など対象外の既存27ファイルは作業前後のSHA-256が一致。

[今回の確認記録とスクリーンショット](verification/2026-10-21/README.md) を参照してください。`verification/` 直下の古い日本語画面は2026-10-20の履歴で、現在の表示ではありません。

外部参照のURL・リンク文言は原稿どおり保持しましたが、参照先サイトの現時点での可用性や原稿の研究内容を再検証する作業は今回実施していません。実機スマートフォン、複数ブラウザー、スクリーンリーダー製品での検証も未実施です。

## 静的デモの制約と今後の作業

Guestbookの送信ボタンは無効です。入力欄には送信用name属性を付けず、JSでもsubmitを防止します。デモリンクは入力なしで利用でき、入力内容を次ページに引き継ぎません。Cookie、localStorage、sessionStorage、送信APIは使いません。問いかけは `guestbook.html` の `guestbook-question` の本文で変更できます。

以下は未実装です：アクセスログ取得・集計、クリック計測、AI判定、実際の投稿API、データ保存、DB、審査、スパム対策、管理画面、詳細ページのアクセス制御、Cloudflare Workers / D1等のバックエンド。

公開や実機能の追加は今回の範囲外です。次段階では正式URLと配置パス、noindex、測定期間・指標・母数・除外条件、保存・公開・停止方針、ホスト側のログ保持を決める必要があります。公開用サイトマップへの切り替えも、その時点で行います。
