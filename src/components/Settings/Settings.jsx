/**
 * Settings.jsx — AirPubre 設定画面
 * セクション: サイト情報 / 著者情報 / SEO・OGP / エディター / デプロイ
 */
import { useState, useEffect } from 'react'
import {
  Globe, User, Search, PenLine, Server,
  Github, Save, CheckCircle, ChevronDown, ChevronRight,
  Eye, EyeOff, Tag, Plus, X, Trash2, Copy, RefreshCw,
  FileText, Loader2, Pencil,
} from 'lucide-react'
import {
  getSiteConfig, saveSiteConfig, DEFAULT_SITE_CONFIG,
  getMetaTemplates, saveMetaTemplate, deleteMetaTemplate, BUILTIN_META_TEMPLATES,
} from '../../lib/storage.js'
import { importFromGitHub } from '../../lib/githubImporter.js'
import { fetchRepoFile, pushRepoFile } from '../../lib/githubFile.js'
import { applyAdminTheme } from '../../lib/theme.js'
import SyncSection from './SyncSection.jsx'

// ── 入力フィールド部品 ────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-600">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', mono = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 ${mono ? 'font-mono' : ''}`}
    />
  )
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
    />
  )
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/** パスワード入力（表示/非表示トグル付き） */
function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-10 rounded-lg border border-sky-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

