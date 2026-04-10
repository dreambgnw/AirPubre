```
    _    _      ____        _
   / \  (_)_ __|  _ \ _   _| |__  _ __ ___
  / _ \ | | '__| |_) | | | | '_ \| '__/ _ \
 / ___ \| | |  |  __/| |_| | |_) | | |  __/
/_/   \_\_|_|  |_|    \__,_|_.__/|_|  \___|

          browser-native Markdown CMS
```

# AirPubre

**軽くて、速くて、あなただけのCMS。**
Lightweight Markdown CMS — write anywhere, deploy everywhere.

ブラウザだけで完結する個人向けMarkdown CMSです。サーバーもデータベースも必要ありません。下書きはIndexedDBに、ビルドはブラウザ内で、デプロイはGitHub / Vercel / ZIP / rsyncから選べます。AI要約もTransformers.jsでローカル実行されます。

A fully browser-based Markdown CMS for solo writers. No server, no database. Drafts live in IndexedDB, builds run in the browser, and you can deploy to GitHub / Vercel / ZIP / rsync. AI summarization runs locally via Transformers.js.

---

## ✨ Features / 機能

| | |
|---|---|
| 📝 **Markdown + リッチテキスト** | `marked` + `DOMPurify` によるプレビュー、TipTapで切り替え可能なWYSIWYG |
| 💾 **ブラウザ完結** | IndexedDB (idb) + Service Worker でオフライン動作・PWAインストール対応 |
| 🚀 **4種類のデプロイ先** | GitHub Pages / Vercel / ZIP ダウンロード / rsync |
| 🧩 **ヘッドレスGitHubモード** | ビルドせず `.md` をそのままGitHubにpush。削除もtree APIで伝搬 |
| 🔄 **デバイス間同期** | GitHubをハブに自動pull + 競合解決モーダル（ローカル維持 / リモート採用） |
| 📥 **過去記事インポート** | md / zip / xml / GitHub URLクローンに対応 |
| 🤖 **AI要約（ローカル）** | Transformers.js でAPIキー不要・ネット不要 |
| 🎨 **4テーマ** | WordPress / Word / Obsidian / Markdown — 管理画面UIにも反映 |
| 🔐 **マスターキー認証** | ひらがな単語リスト + PBKDF2 (200k rounds, SHA-256) |

---

## 🚀 Quick Start

```bash
git clone https://github.com/dreambgnw/AirPubre.git
cd AirPubre
npm install
npm run dev
```

Then open `http://localhost:5173` and follow the setup wizard.
初回アクセスでセットアップウィザードが立ち上がります。

### Build

```bash
npm run build   # → dist/
```

`dist/` をそのまま静的ホスティングに置けば動きます。

---

## 🏗 Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Editor**: TipTap (WYSIWYG) / textarea (raw Markdown)
- **Markdown**: `marked` + `marked-highlight` + `DOMPurify`
- **Storage**: IndexedDB via `idb`
- **PWA**: `vite-plugin-pwa` (Workbox)
- **AI**: `@xenova/transformers` (Transformers.js)
- **Packaging**: `fflate` (ZIP生成)
- **Deploy Adapters**: GitHub REST API / Vercel API / ZIP / rsync (+ Headless GitHub)

---

## 🗂 Project Structure

```
src/
├── components/
│   ├── AdminShell.jsx        # 管理画面のレイアウト
│   ├── Editor/               # エディタ・下書き一覧・デプロイ選択
│   ├── Setup/                # 初回セットアップウィザード
│   ├── Settings/             # 設定画面
│   └── Import/               # 過去記事インポート
├── lib/
│   ├── storage.js            # IndexedDB ラッパー
│   ├── deploy/               # 各デプロイ先のアダプター
│   ├── githubImporter.js     # GitHubからの逆方向インポート
│   ├── headlessFrontmatter.js
│   └── theme.js              # テーマ適用ヘルパー
└── styles/
```

---

## 🧠 How It Works

1. **Setup** — マスターキー（ひらがな4語）を生成、PBKDF2で暗号化保管
2. **Write** — IndexedDBに下書き保存。Markdown / リッチテキスト切り替え可
3. **Build** — ブラウザ内で `marked` → HTML化、テーマCSSを適用
4. **Deploy** — 選んだアダプターで配信。ヘッドレスモードなら`.md`をそのままpush
5. **Sync** — 起動時に自動pull、競合があればモーダルで解決

---

## 🗺 Roadmap

- [x] Setup wizard + マスターキー生成
- [x] Markdown / TipTap エディタ
- [x] 4種デプロイアダプター
- [x] PWA + オフライン対応
- [x] AI要約 (Transformers.js)
- [x] 過去記事インポート (md/zip/xml)
- [x] ヘッドレスGitHubモード
- [x] GitHub URLクローンインポート
- [x] 競合解決UI + 削除の伝搬
- [x] テーマを管理画面UIに反映
- [ ] エンタープライズ対応（共同編集・権限管理）— Issueベースで対応

---

## 📜 License

MIT

## 🙏 Credits

Built by **Anthropic Claude with shunature(dreambgnw)**.

- Author: [Shun Tonegawa (shunature)](https://github.com/dreambgnw)
- Project page: [shunature.com](https://shunature.com)
