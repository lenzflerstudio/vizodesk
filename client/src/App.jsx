import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import NewBooking from './pages/NewBooking';
import BookingDetail from './pages/BookingDetail';
import Contracts from './pages/Contracts';
import Payments from './pages/Payments';
import Calendar from './pages/Calendar';
import Settings from './pages/Settings';
import Taxes from './pages/Taxes';
import Packages from './pages/Packages';
import PublicBookingPage from './pages/PublicBookingPage.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-[100dvh] min-h-screen overflow-x-hidden bg-surface text-slate-200 antialiased">
        <Routes>
          {/* Public: must stay outside PrivateRoute — no vizo_token required */}
          <Route path="/login" element={<Login />} />
          <Route path="/booking/:token" element={<PublicBookingPage />} />
          <Route path="/client/:token" element={<PublicBookingPage />} />
          <Route path="/contract/:token" element={<PublicBookingPage />} />
          <Route path="/payment/:token" element={<PublicBookingPage />} />

          {/* Pathless layout: only matches when a child matches (never steals /booking/*, etc.) */}
          <Route
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="bookings/new" element={<NewBooking />} />
            <Route path="bookings/:id" element={<BookingDetail />} />
            <Route path="packages" element={<Packages />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="payments" element={<Payments />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="taxes" element={<Taxes />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
