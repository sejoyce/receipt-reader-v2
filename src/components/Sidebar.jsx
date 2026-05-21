// src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import {
  UploadCloud, ReceiptText, BarChart2, ShoppingCart, Sparkles, Package
} from 'lucide-react'

const navItems = [
  { to: '/',           label: 'Dashboard',      icon: Sparkles },
  { to: '/upload',     label: 'Upload Receipt', icon: UploadCloud },
  { to: '/receipts',   label: 'Receipt Log',    icon: ReceiptText },
  { to: '/compare',    label: 'Compare Prices', icon: BarChart2 },
  { to: '/products',   label: 'Products',       icon: Package },
  { to: '/deals',      label: 'Best Deals',     icon: ShoppingCart },
]

export default function Sidebar() {
  return (
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
  )
}
