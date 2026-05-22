import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { UploadCloud, ReceiptText, BarChart2, ShoppingCart, Sparkles, Package, X, Menu } from 'lucide-react'

const navItems = [
  { to: '/',         label: 'Dashboard',      icon: Sparkles },
  { to: '/upload',   label: 'Upload',         icon: UploadCloud },
  { to: '/receipts', label: 'Receipts',       icon: ReceiptText },
  { to: '/compare',  label: 'Compare',        icon: BarChart2 },
  { to: '/products', label: 'Products',       icon: Package },
  { to: '/deals',    label: 'Best Deals',     icon: ShoppingCart },
]

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <h1>Basket</h1>
          <span>Price Tracker</span>
        </div>
        <ul className="nav-list">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to} className="nav-item">
              <NavLink to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
                <Icon size={16} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar">
        <span className="mobile-logo">Basket</span>
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)}>
          <nav className="mobile-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div>
                <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: '1.5rem', color: 'var(--cream)' }}>Basket</h1>
                <span style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price Tracker</span>
              </div>
              <button className="mobile-close-btn" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <ul className="nav-list" style={{ padding: '16px 12px' }}>
              {navItems.map(({ to, label, icon: Icon }) => (
                <li key={to} className="nav-item">
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) => isActive ? 'active' : ''}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon size={16} />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      {/* ── Mobile bottom tab bar ── */}
      <nav className="mobile-tabbar">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
