export default function ManagementState({ loading, error, onRetry, children }) {
  return <div className="admin-management-state" role={error ? 'alert' : 'status'}>
    <p>{loading ? 'Loading rooms…' : error || children}</p>
    {error && onRetry && <button className="button button-outline mt-4" type="button" onClick={onRetry}>Try again</button>}
  </div>;
}
