import { useCallback } from 'react';
import RoomsHero from '../components/rooms/RoomsHero.jsx';
import RoomsListing from '../components/rooms/RoomsListing.jsx';
import RoomContactBanner from '../components/rooms/RoomContactBanner.jsx';
import useApiData from '../hooks/useApiData.js';
import { getRooms } from '../services/api.js';
import '../styles/rooms.css';

export default function RoomsPage() {
  const loadRooms = useCallback(({ signal }) => getRooms({ signal }), []);
  const { data: rooms, error, loading, retry } = useApiData(loadRooms);

  return (
    <>
      <RoomsHero />
      <RoomsListing rooms={rooms ?? []} error={error} loading={loading} onRetry={retry} />
      <RoomContactBanner />
    </>
  );
}
