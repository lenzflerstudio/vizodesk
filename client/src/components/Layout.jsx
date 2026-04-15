import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, CalendarPlus, FileText,
  CreditCard, Calendar, Settings, LogOut, Bell,
  BarChart3, Search, MessageSquare, Plus, Landmark, Package, Menu, X,
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

const MOBILE_LAYOUT_MQ = '(max-width: 768px)';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_LAYOUT_MQ).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const closeMobileNav = () => setMobileNavOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className={`app-layout-shell flex h-screen min-h-0 min-w-0 overflow-x-hidden bg-surface text-slate-200 ${
        isMobileLayout ? 'layout-is-mobile' : ''
      }`}
    >
      {isMobileLayout && mobileNavOpen ? (
        <button
          type="button"
          className="app-sidebar-overlay"
          aria-label="Close menu"
          onClick={closeMobileNav}
        />
      ) : null}
      {/* Mobile only: not mounted on desktop so it can never show there */}
      {isMobileLayout ? (
        <button
          type="button"
          className={`fixed left-4 top-2 z-[110] h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-slate-400 hover:bg-surface-overlay hover:text-slate-200 ${
            mobileNavOpen ? 'hidden' : 'flex'
          }`}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
          aria-controls="app-sidebar-nav"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <Menu size={22} strokeWidth={2} />
        </button>
      ) : null}
      {/* Sidebar: on mobile the outer slot takes no flex width; drawer is fixed inside it */}
      <div
        className={`app-sidebar-container min-h-0 self-stretch ${
          isMobileLayout
            ? 'w-0 max-w-0 min-w-0 shrink-0 grow-0 basis-0 overflow-visible border-0 p-0'
            : 'w-60 flex-shrink-0'
        }`}
      >
        <aside
          className={`app-sidebar flex min-h-0 flex-col border-r border-surface-border bg-surface-raised ${
            isMobileLayout
              ? `fixed inset-y-0 left-0 z-[100] w-60 max-w-[min(100vw,15rem)] shadow-[8px_0_32px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out ${
                  mobileNavOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
                }`
              : 'relative h-full w-full'
          }`}
        >
        {/* Logo — subtitle hidden on mobile via CSS (.app-sidebar-brand-text) */}
        <div className="app-sidebar-brand-row flex items-center gap-2 border-b border-surface-border px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-dark">
            <BarChart3 size={16} className="text-white" />
          </div>
          <div className="app-sidebar-brand-text min-w-0">
            <span className="text-white font-bold text-base tracking-tight">VizoDesk</span>
            <p className="text-slate-500 text-xs">Photo & Video</p>
          </div>
          {isMobileLayout && mobileNavOpen ? (
            <button
              type="button"
              className="ml-auto shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-overlay hover:text-slate-200"
              aria-label="Close menu"
              onClick={closeMobileNav}
            >
              <X size={20} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        {/* Nav */}
        <nav
          id="app-sidebar-nav"
          className="flex-1 min-h-0 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-4"
        >
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              onClick={(e) => {
                closeMobileNav();
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
      </div>

      {/* Main content — min-h-0 lets nested flex + overflow scroll without subpixel gaps / “white line” flashes */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        {/* Top bar: one strip — desktop: search + actions; mobile: bell + New Booking (menu is fixed above) */}
        <header
          className={`flex min-h-14 shrink-0 items-center border-b border-surface-border bg-surface-raised ${
            isMobileLayout
              ? 'min-h-[52px] gap-0 px-4 py-2.5 pl-[60px] pr-4'
              : 'min-h-14 flex-wrap gap-4 px-6 py-3'
          }`}
        >
          {!isMobileLayout ? (
            <div className="relative min-w-0 max-w-xl flex-1">
              <label className="sr-only" htmlFor="app-global-search">Search</label>
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                id="app-global-search"
                type="search"
                placeholder="Search bookings, clients, contracts…"
                className="input w-full py-2 pl-9 pr-3 text-sm"
                autoComplete="off"
              />
            </div>
          ) : null}
          <div
            className={`flex min-w-0 items-center gap-2 ${
              isMobileLayout
                ? 'w-full flex-1 justify-end gap-3'
                : 'ml-auto shrink-0 sm:gap-2'
            }`}
          >
            <button
              type="button"
              className="relative shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-overlay"
              title="Notifications"
            >
              <Bell size={18} />
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-surface-raised bg-brand"
                aria-hidden
              />
            </button>
            {!isMobileLayout ? (
              <button
                type="button"
                className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-overlay"
                title="Messages"
              >
                <MessageSquare size={18} />
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary shrink-0 py-2.5 text-sm md:px-4"
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
          className="app-main min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-surface p-6 outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
