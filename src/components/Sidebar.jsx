import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { UploadCloud, ReceiptText, BarChart2, ShoppingCart, Sparkles, Package, X, Menu, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/',         label: 'Dashboard',  icon: Sparkles },
  { to: '/upload',   label: 'Upload',     icon: UploadCloud },
  { to: '/receipts', label: 'Receipts',   icon: ReceiptText },
  { to: '/compare',  label: 'Compare',    icon: BarChart2 },
  { to: '/products', label: 'Products',   icon: Package },
  { to: '/deals',    label: 'Best Deals', icon: ShoppingCart },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const NavLinks = ({ onNav }) => (
    <ul className="nav-list">
      {navItems.map(({ to, label, icon: Icon }) => (
        <li key={to} className="nav-item">
          <NavLink to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''} onClick={onNav}>
            <Icon size={16} />{label}
          </NavLink>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <h1>Basket</h1>
          <span>Price Tracker</span>
        </div>
        <NavLinks onNav={undefined} />
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 'auto' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <button onClick={logout} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.12)' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar">
        <span className="mobile-logo">Basket</span>
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)}>
          <nav className="mobile-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div>
                <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: '1.5rem', color: 'var(--cream)' }}>Basket</h1>
                <span style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price Tracker</span>
              </div>
              <button className="mobile-close-btn" onClick={() => setMobileOpen(false)}><X size={20} /></button>
            </div>
            <NavLinks onNav={() => setMobileOpen(false)} />
            <div style={{ padding: '16px 20px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginBottom: 8 }}>{user?.email}</div>
              <button onClick={() => { logout(); setMobileOpen(false) }} className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.12)' }}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* ── Mobile bottom tab bar ── */}
      <nav className="mobile-tabbar">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
