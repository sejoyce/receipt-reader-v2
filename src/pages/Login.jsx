import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ShoppingCart } from 'lucide-react'

export default function Login() {
  const { login, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login') // 'login' | 'reset'

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Incorrect email or password.')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a moment.')
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setResetSent(true)
    } catch (err) {
      setError('Could not send reset email. Check the address and try again.')
    } finally {
      setLoading(false)
    }
  }

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
        padding: '40px 36px',
        width: '100%',
        maxWidth: 380,
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--green)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <ShoppingCart size={26} color="white" />
          </div>
          <h1 style={{ fontSize: '1.8rem', letterSpacing: '-0.02em' }}>Basket</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginTop: 2 }}>Grocery Price Tracker</p>
        </div>

        {mode === 'login' && (
          <>
            <h2 style={{ fontSize: '1.1rem', marginBottom: 20, color: 'var(--ink)' }}>Sign in</h2>

            {error && (
              <div style={{ background: 'var(--red-pale)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : 'Sign in'}
              </button>
            </form>

            <button
              onClick={() => { setMode('reset'); setError('') }}
              style={{ display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center' }}
            >
              Forgot password?
            </button>
          </>
        )}

        {mode === 'reset' && (
          <>
            <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>Reset password</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-light)', marginBottom: 20 }}>
              Enter your email and we'll send a reset link.
            </p>

            {error && (
              <div style={{ background: 'var(--red-pale)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>
                {error}
              </div>
            )}

            {resetSent ? (
              <div style={{ background: 'var(--green-pale)', color: 'var(--green)', padding: '12px 14px', borderRadius: 8, fontSize: '0.875rem', textAlign: 'center' }}>
                ✓ Reset email sent — check your inbox.
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={loading}
                >
                  {loading ? <span className="spinner" /> : 'Send reset link'}
                </button>
              </form>
            )}

            <button
              onClick={() => { setMode('login'); setError(''); setResetSent(false) }}
              style={{ display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center' }}
            >
              ← Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  )
}
