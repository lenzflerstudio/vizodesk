import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, CalendarPlus, FileText,
  CreditCard, Calendar, Settings, LogOut, Bell,
  BarChart3, Search, MessageSquare, Plus, Landmark, Package
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/bookings/new', label: 'New Booking', icon: CalendarPlus },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/packages', label: 'Packages', icon: Package },
  { path: '/contracts', label: 'Contracts', icon: FileText },
  { path: '/payments', label: 'Payments', icon: CreditCard },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/taxes', label: 'Taxes', icon: Landmark },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-surface text-slate-200">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 min-h-0 bg-surface-raised border-r border-surface-border flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center">
              <BarChart3 size={16} className="text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight">VizoDesk</span>
              <p className="text-slate-500 text-xs">Photo & Video</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 px-3 py-4 space-y-0.5 overflow-y-auto overscroll-contain">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              onClick={(e) => {
                /* Drop focus after pointer nav — stops Chromium’s post-click focus outline (reads as a white border). */
                const el = e.currentTarget;
                requestAnimationFrame(() => {
                  if (document.activeElement === el) el.blur();
                  /* After blur, focus lands nowhere in Electron — move to main so inputs accept typing on the next page. */
                  const mainEl = document.querySelector('main');
                  if (mainEl && typeof mainEl.focus === 'function') {
                    mainEl.focus({ preventScroll: true });
                  }
                });
              }}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User Footer */}
        <div className="px-3 py-4 border-t border-surface-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 hover:bg-surface-overlay rounded-lg transition-colors" title="Logout">
              <LogOut size={15} className="text-slate-400" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content — min-h-0 lets nested flex + overflow scroll without subpixel gaps / “white line” flashes */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        {/* Top Bar */}
        <header className="min-h-14 flex-shrink-0 border-b border-surface-border bg-surface-raised flex items-center gap-4 px-6 py-3 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-xl">
            <label className="sr-only" htmlFor="app-global-search">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                id="app-global-search"
                type="search"
                placeholder="Search bookings, clients, contracts…"
                className="input pl-9 py-2 text-sm w-full"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 ml-auto">
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-surface-overlay transition-colors relative"
              title="Notifications"
            >
              <Bell size={18} className="text-slate-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand border-2 border-surface-raised" aria-hidden />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-surface-overlay transition-colors"
              title="Messages"
            >
              <MessageSquare size={18} className="text-slate-400" />
            </button>
            <button
              type="button"
              className="btn-primary text-sm py-2 px-4"
              onClick={() => navigate('/bookings/new')}
            >
              <Plus size={16} />
              New Booking
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-surface p-6 outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
