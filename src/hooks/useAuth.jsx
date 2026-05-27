import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

// ─── Allowlist ────────────────────────────────────────────────────────────────
// Only these two Gmail addresses can sign in. Everyone else is rejected.
const ALLOWED_EMAILS = [
  import.meta.env.VITE_ALLOWED_EMAIL_1,
  import.meta.env.VITE_ALLOWED_EMAIL_2,
].filter(Boolean).map(e => e.toLowerCase().trim())

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = still loading
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) { setUser(null); return }
      // Enforce allowlist on auth state changes too (e.g. page refresh)
      if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(u.email?.toLowerCase())) {
        await signOut(auth)
        setAuthError(`${u.email} is not authorized to access this app.`)
        setUser(null)
        return
      }
      setAuthError(null)
      setUser(u)
    })
    return unsub
  }, [])

  async function loginWithGoogle() {
    setAuthError(null)
    const provider = new GoogleAuthProvider()
    // Hint to show account picker even if already signed in
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    const email = result.user.email?.toLowerCase()
    if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
      await signOut(auth)
      throw new Error(`${result.user.email} is not authorized to access this app.`)
    }
  }

  async function logout() {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, logout, authError, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
