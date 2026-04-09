# AirPubre

> ブラウザ完結の軽量 Markdown CMS｜PWA 対応・API キー不要・外部サービス非依存
> Apple 的ミニマルデザイン（白 × sky-500）

[![License: MIT](https://img.shields.io/badge/License-MIT-sky.svg)](LICENSE)

---

## プロジェクト概要

- Markdown ファースト。ブラウザ上でビルドして静的サイトを生成する CMS
- デプロイ先：**GitHub Pages / Vercel / rsync / ZIP / Headless GitHub**（外部ビルダー連携）
- PWA（Service Worker + IndexedDB）でオフライン動作
- 認証はマスターキー（ひらがな12単語）＋ サブキー派生（PBKDF2・SHA-256・20万イテレーション）
- API キー不要・サードパーティサービス非依存
- バックエンドサーバー一切なし（CMS 本体は完全に静的ホスティング可）

---

## 技術スタック

| 分類 | 採用技術 |
|------|----------|
| UI | React 18 + Vite + Tailwind CSS |
| エディター | TipTap（リッチテキスト）/ marked.js（Markdown）/ DOMPurify |
| Markdown変換 | marked.js + marked-highlight + highlight.js / turndown（HTML→MD） |
| ストレージ | IndexedDB（idb ライブラリ） |
| 暗号 | Web Crypto API（PBKDF2 / HKDF / AES-GCM） |
| デバイス同期 | WebAuthn（Passkey）+ AES-GCM 256bit 暗号化 |
| AI 要約 | @xenova/transformers（Web Worker、ローカル完結） |
| ZIP | fflate |
| アイコン | lucide-react |
| PWA | vite-plugin-pwa（Workbox） |

---

## ディレクトリ構成

```
airpubre/
├── src/
│   ├── App.jsx                        # フェーズ管理（loading → setup → login → app）
│   ├── main.jsx
│   ├── styles/index.css
│   ├── words/hiragana.js              # ひらがな単語リスト（マスターキー生成用）
│   │
│   ├── components/
│   │   ├── AdminShell.jsx             # 管理画面（ハッシュルーティング・レスポンシブ）
│   │   ├── Dashboard.jsx              # ダッシュボード（統計・最近記事・クイックアクション）
│   │   ├── Login.jsx                  # サブキー／マスターキー認証 UI
│   │   │
│   │   ├── Editor/
│   │   │   ├── Editor.jsx             # メインエディター（3モード・OGP・AI・TOC・テーマ別機能）
│   │   │   ├── RichTextEditor.jsx     # TipTap WYSIWYG エディター（Word 風ツールバー）
│   │   │   └── DraftList.jsx          # 記事一覧（変更検知デプロイモーダル付き）
│   │   │
│   │   ├── Import/
│   │   │   └── ImportModal.jsx        # インポート（MD / ZIP / WordPress WXR）
│   │   │
│   │   ├── Settings/
│   │   │   ├── Settings.jsx           # 設定画面（全セクション）
│   │   │   └── SyncSection.jsx        # デバイス間同期セクション
│   │   │
│   │   └── Setup/
│   │       ├── SetupWizard.jsx        # セットアップウィザード（7ステップ）
│   │       ├── StepMode.jsx           # モード選択（かんたん / 玄人）
│   │       ├── StepMasterKey.jsx      # マスターキー生成
│   │       ├── StepSubKey.jsx         # サブキー設定
│   │       ├── StepBackup.jsx         # バックアップ確認
│   │       ├── StepDeploy.jsx         # デプロイ先選択（Vercel × GitHub 構成含む）
│   │       ├── StepBackground.jsx     # サイトテーマ選択（4種）
│   │       └── StepDone.jsx           # 完了（siteConfig 書き込み・defaultEditor 自動決定）
│   │
│   └── lib/
│       ├── storage.js                 # IndexedDB CRUD（下書き / 設定 / metaテンプレート / 同期）
│       ├── crypto.js                  # PBKDF2 鍵生成・ハッシュ検証
│       ├── builder.js                 # 静的 HTML 生成（4テーマ CSS・記事/インデックス/著者ページ）
│       ├── ogp.js                     # OGP / TwitterCard / JSON-LD / カスタム meta 生成
│       ├── toc.js                     # 目次自動生成（見出し抽出・アンカー ID 付与）
│       ├── imageUtils.js              # Canvas WebP 変換・リサイズ
│       ├── importer.js                # インポーター（MD / ZIP / WordPress XML）
│       ├── sync.js                    # デバイス間同期（WebAuthn + AES-GCM 暗号化）
│       ├── summarize.worker.js        # Transformers.js Web Worker（AI 要約）
│       ├── useSummarizer.js           # AI 要約 React フック
│       └── deploy/
│           ├── github.js              # GitHub Pages デプロイ（Git Tree API）
│           ├── vercel.js              # Vercel デプロイ（Direct API）
│           └── zip.js                 # ZIP ダウンロード（fflate）
│
├── package.json
├── vite.config.js                     # Vite + PWA + Workbox 設定
├── tailwind.config.js
├── postcss.config.js
├── Dockerfile
└── docker-compose.yml
```

---

## 実装済み機能

### 認証
- ひらがな12単語マスターキー・128文字サブキー派生（PBKDF2 SHA-256 20万イテレーション）
- sessionStorage で認証状態保持（タブ閉じで自動ログアウト、リロードでセッション維持）
- マスターキー入力: 「ランダム2単語チャレンジ」または「全12単語入力」モード
- `authLevel: 'normal' | 'master'` の2段階認証レベル

### セットアップウィザード（7ステップ）
1. **モード選択** — かんたんモード / 玄人モード
2. **マスターキー生成** — ひらがな12単語
3. **サブキー設定** — 128文字ランダム（コピー促進）
4. **バックアップ確認** — チェックボックス
5. **デプロイ先選択** — GitHub Pages / Vercel / ZIP / rsync。Vercel + 玄人モードでは GitHub 経由構成を選択可能
6. **テーマ選択** — Obsidian / WordPress / Word / Markdown の4種
7. **完了** — 選択内容を siteConfig に書き込み。`defaultEditor` を background + mode から自動決定

### ダッシュボード
- 全記事数 / 掲載済み / 下書き / 最終デプロイ日時の統計カード
- 最近の記事5件（サムネイル付き）
- クイックアクション（新規作成 / インポート / 設定）

### ハッシュルーティング
- `#dashboard` / `#drafts` / `#settings` / `#editor` の URL ハッシュで画面遷移
- ブラウザの戻るジェスチャー（popstate）対応
- `editor` はリロード時に `#dashboard` へフォールバック（下書き状態が必要なため）

### エディター（Editor.jsx + RichTextEditor.jsx）
- **3モード切り替え**: リッチテキスト（TipTap）/ Markdown（textarea）/ HTML（raw edit）
- モード切替時にコンテンツを自動変換（MD ↔ HTML ↔ TipTap）
- 自動保存（3秒デバウンス）・`status: 'draft' | 'published'`
- **公開フロー**: 「下書き完了」ボタン → 概要文未入力時に AI 要約促進ダイアログ
- publishedAt は初回のみセット（2回目以降は updatedAt のみ更新）
- `defaultEditor` を siteConfig から読み込んで初期モードを決定

#### TipTap リッチテキストエディター
- Word 風ツールバー: Undo/Redo / H1〜H3 / Bold/Italic/Underline/Strike/Code / 揃え4種 / List/OrderedList/Blockquote/CodeBlock / Link / 画像 / 区切り線
- 画像挿入: ファイル選択 → WebP 変換 → base64 埋め込み
- Placeholder / Typography 拡張

#### テーマ別エディター機能
| テーマ | 追加機能 |
|--------|----------|
| **Obsidian** | `==highlight==` 挿入 / コールアウト dropdown（note/tip/warning/danger）/ `[[wikilink]]` ピッカー（既存記事一覧から選択）/ 文字数カウンター |
| **WordPress** | OGP タブにカテゴリ入力 / 予約投稿日時（datetime-local）/ SEO フォーカスキーワード（タイトル・本文出現回数リアルタイム表示） |
| **Word** | ワードカウントバー（語数・文字数）/ アウトラインサイドバー（見出し一覧・クリックでカーソル移動） |

### サムネイル / OGP 画像
- ファイルアップロード → WebP 変換 → base64 保存
- Canvas グラデーション生成（5プリセット・タイトル自動描画・ブログ名表示 ON/OFF）
- SNS シェアプレビューカード

### AI 要約（Transformers.js）
- Web Worker で UI 非ブロック
- 英語: distilbart AI モデル / 日本語: 抽出型要約にフォールバック
- 初回のみモデル DL（以降は Workbox PWA キャッシュ・HuggingFace CDN・90日）

### OGP / SEO
- `og:*` / `twitter:*` / `article:*` / JSON-LD（Article スキーマ）
- カスタム meta タグ（記事ごとに自由追加）
- meta タグテンプレート管理（組み込み4種 + カスタム）

### 静的サイト生成（builder.js）
- **4テーマ CSS**（CSS カスタムプロパティで切り替え）:
  - `wordpress`: sky blue・白サーフェス・Noto Sans JP + Georgia
  - `obsidian`: ダークパープル（#0f0f13）・Inter + Noto Sans
  - `word`: ドキュメントブルー（#1d4ed8）・#f8f9fa bg・Times New Roman + Noto Serif
  - `markdown`: ダークグリーン（#0d1117）・JetBrains Mono
- 記事ページ: OGP / 目次 / 公開日・更新日 / 著者カード
- インデックスページ: 記事カード一覧
- 著者ページ: アバター・bio・SNS リンク（authorName 設定時のみ生成）

### デプロイ
| 対象 | 実装内容 |
|------|----------|
| **GitHub Pages** | Git Tree / Blob / Commit / Ref API 経由でプッシュ |
| **Vercel** | Deploy API（Direct）でファイルアップロード |
| **Vercel × GitHub** | `vercelFromGitHub: true` のとき `main` ブランチへ GitHub プッシュ → Vercel が自動デプロイ |
| **ZIP** | fflate で全ファイル zip 化してダウンロード |
| **rsync** | 設定入力のみ（サーバーサイド不要のため実行は手動） |

- DraftList の変更検知: `lastDeployedAt` と `updatedAt` を比較し未デプロイ記事をハイライト
- デプロイ時に `_sync/` ファイルを自動同梱（syncPassphrase 設定時）

### デバイス間同期（sync.js + SyncSection.jsx）
- **WebAuthn パスキー登録**: `navigator.credentials.create`（ES256 + RS256）
- **認証**: ECDSA 署名検証（authData + SHA-256(clientDataJSON)）、RP ID 不一致は graceful fallback
- **暗号化**: PBKDF2 → AES-GCM-256（ランダム 16B salt + 12B IV）
- `_sync/pubkey.json` + `_sync/data.enc.json` を生成サイトに同梱
- 別デバイスから URL + パスフレーズでインポート（updatedAt が新しい記事を優先マージ）

### インポート
- `.md` / `.mdx`（frontmatter 自動パース）
- `.zip`（画像込み一括インポート）
- `.xml`（WordPress WXR エクスポート）
- ドラッグ&ドロップ・複数ファイル同時対応・per-file ステータス表示

### 設定画面（Settings.jsx）
- サイト情報（タイトル・説明・URL・言語・**サイトテーマ選択**）
- 著者情報（名前・bio・アバター URL・SNS リンク各種）
- SEO / OGP（デフォルト OGP 画像・Twitter Handle・GA ID）
- エディター（デフォルトエディター選択）
- デプロイ設定（GitHub / Vercel / Vercel × GitHub / rsync 各設定）
- meta タグテンプレート管理
- **デバイス間同期**（パスキー登録・パスフレーズ・URL からインポート）

### IndexedDB スキーマ（v2）
| ストア | 用途 |
|--------|------|
| `setup` | セットアップ状態・鍵ハッシュ・パスキー情報 |
| `drafts` | 記事データ（id / title / body / tags / slug / summary / thumbnail / customMeta / status / publishedAt / updatedAt / createdAt / categories / scheduledAt / seoKeyword） |
| `settings` | siteConfig（サイト設定まとめて）・汎用 KV |
| `metaTemplates` | meta タグテンプレート |

---

## 起動・ビルド

```bash
cd ~/airpubre
npm install
npm run dev      # localhost:5173 で起動
npm run build    # dist/admin/ に出力
```

---

## 設計上の注意点

- `argon2-browser` は WASM エラーのため削除済み。**絶対に使わないこと**
- sessionStorage 使用（意図的。localStorage だとタブを閉じても残る）
- Worker: `new Worker(new URL('./summarize.worker.js', import.meta.url), { type: 'module' })`
- DOMPurify で `ADD_ATTR: ['id']` を明示許可（見出しアンカー用）
- 絵文字は使わず Lucide アイコンを使用
- カラーテーマ: 白 × sky-500（Tailwind）

---

## デプロイモード

### `github` — GitHub Pages
ブランチ全体を静的サイトで上書き（force push）。`gh-pages` ブランチに dist/ を流し込む単方向デプロイ。

### `vercel` — Vercel
Vercel API 直送、または GitHub 経由（push → Vercel が自動ビルド）の 2 方式。

### `headless-github` — 外部ビルダー連携
**静的 HTML を生成せず、記事の `.md` とサムネイル画像だけを GitHub に push する。**
リポジトリ側で別途ビルダー（cron / Webhook で動く `deploy-server.sh` など）が
`posts.json` / `sitemap.xml` / OGP HTML / rsync 転送を行う想定。

主な特徴：
- 出力は `blog/posts/{slug}.md`（shunature 形式 frontmatter）と `blog/thumbnails/{slug}.{webp}` のみ
- **fast-forward push** + 422 リトライで、外部ビルダーの auto-commit と競合しない
- **逆方向インポート** にも対応（GitHub Contents API → IndexedDB へマージ）
- `scheduledAt` を frontmatter の `date` にそのまま書く（サーバー側で未来日を弾く前提）
- サムネイルの WebP 変換はブラウザ側で完結

### `rsync` — レンタルサーバー
SSH/rsync 設定の表示のみ（実行は手動）。

### `zip` — ZIP ダウンロード
ローカルダウンロードのみ。サーバーへの手動アップロード用。

---

## 残タスク（低優先）

- [ ] Obsidian `==highlight==` の builder.js 出力対応（`<mark>` タグへの変換）
- [ ] Obsidian `[[wikilink]]` の builder.js 出力対応（相対リンクへの変換）
- [ ] 生成サイトのテーマプレビュー（管理画面内）
- [ ] 著者ページ Markdown カスタマイズ（フリー記述エリア追加）
- [ ] チャンクサイズ最適化（TipTap + @xenova/transformers が重い、dynamic import 分割）
- [x] ヘッドレス CMS モード（`headless-github` として実装済み）
- [x] WordPress `scheduledAt` のビルド時判定（headless モードでは frontmatter date に丸投げ → サーバー側で未来日を非公開にする）

---

## ライセンス

MIT — 詳細は [LICENSE](LICENSE) を参照。
