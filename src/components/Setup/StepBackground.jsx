import { Monitor, Globe, FileText, Hash } from 'lucide-react'
import { applyAdminTheme } from '../../lib/theme.js'

const BACKGROUNDS = [
  {
    id: 'obsidian',
    label: 'Obsidian',
    desc: 'ダーク・グラフUI風。知識の網を映す洗練されたデザイン',
    icon: Hash,
    preview: 'bg-gray-900',
    textColor: 'text-gray-100',
    accent: 'bg-sky-400',
  },
  {
    id: 'wordpress',
    label: 'WordPress',
    desc: 'クリーンなブログ定番スタイル。読みやすさ重視',
    icon: Globe,
    preview: 'bg-white border border-gray-200',
    textColor: 'text-gray-800',
    accent: 'bg-blue-600',
  },
  {
    id: 'word',
    label: 'Word',
    desc: 'ドキュメント風のシンプルな白地。コンテンツが主役',
    icon: FileText,
    preview: 'bg-gray-50',
    textColor: 'text-gray-800',
    accent: 'bg-blue-700',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    desc: 'モノスペースなコードライクデザイン。技術ブログに最適',
    icon: Monitor,
    preview: 'bg-gray-950',
    textColor: 'text-green-400',
    accent: 'bg-green-500',
  },
]

export default function StepBackground({ data, next }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-gray-800">サイトの見た目を選ぶ</h2>
        <p className="text-sm text-gray-500">
          ベーステーマを選んでください。<br />
          設定からあとで変更できます。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {BACKGROUNDS.map(bg => {
          const Icon = bg.icon
          return (
            <button
              key={bg.id}
              onClick={() => {
                applyAdminTheme(bg.id)
                next({ background: bg.id })
              }}
              className="rounded-2xl border-2 border-sky-100 bg-white hover:border-sky-400 hover:shadow-md transition-all text-left group overflow-hidden"
            >
              {/* プレビュー */}
              <div className={`h-20 ${bg.preview} flex items-center justify-center gap-2 relative`}>
                <div className={`w-2 h-10 rounded-full ${bg.accent} opacity-80`} />
                <div className="space-y-1.5">
                  <div className={`h-2 w-16 rounded-full opacity-60 ${bg.accent}`} />
                  <div className={`h-1.5 w-12 rounded-full opacity-30 ${bg.accent}`} />
                  <div className={`h-1.5 w-14 rounded-full opacity-30 ${bg.accent}`} />
                </div>
              </div>
              {/* ラベル */}
              <div className="p-3">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-bold text-gray-800 text-sm group-hover:text-sky-600 transition-colors">
                    {bg.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{bg.desc}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
