import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Copy, Trash2,
  TrendingUp, Users, CalendarDays, Clock
} from 'lucide-react';
import {
  Tooltip, ResponsiveContainer, ComposedChart, Area, Line, YAxis
} from 'recharts';
import toast from 'react-hot-toast';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { clientBookingPortalUrl } from '../lib/portalLinks';

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function revenueMonthOverMonthTrend(revenueYtd) {
  if (!revenueYtd || revenueYtd.length < 2) return null;
  const cur = Number(revenueYtd[revenueYtd.length - 1]?.total ?? 0);
  const prev = Number(revenueYtd[revenueYtd.length - 2]?.total ?? 0);
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { text: 'New', positive: true };
  const pct = ((cur - prev) / prev) * 100;
  return {
    text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    positive: pct >= 0
  };
}

function sparkMonthLabel(ym) {
  const [y, mo] = ym.split('-').map(Number);
  if (!y || !mo) return ym;
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function RevenueSparkTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-surface-border bg-[#16161d] px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-slate-400 mb-0.5">{sparkMonthLabel(row.month)}</p>
      <p className="font-semibold text-emerald-300 tabular-nums">{formatMoney(row.revenue)}</p>
    </div>
  );
}

function TotalRevenueCard({ value, revenueYtd, trend }) {
  const sparkData = (revenueYtd || []).map((m) => ({
    month: m.month,
    revenue: m.total || 0
  }));
  const hasSeries = sparkData.length > 0;
  const maxRev = sparkData.reduce((m, d) => Math.max(m, Number(d.revenue) || 0), 0);
  const yTop = maxRev === 0 ? 1 : maxRev * 1.12;

  return (
    <div className="card relative flex flex-col min-h-[158px]">
      <div className="flex items-end justify-between gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-900/30">
          <TrendingUp size={20} className="text-white" strokeWidth={2} />
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 min-w-0">
          {trend ? (
            <span
              className={
                trend.positive
                  ? 'text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/25 whitespace-nowrap'
                  : 'text-xs font-semibold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/25 whitespace-nowrap'
              }
            >
              {trend.text}
            </span>
          ) : null}
          <div
            className="w-[128px] sm:w-[148px] h-11"
            title="Revenue by month this year (completed payments)"
          >
            {hasSeries ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalRevenueSparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={[0, yTop]} />
                  <Tooltip
                    content={<RevenueSparkTooltip />}
                    cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="none"
                    fill="url(#totalRevenueSparkFill)"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6ee7b7"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, fill: '#a7f3d0', stroke: '#059669', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-end text-[10px] text-slate-600 pr-0.5">YTD</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 min-w-0">
        <p className="text-slate-500 text-sm">Total revenue</p>
        <p className="text-2xl font-bold text-white mt-1 tracking-tight break-words">{value}</p>
      </div>
    </div>
  );
}

function StatMetricCard({ label, value, icon: Icon, iconClass, trend }) {
  return (
    <div className="card relative flex flex-col min-h-[140px]">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          <Icon size={20} className="text-white" strokeWidth={2} />
        </div>
        {trend ? (
          <span
            className={
              trend.positive
                ? 'text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/25 whitespace-nowrap'
                : 'text-xs font-semibold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/25 whitespace-nowrap'
            }
          >
            {trend.text}
          </span>
        ) : null}
      </div>
      <p className="text-slate-500 text-sm mt-5">{label}</p>
      <p className="text-2xl font-bold text-white mt-1 tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Pending: 'badge-pending', Signed: 'badge-signed', Paid: 'badge-paid',
    Unpaid: 'badge-unpaid'
  };
  return <span className={map[status] || 'badge-unpaid'}>{status}</span>;
}

export default function Dashboard() {
  const { user, clientPortalBaseUrl } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [clientCount, setClientCount] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const showSpinner = useDelayedLoading(loading);

  useEffect(() => {
    Promise.all([api.getStats(), api.getBookings(), api.getClients()])
      .then(([s, b, clients]) => {
        setStats(s);
        setBookings(b.slice(0, 8));
        setClientCount(Array.isArray(clients) ? clients.length : 0);
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const copyLink = (token) => {
    const r = clientBookingPortalUrl(clientPortalBaseUrl, token);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    navigator.clipboard.writeText(r.url);
    toast.success('Booking link copied!');
  };

  const confirmDeleteBooking = async () => {
    if (deleteConfirmId == null) return;
    const id = deleteConfirmId;
    setDeleting(true);
    try {
      await api.deleteBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      const s = await api.getStats();
      setStats(s);
      toast.success('Booking deleted');
      setDeleteConfirmId(null);
    } catch {
      toast.error('Failed to delete booking');
    } finally {
      setDeleting(false);
    }
  };

  const firstName = user?.name?.split(' ')[0] || 'there';
  const revenueTrend = revenueMonthOverMonthTrend(stats?.revenueYtd);

  if (showSpinner) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      {deleteConfirmId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-booking-title"
        >
          <div className="card w-full max-w-md border border-surface-border shadow-xl">
            <h2 id="delete-booking-title" className="text-lg font-semibold text-white mb-2">
              Delete booking?
            </h2>
            <p className="text-sm text-slate-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={deleting}
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-red-600 hover:bg-red-500 border-0"
                disabled={deleting}
                onClick={confirmDeleteBooking}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1.5">
          Welcome back, {firstName}! Here&apos;s what&apos;s happening today.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <TotalRevenueCard
          value={formatMoney(stats?.totalRevenue ?? 0)}
          revenueYtd={stats?.revenueYtd}
          trend={revenueTrend}
        />
        <StatMetricCard
          label="Active clients"
          value={clientCount.toLocaleString()}
          icon={Users}
          iconClass="bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-blue-900/30"
        />
        <StatMetricCard
          label="Bookings"
          value={(stats?.totalBookings ?? 0).toLocaleString()}
          icon={CalendarDays}
          iconClass="bg-gradient-to-br from-violet-500 to-purple-700 shadow-lg shadow-violet-900/30"
        />
        <StatMetricCard
          label="Pending bookings"
          value={(stats?.pendingBookings ?? 0).toLocaleString()}
          icon={Clock}
          iconClass="bg-gradient-to-br from-fuchsia-500 to-pink-600 shadow-lg shadow-fuchsia-900/30"
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Recent Bookings</h2>
          <button
            type="button"
            className="text-xs text-brand hover:text-brand-light font-semibold"
            onClick={() => navigate('/calendar')}
          >
            View All
          </button>
        </div>
        {bookings.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <p className="text-sm">No bookings yet.</p>
            <button type="button" className="btn-primary mt-4 mx-auto" onClick={() => navigate('/bookings/new')}>
              <Plus size={14} /> Create your first booking
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider pb-3 pl-1">Client</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider pb-3">Event</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider pb-3">Date</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider pb-3">Status</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider pb-3">Payment</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider pb-3 pr-1">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-surface-overlay/50 transition-colors group">
                    <td className="py-3.5 pl-1 font-semibold text-white">
                      {b.client_name || <span className="text-slate-600 font-normal">—</span>}
                    </td>
                    <td className="py-3.5 text-slate-400">{b.package || '—'}</td>
                    <td className="py-3.5 text-slate-400">
                      {new Date(b.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-3.5"><StatusBadge status={b.status} /></td>
                    <td className="py-3.5">
                      {b.payment_status ? <StatusBadge status={b.payment_status} /> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-3.5 pr-1 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          type="button"
                          onClick={() => copyLink(b.public_token)}
                          className="p-1.5 hover:bg-surface-border rounded-lg"
                          title="Copy client link"
                        >
                          <Copy size={14} className="text-slate-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(b.id)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg"
                          title="Delete booking"
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
