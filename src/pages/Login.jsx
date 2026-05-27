import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ShoppingCart } from 'lucide-react'

// Google "G" logo SVG
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function Login() {
  const { loginWithGoogle, authError } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const displayError = authError || error

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-lg)',
        padding: '44px 40px',
        width: '100%',
        maxWidth: 360,
        boxShadow: 'var(--shadow-lg)',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <ShoppingCart size={28} color="white" />
        </div>
        <h1 style={{ fontSize: '2rem', letterSpacing: '-0.02em', marginBottom: 4 }}>Basket</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginBottom: 32 }}>
          Grocery Price Tracker
        </p>

        {displayError && (
          <div style={{ background: 'var(--red-pale)', color: 'var(--red)', padding: '12px 16px', borderRadius: 10, fontSize: '0.85rem', marginBottom: 20, lineHeight: 1.5 }}>
            {displayError}
          </div>
        )}

        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '13px 20px',
            borderRadius: 10,
            border: '1.5px solid var(--border)',
            background: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: 'var(--ink)',
            transition: 'all 0.15s',
            opacity: loading ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--cream)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
        >
          {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <GoogleIcon />}
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginTop: 20, lineHeight: 1.6 }}>
          Access is restricted to authorized accounts only.
        </p>
      </div>
    </div>
  )
}
