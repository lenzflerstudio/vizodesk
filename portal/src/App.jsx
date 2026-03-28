import { useParams } from 'react-router-dom';
import PortalBookingView from '../../client/src/pages/PortalBookingView.jsx';

export default function App() {
  const { token } = useParams();
  return <PortalBookingView token={token} />;
}
