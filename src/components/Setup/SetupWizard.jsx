import { useState } from 'react'
import StepMode from './StepMode.jsx'
import StepMasterKey from './StepMasterKey.jsx'
import StepSubKey from './StepSubKey.jsx'
import StepBackup from './StepBackup.jsx'
import StepDeploy from './StepDeploy.jsx'
import StepBackground from './StepBackground.jsx'
import StepDone from './StepDone.jsx'

const STEPS = ['mode', 'masterKey', 'subKey', 'backup', 'deploy', 'background', 'done']

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState({
    mode: null,              // 'easy' | 'pro'
    masterKey: null,         // { words, keyString }
    subKey: null,            // string
    deployTarget: null,      // 'github' | 'vercel' | 'zip' | 'rsync'
    vercelFromGitHub: null,  // boolean | null
    background: null,        // 'obsidian' | 'wordpress' | 'word' | 'markdown'
  })

  const next = (patch = {}) => {
    setData(d => ({ ...d, ...patch }))
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  const stepProps = { data, next, onComplete }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col">
      {/* ヘッダー */}
      <header className="py-6 px-4 flex items-center justify-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center">
          <span className="text-white text-sm font-bold">AP</span>
        </div>
        <span className="text-xl font-bold text-gray-800">
          Air<span className="text-sky-500">Pubre</span>
        </span>
      </header>

      {/* プログレスバー */}
      <div className="px-8 mb-8">
        <div className="flex gap-1">
          {STEPS.slice(0, -1).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-sky-500' : 'bg-sky-100'
              }`}
            />
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <main className="flex-1 px-4 pb-8 max-w-md mx-auto w-full">
        {STEPS[step] === 'mode'       && <StepMode       {...stepProps} />}
        {STEPS[step] === 'masterKey'  && <StepMasterKey  {...stepProps} />}
        {STEPS[step] === 'subKey'     && <StepSubKey     {...stepProps} />}
        {STEPS[step] === 'backup'     && <StepBackup     {...stepProps} />}
        {STEPS[step] === 'deploy'     && <StepDeploy     {...stepProps} />}
        {STEPS[step] === 'background' && <StepBackground {...stepProps} />}
        {STEPS[step] === 'done'       && <StepDone       {...stepProps} />}
      </main>
    </div>
  )
}