/** 折りたたみ可能なセクション */
function Section({ icon: Icon, title, color = 'sky', defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const colorMap = {
    sky:    'text-sky-600 bg-sky-50 border-sky-200',
    violet: 'text-violet-600 bg-violet-50 border-violet-200',
    emerald:'text-emerald-600 bg-emerald-50 border-emerald-200',
    amber:  'text-amber-600 bg-amber-50 border-amber-200',
    rose:   'text-rose-600 bg-rose-50 border-rose-200',
  }
  return (
    <div className={`border rounded-2xl overflow-hidden ${colorMap[color]}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-bold">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 bg-white border-t border-inherit">
          {children}
        </div>
      )}
    </div>
  )
}

// ── meta タグテンプレート管理 ─────────────────────────────────────

function MetaTemplateManager() {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)  // null | 'new' | template object
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState([{ name: '', content: '' }])

  useEffect(() => { getMetaTemplates().then(setTemplates) }, [])

  const openNew = () => {
    setEditName('')
    setEditTags([{ name: '', content: '' }])
    setEditing('new')
  }

  const openEdit = (tpl) => {
    setEditName(tpl.name)
    setEditTags(tpl.tags.map(t => ({ ...t })))
    setEditing(tpl)
  }

  const addTag = () => setEditTags(t => [...t, { name: '', content: '' }])
  const updateTag = (i, field, val) =>
    setEditTags(t => t.map((tag, idx) => idx === i ? { ...tag, [field]: val } : tag))
  const removeTag = (i) => setEditTags(t => t.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!editName.trim()) return
    const tags = editTags.filter(t => t.name.trim())
    const record = await saveMetaTemplate({
      id: editing !== 'new' ? editing.id : undefined,
      name: editName.trim(),
      tags,
    })
    setTemplates(await getMetaTemplates())
    setEditing(null)
  }

  const handleDelete = async (id) => {
    if (!confirm('このテンプレートを削除しますか？')) return
    await deleteMetaTemplate(id)
    setTemplates(await getMetaTemplates())
  }

  const handleDuplicate = async (tpl) => {
    await saveMetaTemplate({
      name: tpl.name + ' (コピー)',
      tags: tpl.tags.map(t => ({ ...t })),
    })
    setTemplates(await getMetaTemplates())
  }

  return (
    <div className="space-y-3">
      {/* テンプレート一覧 */}
      {templates.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">テンプレートはまだありません。</p>
      ) : (
        <div className="space-y-2">
          {templates.map(tpl => (
            <div key={tpl.id} className="bg-white border border-sky-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {tpl.builtin && (
                    <span className="shrink-0 text-xs bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded font-medium">組み込み</span>
                  )}
                  <span className="text-sm font-semibold text-gray-700 truncate">{tpl.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDuplicate(tpl)}
                    title="複製"
                    className="text-gray-300 hover:text-sky-500 transition-colors p-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {!tpl.builtin && (
                    <>
                      <button
                        onClick={() => openEdit(tpl)}
                        className="text-xs text-sky-500 hover:text-sky-700 transition-colors px-1.5 py-0.5 rounded"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(tpl.id)}
                        title="削除"
                        className="text-gray-300 hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* タグ一覧プレビュー */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tpl.tags.map((tag, i) => (
                  <span key={i} className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {tag.name}{tag.content ? `="${tag.content}"` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新規作成ボタン */}
      {!editing && (
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-xs text-sky-500 hover:text-sky-700 font-medium transition-colors py-1"
        >
          <Plus className="w-3.5 h-3.5" />
          新しいテンプレートを作成
        </button>
      )}

      {/* 編集フォーム */}
      {editing && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-3">
          <p className="text-xs font-bold text-sky-700">
            {editing === 'new' ? '新規テンプレート' : 'テンプレートを編集'}
          </p>

          {/* テンプレート名 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">テンプレート名</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="例: Fediverse プロフィール"
              className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          {/* タグ編集 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">meta タグ</label>
            <div className="space-y-2">
              {editTags.map((tag, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={tag.name}
                    onChange={e => updateTag(i, 'name', e.target.value)}
                    placeholder="name"
                    className="w-2/5 px-2.5 py-1.5 rounded-lg border border-sky-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                  <input
                    value={tag.content}
                    onChange={e => updateTag(i, 'content', e.target.value)}
                    placeholder="content（空欄可）"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-sky-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                  <button onClick={() => removeTag(i)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={addTag} className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-700 transition-colors mt-1">
                <Plus className="w-3.5 h-3.5" />タグを追加
              </button>
            </div>
          </div>

          {/* 保存 / キャンセル */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!editName.trim()}
              className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-3 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── メイン ────────────────────────────────────────────────────────

export default function Settings() {
  const [config, setConfig] = useState(DEFAULT_SITE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSiteConfig().then(c => { setConfig(c); setLoading(false) })
  }, [])

  const set = (key) => (value) => setConfig(c => ({ ...c, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    await saveSiteConfig(config)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-sky-50 rounded-2xl border border-sky-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-800">設定</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          {saved
            ? <><CheckCircle className="w-3.5 h-3.5" />保存済み</>
            : <><Save className="w-3.5 h-3.5" />{saving ? '保存中…' : '変更を保存'}</>}
        </button>
      </div>

      {/* ① サイト情報 */}
      <Section icon={Globe} title="サイト情報" color="sky">
        <Field label="サイト名" hint="ブログのタイトルです。ヘッダーや OGP に使われます。">
          <Input value={config.siteTitle} onChange={set('siteTitle')} placeholder="My AirPubre Blog" />
        </Field>
        <Field label="サイトの説明">
          <TextArea value={config.siteDescription} onChange={set('siteDescription')} placeholder="このサイトについての説明文" rows={2} />
        </Field>
        <Field label="ベース URL" hint="公開時のドメイン（最後に / を付ける）">
          <Input value={config.baseUrl} onChange={set('baseUrl')} placeholder="https://example.com/" mono />
        </Field>
        <Field label="言語">
          <Select
            value={config.language}
            onChange={set('language')}
            options={[
              { value: 'ja', label: '日本語 (ja)' },
              { value: 'en', label: 'English (en)' },
              { value: 'zh', label: '中文 (zh)' },
              { value: 'ko', label: '한국어 (ko)' },
            ]}
          />
        </Field>
        <Field label="サイトテーマ" hint="生成されるサイトのデザインテーマ">
          <Select
            value={config.background ?? 'wordpress'}
            onChange={(v) => { applyAdminTheme(v); set('background')(v) }}
            options={[
              { value: 'wordpress', label: 'WordPress — クリーンなブログ定番スタイル' },
              { value: 'obsidian',  label: 'Obsidian — ダーク・グラフUI風' },
              { value: 'word',      label: 'Word — ドキュメント風シンプル白地' },
              { value: 'markdown',  label: 'Markdown — モノスペース・コードライク' },
            ]}
          />
        </Field>
      </Section>

      {/* ② 著者情報 */}
      <Section icon={User} title="著者情報" color="violet">
        <Field label="著者名">
          <Input value={config.authorName} onChange={set('authorName')} placeholder="山田 太郎" />
        </Field>
        <Field label="自己紹介" hint="著者ページ（~/author/）に表示されます。">
          <TextArea value={config.authorBio} onChange={set('authorBio')} placeholder="フリーランスエンジニア。Markdown と珈琲が好き。" />
        </Field>
        <Field label="著者ページ自由記述（Markdown）" hint="著者ページ下部に表示。経歴・実績・お仕事依頼など自由に。">
          <TextArea value={config.authorBioMarkdown} onChange={set('authorBioMarkdown')} rows={6} placeholder={'## 経歴\n- 2020 〜 ...'} />
        </Field>
        <Field label="アバター画像 URL">
          <div className="flex gap-2 items-center">
            {config.authorAvatarUrl && (
              <img src={config.authorAvatarUrl} alt="avatar" className="w-9 h-9 rounded-full object-cover border border-sky-100 shrink-0" onError={e => { e.target.style.display = 'none' }} />
            )}
            <Input value={config.authorAvatarUrl} onChange={set('authorAvatarUrl')} placeholder="https://example.com/avatar.jpg" />
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3">
          <Field label="X / Twitter">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">@</span>
              <Input value={config.authorTwitter} onChange={set('authorTwitter')} placeholder="username" />
            </div>
          </Field>
          <Field label="Mastodon">
            <Input value={config.authorMastodon} onChange={set('authorMastodon')} placeholder="@user@social.example" mono />
          </Field>
          <Field label="GitHub">
            <div className="flex items-center gap-2">
              <Github className="w-4 h-4 text-gray-400 shrink-0" />
              <Input value={config.authorGitHub} onChange={set('authorGitHub')} placeholder="username" />
            </div>
          </Field>
          <Field label="ウェブサイト">
            <Input value={config.authorWebsite} onChange={set('authorWebsite')} placeholder="https://example.com" mono />
          </Field>
        </div>
      </Section>

      {/* ③ SEO / OGP */}
      <Section icon={Search} title="SEO / OGP デフォルト" color="emerald">
        <Field label="デフォルト OGP 画像" hint="記事にサムネイルがない場合に使用されます。">
          <div className="flex gap-2 items-center">
            {config.defaultOgImage && (
              <img src={config.defaultOgImage} alt="og" className="w-14 h-9 rounded-lg object-cover border border-sky-100 shrink-0" onError={e => { e.target.style.display = 'none' }} />
            )}
            <Input value={config.defaultOgImage} onChange={set('defaultOgImage')} placeholder="https://example.com/og-default.png" />
          </div>
        </Field>
        <Field label="Twitter ハンドル" hint="twitter:site に使われます。">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">@</span>
            <Input value={config.twitterHandle} onChange={set('twitterHandle')} placeholder="username" />
          </div>
        </Field>
        <Field label="Google Analytics ID" hint="例: G-XXXXXXXXXX（任意）">
          <Input value={config.googleAnalyticsId} onChange={set('googleAnalyticsId')} placeholder="G-XXXXXXXXXX" mono />
        </Field>
      </Section>

      {/* ④ エディター */}
      <Section icon={PenLine} title="エディター設定" color="amber">
        <Field label="デフォルトエディター" hint="記事作成時に最初に表示されるエディターの種類">
          <Select
            value={config.defaultEditor}
            onChange={set('defaultEditor')}
            options={[
              { value: 'markdown', label: 'Markdown エディター' },
              { value: 'richtext', label: 'リッチテキスト（TipTap）' },
            ]}
          />
        </Field>
      </Section>

      {/* ⑤ デプロイ設定 */}
      <Section icon={Server} title="デプロイ設定" color="rose" defaultOpen={false}>
        <Field label="デプロイ先">
          <Select
            value={config.deployTarget}
            onChange={set('deployTarget')}
            options={[
              { value: '',                label: '未設定' },
              { value: 'github',          label: 'GitHub Pages' },
              { value: 'vercel',          label: 'Vercel' },
              { value: 'zip',             label: 'ZIP ダウンロード' },
              { value: 'rsync',           label: 'rsync（レンタルサーバー）' },
              { value: 'headless-github', label: 'Headless GitHub（外部ビルダー連携）' },
            ]}
          />
        </Field>

        {config.deployTarget === 'github' && (
          <>
            <Field label="GitHub Token" hint="repo スコープのトークンが必要です。">
              <SecretInput value={config.githubToken} onChange={set('githubToken')} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
            </Field>
            <Field label="リポジトリ" hint="ユーザー名/リポジトリ名">
              <Input value={config.githubRepo} onChange={set('githubRepo')} placeholder="username/my-blog" mono />
            </Field>
            <Field label="ブランチ">
              <Input value={config.githubBranch} onChange={set('githubBranch')} placeholder="gh-pages" mono />
            </Field>
          </>
        )}

        {config.deployTarget === 'vercel' && (
          <>
            <Field label="デプロイ方式">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!config.vercelFromGitHub}
                  onChange={e => set('vercelFromGitHub')(e.target.checked)}
                  className="w-4 h-4 accent-sky-500"
                />
                <span className="text-sm text-gray-700">GitHubリポジトリ経由でデプロイ（GitHub Push → Vercel 自動ビルド）</span>
              </label>
            </Field>
            {config.vercelFromGitHub ? (
              <>
                <Field label="GitHub Token" hint="repo スコープのトークンが必要です。">
                  <SecretInput value={config.githubToken} onChange={set('githubToken')} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
                </Field>
                <Field label="リポジトリ" hint="ユーザー名/リポジトリ名">
                  <Input value={config.githubRepo} onChange={set('githubRepo')} placeholder="username/my-blog" mono />
                </Field>
                <Field label="ブランチ" hint="Vercel が監視しているブランチ（通常 main）">
                  <Input value={config.githubBranch} onChange={set('githubBranch')} placeholder="main" mono />
                </Field>
              </>
            ) : (
              <>
                <Field label="Vercel Token">
                  <SecretInput value={config.vercelToken} onChange={set('vercelToken')} placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" />
                </Field>
                <Field label="プロジェクト ID">
                  <Input value={config.vercelProjectId} onChange={set('vercelProjectId')} placeholder="prj_xxxxxxxxxx" mono />
                </Field>
              </>
            )}
          </>
        )}

        {config.deployTarget === 'rsync' && (
          <>
            <Field label="ホスト名">
              <Input value={config.rsyncHost} onChange={set('rsyncHost')} placeholder="example.com" mono />
            </Field>
            <Field label="ユーザー名">
              <Input value={config.rsyncUser} onChange={set('rsyncUser')} placeholder="username" mono />
            </Field>
            <Field label="デプロイ先パス" hint="public_html/blog など">
              <Input value={config.rsyncPath} onChange={set('rsyncPath')} placeholder="/home/user/public_html" mono />
            </Field>
          </>
        )}

        {config.deployTarget === 'headless-github' && (
          <>
            <p className="text-xs text-gray-500 -mt-1 leading-relaxed">
              静的HTMLは生成せず、記事の <span className="font-mono">.md</span> とサムネイル画像だけを GitHub に push します。
              リポジトリ側のビルダー（cron / Webhook で動く <span className="font-mono">deploy-server.sh</span> など）が
              <span className="font-mono"> posts.json</span> や OGP HTML、rsync 転送を担当する想定です。
            </p>
            <Field label="GitHub Token" hint="repo スコープのトークンが必要です。">
              <SecretInput value={config.githubToken} onChange={set('githubToken')} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
            </Field>
            <Field label="リポジトリ" hint="ユーザー名/リポジトリ名">
              <Input value={config.githubRepo} onChange={set('githubRepo')} placeholder="username/site-repo" mono />
            </Field>
            <Field label="ブランチ">
              <Input value={config.githubBranch} onChange={set('githubBranch')} placeholder="main" mono />
            </Field>
            <Field label="記事ディレクトリ" hint="リポジトリ内の .md 出力先">
              <Input value={config.headlessPostsDir} onChange={set('headlessPostsDir')} placeholder="blog/posts" mono />
            </Field>
            <Field label="サムネイルディレクトリ">
              <Input value={config.headlessThumbnailsDir} onChange={set('headlessThumbnailsDir')} placeholder="blog/thumbnails" mono />
            </Field>
            <Field label="起動時の自動同期">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!config.headlessAutoPullOnStart}
                  onChange={e => set('headlessAutoPullOnStart')(e.target.checked)}
                  className="w-4 h-4 accent-sky-500"
                />
                <span className="text-sm text-gray-700">アプリ起動時に GitHub から記事を自動で取り込む</span>
              </label>
              <p className="text-xs text-gray-400 mt-1">
                ローカルの未デプロイ変更は自動で保護されます。多端末同期に推奨。
              </p>
            </Field>
            <HeadlessImportButton config={config} />
            <HeadlessRepoFileSection
              config={config}
              onChangeFiles={set('headlessRepoFiles')}
            />
          </>
        )}

        {config.deployTarget === 'zip' && (
          <p className="text-xs text-gray-500 py-1">
            管理画面から「ZIP でダウンロード」ボタンを押すと静的ファイルが一式取得できます。サーバーへの手動アップロードに使用してください。
          </p>
        )}
      </Section>

      {/* ⑥ デバイス間同期 */}
      <Section icon={RefreshCw} title="デバイス間同期" color="violet" defaultOpen={false}>
        <p className="text-xs text-gray-500 -mt-1">
          パスキーと暗号化を使って、複数のデバイスで記事を共有できます。デプロイ時に暗号化済みデータが自動で含まれます。
        </p>
        <SyncSection
          syncPassphrase={config.syncPassphrase}
          onPassphraseChange={set('syncPassphrase')}
        />
      </Section>

      {/* ⑦ meta タグテンプレート */}
      <Section icon={Tag} title="meta タグテンプレート" color="sky" defaultOpen={false}>
        <p className="text-xs text-gray-500 -mt-1">
          よく使う meta タグのセットをテンプレートとして登録しておくと、記事エディターからワンクリックで適用できます。
        </p>
        <MetaTemplateManager />
      </Section>

      {/* 保存ボタン（下部にも） */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          {saved
            ? <><CheckCircle className="w-4 h-4" />保存済み！</>
            : <><Save className="w-4 h-4" />{saving ? '保存中…' : '変更を保存'}</>}
        </button>
      </div>
    </div>
  )
}

// ── Headless GitHub からの記事インポートボタン ────────────────────
function HeadlessImportButton({ config }) {
  const [state, setState] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const canRun = config.githubRepo && config.headlessPostsDir

  const handleImport = async () => {
    if (!confirm('GitHub からすべての記事をインポートしますか？\nローカルより新しい記事のみ上書きされます。')) return
    setState('running')
    setError(null)
    setResult(null)
    try {
      const [owner, repo] = (config.githubRepo ?? '').split('/')
      if (!owner || !repo) throw new Error('リポジトリ名が不正です（owner/repo 形式）')
      const r = await importFromGitHub({
        owner,
        repo,
        branch: config.githubBranch || 'main',
        postsDir: config.headlessPostsDir,
        thumbnailsDir: config.headlessThumbnailsDir,
        token: config.githubToken,
        onProgress: setProgress,
      })
      setResult(r)
      setState('done')
    } catch (e) {
      setError(e.message)
      setState('error')
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-sky-100">
      <p className="text-xs text-gray-500">
        GitHub をマスターとして扱い、リポジトリ内の <span className="font-mono">.md</span> 記事を AirPubre に取り込みます。
        他のデバイスで編集した記事の同期に使えます。
      </p>
      <button
        type="button"
        onClick={handleImport}
        disabled={!canRun || state === 'running'}
        className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-sky-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${state === 'running' ? 'animate-spin' : ''}`} />
        {state === 'running'
          ? `インポート中… (${progress.done}/${progress.total})`
          : 'GitHub から記事をインポート'}
      </button>
      {state === 'done' && result && (
        <div className="text-xs space-y-1">
          <p className="text-emerald-600">
            ✓ {result.imported} 件取り込み（全 {result.total} 件中）
          </p>
          {result.skipped > 0 && (
            <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              <p className="font-medium">{result.skipped} 件はローカルの未デプロイ変更を保護してスキップしました：</p>
              <ul className="mt-1 space-y-0.5">
                {result.skippedSlugs?.map(slug => (
                  <li key={slug} className="font-mono truncate">· {slug}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {state === 'error' && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

// ── 任意リポジトリファイル編集セクション ───────────────────────────
function HeadlessRepoFileSection({ config, onChangeFiles }) {
  const files = config.headlessRepoFiles || []
  const [editing, setEditing] = useState(null) // { path, label } を編集中
  const [newPath, setNewPath] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const addFile = () => {
    const path = newPath.trim()
    if (!path) return
    onChangeFiles([...files, { path, label: newLabel.trim() || path }])
    setNewPath('')
    setNewLabel('')
  }

  const removeFile = (path) => {
    onChangeFiles(files.filter(f => f.path !== path))
  }

  return (
    <div className="space-y-2 pt-3 border-t border-sky-100">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-sky-500" />
        <h4 className="text-sm font-semibold text-gray-700">リポジトリファイル直接編集</h4>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        <span className="font-mono">now.json</span> や <span className="font-mono">.airpubre/config.json</span> など、
        記事ではないけど頻繁に書き換えたいファイルを登録しておくと、AirPubre から直接編集 → push できます。
      </p>

      {/* 登録済みリスト */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map(f => (
            <div key={f.path} className="flex items-center gap-2 bg-white border border-sky-100 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{f.label}</p>
                <p className="text-xs font-mono text-gray-400 truncate">{f.path}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(f)}
                className="text-sky-500 hover:text-sky-700 p-1"
                title="編集"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeFile(f.path)}
                className="text-gray-300 hover:text-red-400 p-1"
                title="削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 追加フォーム */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newPath}
          onChange={e => setNewPath(e.target.value)}
          placeholder="now.json"
          className="flex-1 px-2 py-1.5 rounded-lg border border-sky-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <input
          type="text"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="ラベル（任意）"
          className="flex-1 px-2 py-1.5 rounded-lg border border-sky-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <button
          type="button"
          onClick={addFile}
          disabled={!newPath.trim()}
          className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          追加
        </button>
      </div>

      {/* 編集モーダル */}
      {editing && (
        <RepoFileEditor
          file={editing}
          config={config}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── 1 ファイル編集モーダル ─────────────────────────────────────────
function RepoFileEditor({ file, config, onClose }) {
  const [state, setState] = useState('loading') // loading | editing | saving | saved | error
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [owner, repo] = (config.githubRepo ?? '').split('/')
        if (!owner || !repo) throw new Error('リポジトリ名が未設定です')
        const text = await fetchRepoFile({
          owner, repo,
          branch: config.githubBranch || 'main',
          path: file.path,
          token: config.githubToken,
        })
        if (cancelled) return
        const safe = text ?? ''
        setContent(safe)
        setOriginal(safe)
        setState('editing')
      } catch (e) {
        if (cancelled) return
        setError(e.message)
        setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [file.path])

  const dirty = content !== original
  const isJson = file.path.endsWith('.json')

  // JSON フォーマット補助
  const formatJson = () => {
    try {
      setContent(JSON.stringify(JSON.parse(content), null, 2))
    } catch (e) {
      setError(`JSON 整形に失敗: ${e.message}`)
    }
  }

  const handleSave = async () => {
    setState('saving')
    setError(null)
    try {
      // JSON は保存前にバリデーション
      if (isJson && content.trim()) {
        try { JSON.parse(content) }
        catch (e) { throw new Error(`JSON 構文エラー: ${e.message}`) }
      }
      const [owner, repo] = (config.githubRepo ?? '').split('/')
      await pushRepoFile({
        owner, repo,
        branch: config.githubBranch || 'main',
        path: file.path,
        content,
        token: config.githubToken,
        message: `update ${file.path} via AirPubre`,
      })
      setOriginal(content)
      setState('saved')
      setTimeout(() => setState('editing'), 1500)
    } catch (e) {
      setError(e.message)
      setState('editing')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sky-100">
          <FileText className="w-4 h-4 text-sky-500" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-800">{file.label}</h3>
            <p className="text-xs font-mono text-gray-400 truncate">{file.path}</p>
          </div>
          {dirty && <span className="text-xs text-amber-600 font-medium">未保存</span>}
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-auto p-5">
          {state === 'loading' && (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">読み込み中…</span>
            </div>
          )}
          {state === 'error' && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {(state === 'editing' || state === 'saving' || state === 'saved') && (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              className="w-full h-96 px-3 py-2 rounded-lg border border-sky-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
              placeholder={state === 'editing' && content === '' ? '（空のファイルです。内容を入力すると新規作成されます）' : ''}
            />
          )}
        </div>

        {/* フッター */}
        {(state === 'editing' || state === 'saving' || state === 'saved') && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-sky-100 bg-gray-50/50 rounded-b-2xl">
            {isJson && (
              <button
                type="button"
                onClick={formatJson}
                className="text-xs text-gray-500 hover:text-sky-600 px-2 py-1 rounded transition-colors"
              >
                JSON 整形
              </button>
            )}
            {error && state === 'editing' && (
              <p className="text-xs text-red-500 truncate flex-1">{error}</p>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || state === 'saving'}
                className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                {state === 'saving'
                  ? <><Loader2 className="w-3 h-3 animate-spin" />保存中…</>
                  : state === 'saved'
                  ? <><CheckCircle className="w-3 h-3" />保存しました！</>
                  : <><Save className="w-3 h-3" />保存して push</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
