import { Link } from 'react-router';

export default function AdminDashboardPage() {
  return (
    <>
      <p className="eyebrow">Administration</p>
      <h1 id="admin-dashboard-title">Overview</h1>
      <p className="admin-dashboard-lede">Welcome to the Manglam Hotel &amp; Restaurant management workspace.</p>
      <div className="admin-foundation-card">
        <p className="eyebrow">Room management</p>
        <h2>Manage your hotel’s rooms.</h2>
        <p>Create drafts, update room details and control what guests see.</p>
        <Link className="button button-primary mt-6" to="/admin/rooms">Manage rooms</Link>
      </div>
      <div className="admin-foundation-card mt-6">
        <p className="eyebrow">Restaurant management</p><h2>Manage your restaurant menu.</h2>
        <p>Organize categories, update dishes and prices, and control publication and availability.</p>
        <Link className="button button-primary mt-6" to="/admin/restaurant">Manage restaurant</Link>
      </div>
      <div className="admin-foundation-card mt-6">
        <p className="eyebrow">Website settings</p><h2>Keep your public details current.</h2>
        <p>Update hotel contact information, address and official links shown across the website.</p>
        <Link className="button button-primary mt-6" to="/admin/settings">Manage website settings</Link>
      </div>
    </>
  );
}
