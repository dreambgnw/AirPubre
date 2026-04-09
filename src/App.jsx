import { useState, useEffect } from 'react'
import SetupWizard from './components/Setup/SetupWizard.jsx'
import Login from './components/Login.jsx'
import AdminShell from './components/AdminShell.jsx'
import { getSetupState } from './lib/storage.js'

// 認証レベルをsessionStorageで管理
// → タブを閉じるとログアウト、リロードではセッション維持
const SESSION_KEY = 'airpubre_auth'

function getStoredAuth() {
  return sessionStorage.getItem(SESSION_KEY) ?? 'none'
}
function setStoredAuth(level) {
  if (level === 'none') sessionStorage.removeItem(SESSION_KEY)
  else sessionStorage.setItem(SESSION_KEY, level)
}

export default function App() {
  const [phase, setPhase] = useState('loading') // loading | setup | login | app
  const [authLevel, setAuthLevel] = useState('none')

  useEffect(() => {
    getSetupState().then(state => {
      if (!state?.completed) {
        setPhase('setup')
      } else {
        const stored = getStoredAuth()
        if (stored === 'none') {
          setPhase('login')
        } else {
          setAuthLevel(stored)
          setPhase('app')
        }
      }
    })
  }, [])

  const handleSetupComplete = () => {
    setStoredAuth('normal')
    setAuthLevel('normal')
    setPhase('app')
  }

  const handleLogin = ({ level }) => {
    setStoredAuth(level)
    setAuthLevel(level)
    setPhase('app')
  }

  const handleElevate = () => {
    setStoredAuth('none')
    setAuthLevel('none')
    setPhase('login')
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (phase === 'setup') {
    return <SetupWizard onComplete={handleSetupComplete} />
  }

  if (phase === 'login') {
    return <Login onLogin={handleLogin} />
  }

  return <AdminShell authLevel={authLevel} onElevate={handleElevate} />
}
