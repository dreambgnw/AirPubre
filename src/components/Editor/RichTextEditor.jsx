/**
 * RichTextEditor — TipTap ベースの Word 風 WYSIWYG エディター
 */
import { useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Code, Code2,
  Link as LinkIcon, Image as ImageIcon, Minus,
  Undo2, Redo2, RemoveFormatting,
} from 'lucide-react'
import { imageToWebP, shouldConvertToWebP } from '../../lib/imageUtils.js'

// ── ツールバーボタン ──────────────────────────────────────────────

function ToolBtn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors text-sm
        ${active
          ? 'bg-sky-100 text-sky-600'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />
}

function Toolbar({ editor }) {
  if (!editor) return null

  const setLink = () => {
    const url = window.prompt('リンクURL', editor.getAttributes('link').href ?? '')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run()
  }

  const insertImage = () => {
    // ファイル選択 → WebP変換 → base64 挿入
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const src = shouldConvertToWebP(file.name)
          ? await imageToWebP(file, { maxW: 1200, maxH: 900 })
          : await new Promise((res, rej) => {
              const reader = new FileReader()
              reader.onload = () => res(reader.result)
              reader.onerror = rej
              reader.readAsDataURL(file)
            })
        editor.chain().focus().setImage({ src }).run()
      } catch { /* 失敗は無視 */ }
    }
    input.click()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      {/* Undo / Redo */}
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="元に戻す">
        <Undo2 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="やり直し">
        <Redo2 className="w-3.5 h-3.5" />
      </ToolBtn>

      <Divider />

      {/* 見出し */}
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="見出し1">
        <Heading1 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="見出し2">
        <Heading2 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="見出し3">
        <Heading3 className="w-3.5 h-3.5" />
      </ToolBtn>

      <Divider />

      {/* 文字装飾 */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="太字">
        <Bold className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体">
        <Italic className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下線">
        <UnderlineIcon className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="取り消し線">
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="インラインコード">
        <Code className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="書式をクリア">
        <RemoveFormatting className="w-3.5 h-3.5" />
      </ToolBtn>

      <Divider />

      {/* 揃え */}
      <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左揃え">
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="中央揃え">
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右揃え">
        <AlignRight className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="両端揃え">
        <AlignJustify className="w-3.5 h-3.5" />
      </ToolBtn>

      <Divider />

      {/* リスト */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="箇条書き">
        <List className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="番号付きリスト">
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
        <Quote className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="コードブロック">
        <Code2 className="w-3.5 h-3.5" />
      </ToolBtn>

      <Divider />

      {/* 挿入 */}
      <ToolBtn onClick={setLink} active={editor.isActive('link')} title="リンク">
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={insertImage} title="画像">
        <ImageIcon className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="区切り線">
        <Minus className="w-3.5 h-3.5" />
      </ToolBtn>
    </div>
  )
}

// ── メイン ────────────────────────────────────────────────────────

export default function RichTextEditor({ html, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'ここに文章を書こう...' }),
      Typography,
    ],
    content: html,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  // 外からコンテンツが変わったとき（モード切り替え時）に同期
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== html) {
      editor.commands.setContent(html, false)
    }
  }, [html])

  return (
    <div className="border border-sky-100 rounded-xl overflow-hidden bg-white shadow-sm">
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="min-h-[60vh] px-10 py-8 text-gray-800 leading-relaxed
          [&_.ProseMirror]:outline-none
          [&_.ProseMirror]:min-h-[56vh]
          [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h1]:mb-3
          [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mt-5 [&_.ProseMirror_h2]:mb-2
          [&_.ProseMirror_h3]:text-xl  [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-2
          [&_.ProseMirror_p]:mb-3 [&_.ProseMirror_p]:leading-7
          [&_.ProseMirror_ul]:list-disc   [&_.ProseMirror_ul]:ml-6 [&_.ProseMirror_ul]:mb-3
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-6 [&_.ProseMirror_ol]:mb-3
          [&_.ProseMirror_li]:mb-1
          [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-sky-200 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-gray-500 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-3
          [&_.ProseMirror_pre]:bg-gray-900 [&_.ProseMirror_pre]:text-gray-100 [&_.ProseMirror_pre]:rounded-xl [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre]:my-3 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-sm
          [&_.ProseMirror_code]:bg-gray-100 [&_.ProseMirror_code]:text-sky-600 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-sm
          [&_.ProseMirror_hr]:border-sky-100 [&_.ProseMirror_hr]:my-6
          [&_.ProseMirror_a]:text-sky-500 [&_.ProseMirror_a]:underline
          [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-xl [&_.ProseMirror_img]:my-3
          [&_.ProseMirror_strong]:font-bold
          [&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-300 [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none
        "
      />
    </div>
  )
}
