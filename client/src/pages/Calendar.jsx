import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function Calendar() {
  const today = new Date();
  const [current, setCurrent] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    api.getBookings().then(setBookings).catch(() => {});
  }, []);

  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
  const firstDay = new Date(current.year, current.month, 1).getDay();

  const bookingMap = {};
  bookings.forEach(b => {
    const d = b.event_date?.split('T')[0];
    if (d) {
      if (!bookingMap[d]) bookingMap[d] = [];
      bookingMap[d].push(b);
    }
  });

  const prev = () => setCurrent(c => {
    if (c.month === 0) return { year: c.year - 1, month: 11 };
    return { ...c, month: c.month - 1 };
  });
  const next = () => setCurrent(c => {
    if (c.month === 11) return { year: c.year + 1, month: 0 };
    return { ...c, month: c.month + 1 };
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">Calendar</h1>
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{MONTHS[current.month]} {current.year}</h2>
          <div className="flex gap-2">
            <button onClick={prev} className="p-2 hover:bg-surface-overlay rounded-lg transition-colors">
              <ChevronLeft size={17} className="text-slate-400" />
            </button>
            <button onClick={next} className="p-2 hover:bg-surface-overlay rounded-lg transition-colors">
              <ChevronRight size={17} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const dateKey = `${current.year}-${String(current.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const events = bookingMap[dateKey] || [];
            const isToday = day === today.getDate() && current.month === today.getMonth() && current.year === today.getFullYear();
            return (
              <div key={day} className={`min-h-[70px] rounded-lg p-1.5 border transition-colors ${
                isToday ? 'border-brand/50 bg-brand/10' : 'border-transparent hover:border-surface-border'
              }`}>
                <span className={`text-xs font-medium ${isToday ? 'text-brand-light' : 'text-slate-400'}`}>{day}</span>
                {events.map(e => (
                  <div key={e.id} className="mt-1 text-xs bg-brand/20 text-brand-light rounded px-1 py-0.5 truncate" title={e.client_name}>
                    {e.client_name}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
