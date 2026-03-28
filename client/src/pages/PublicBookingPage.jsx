import { useParams } from 'react-router-dom';
import PortalBookingView from './PortalBookingView.jsx';

/**
 * Client booking link on the admin origin (e.g. https://vizodesk.onrender.com/booking/:token).
 * Same UI as the standalone portal app; no login required.
 */
export default function PublicBookingPage() {
  const { token } = useParams();
  return <PortalBookingView token={token} />;
}
