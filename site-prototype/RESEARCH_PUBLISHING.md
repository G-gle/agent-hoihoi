# 記事の共通フォーマットと掲載手順

新規記事はMarkdownを正本とし、共通テンプレートからHTMLと発見用の案内を生成する。
既存01・02の記事本文、URL、デザインは保持する。Homeの記事一覧は設けない。

## Museから受け取る原稿

ひな形は `templates/research-note.md`。先頭の `---` で囲まれた情報と、続く本文を渡す。

| 項目 | 内容 |
| --- | --- |
| `number` | 記事番号。01・02は使用済み。草稿も含め重複させない |
| `slug` | URL名。英小文字・数字・ハイフン。公開後は原則固定 |
| `title` | 英語のタイトル。装飾用Markdownは使わない |
| `summary` | Research一覧と機械向け案内に載せる短い英文。1行 |
| `date` | 公開日。`"2026-10-30"` のように記載 |
| `byline` | 任意。著者・編集についての表示。1行 |
| `status` | 提出時は `draft`。掲載原稿の確認後、Codexが `published` に変更 |

`published` は生成対象という意味であり、これを変えるだけで本番には送信されない。
番号・日付・URL名は提出後に運営側で確定してもよい。

本文で使えるもの：段落、見出し、強調、引用、通常・番号付き・入れ子の箇条書き、
表、コード、HTTPSの出典リンク、参照形式のリンク。タイトルはメタデータから生成する。
本文に同じ `# タイトル` がある場合は受け入れ、二重表示を避ける。本文の各節は `##` 以下とする。

見出しからリンク先IDと目次を自動生成する。例えば `## Evidence` は `#evidence`。
同じ見出しが続く場合は `#evidence-2` などになる。H2・H3を目次に含める。
出典の `[1]` などの番号は本文の記述をそのまま保持し、自動採番しない。
英文の意味・順序・引用は生成処理で書き換えない。

サイト内リンクは `research.html` などの相対URLを使う。画像は配置済みのローカル画像だけを参照できる。
埋め込みHTMLは実行せず、文字として表示する。特殊な表示、数式、脚注拡張などが必要なら個別に確認する。

## 初回準備

Python 3.10以上と、既存のNode／pnpm環境を使う。Python仮想環境を有効にしてから：

```sh
cd site-prototype
python -m pip install -r requirements-research.txt
pnpm install --frozen-lockfile
```

変換ライブラリは版を固定する。記事の表示にJavaScriptや実行時のMarkdown処理は不要。

## 毎回の掲載作業（Codex向け）

1. 確認済み原稿を `content/research/<slug>.md` に保存し、番号・日付・URL名を確定する。
2. 内容の掲載承認を確認し、`status: published` にする。
3. 次を実行する。

```sh
python scripts/build_research.py
python scripts/build_research.py --check
python -m unittest discover -s tests -p test_research.py
python scripts/render_research.py --check
```

4. 差分とプレビューを確認する。新記事の本文・表・リンク・目次とResearchからの導線を確認する。
5. 原稿と生成物を同じ変更に保存する。
6. 既存の配置手順でprepare→生成出力比較→dry-run→Access保護下のstaging→productionへ進む。

通常のprepareは `pnpm prepare:cloudflare -- <既存の配置先引数>` を使う。
このコマンドは生成物が最新であることを検査してから、既存の配置用ファイル生成処理を呼ぶ。
`node scripts/prepare_cloudflare.mjs` を直接実行する場合も、先にbuildと`--check`を実行する。
stagingとproductionのsitemapは生成済み記事台帳から作り、各環境のURLを設定する。
生成先の静的ファイル用ディレクトリは作り直し、取り下げた記事の古いHTMLを残さない。
prepare自体はデプロイしない。

## 自動で更新するもの

- `public/<slug>.html`：共通ヘッダー・日付・署名・目次・本文・フッター。
- `public/research.html`：番号順の記事一覧。
- `public/llms.txt`：記事リンクと概要。その他の案内はテンプレートから保持。
- `public/sitemap.xml`：ローカル確認用URL。配置時には環境ごとのURLに置き換える。
- `content/research-index.json`：配置処理と検証が参照する生成済み記事台帳。

これらは直接編集しない。見た目は `templates/article.html` と
`public/assets/research.css`、一覧の外枠は `templates/research.html`、
機械向け案内の固定文は `templates/llms.txt` で管理する。
既存01・02の一覧情報は `content/research-legacy.json` に保持する。

重複番号・重複URL・不正な日付・リンク切れなどは、出力を書き換える前に停止する。
`--check` は書き換えずに生成物の古さを検出する。同じ原稿からは同じ出力を生成する。
草稿に戻した、または削除した新記事は、次のbuildで生成HTMLと一覧から取り除く。
手作業で作ったページは上書き・削除しない。取り下げを本番に反映するには再配置が必要。

## 検証・既存機能の扱い

既存の `scripts/verify.py` は記事台帳に合わせてページ数とリンクを検証する。
同スクリプトには、受容済みF-01の静的Guestbook完了文について古い文言を期待する
既知の失敗が残る。今回そのアサーションとGuestbookは変更していない。
新規記事の生成検査と専用テストは独立して実行できる。

新規記事ごとのアクセス集計の追加は行わない。現在の集計は従来のページと既存2記事が対象。
DB、通知、承認、保持期間、Lite版の設定は変更しない。

この変更には実記事03以降の掲載は含まない。ひな形とテスト原稿を実記事として公開しない。
