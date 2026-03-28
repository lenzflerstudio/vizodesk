import { useParams } from 'react-router-dom';
import PortalBookingView from './PortalBookingView.jsx';

export default function App() {
  const { token } = useParams();
  return <PortalBookingView token={token} />;
}
