import React, { useState, useEffect } from 'react';
import { getAlerts, getRepositories, resolveAlert } from '../services/api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    repo_id: '', severity: '', status: '', date_from: '', date_to: '',
  });
  const [selected, setSelected] = useState(null);
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveForm, setResolveForm] = useState({ resolved_by: 'admin', notes: '' });
  const [resolving, setResolving] = useState(false);

  const load = async () => {
    try {
      const params = {};
      if (filters.repo_id) params.repo_id = filters.repo_id;
      if (filters.severity) params.severity = filters.severity;
      if (filters.status) params.status = filters.status;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const [a, r] = await Promise.all([getAlerts(params), getRepositories()]);
      setAlerts(a);
      setRepos(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const handleResolveSubmit = async () => {
    if (!resolveModal) return;
    setResolving(true);
    try {
      await resolveAlert(resolveModal.id, resolveForm.resolved_by, resolveForm.notes);
      setSuccess('Alert resolved. Remediation time recorded.');
      setResolveModal(null);
      setResolveForm({ resolved_by: 'admin', notes: '' });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setResolving(false);
    }
  };

  const notify = (msg, isErr = false) => {
    if (isErr) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔔 Alert Management</h1>
        <p className="page-subtitle">View, filter, and resolve all security alerts</p>
      </div>
      <div className="page-body">
        {error && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}
        {success && <div className="alert-banner success"><span>✅</span><span>{success}</span></div>}

        {/* Filters */}
        <div className="filters-bar">
          <select className="input" value={filters.repo_id}
            onChange={(e) => setFilters({ ...filters, repo_id: e.target.value })}>
            <option value="">All Repositories</option>
            {repos.map((r) => <option key={r.id} value={r.id}>{r.repo_name}</option>)}
          </select>
          <select className="input" value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
            <option value="">All Severities</option>
            <option value="critical">🔴 Critical</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🔵 Low</option>
          </select>
          <select className="input" value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Statuses</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
          <input type="date" className="input" value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            title="From date" />
          <input type="date" className="input" value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            title="To date" />
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
          {Object.values(filters).some(Boolean) && (
            <button className="btn btn-danger btn-sm" onClick={() =>
              setFilters({ repo_id: '', severity: '', status: '', date_from: '', date_to: '' })
            }>✕ Clear</button>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <div className="empty-title">No Alerts Found</div>
            <div className="empty-desc">No alerts match your current filters.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderColor: selected?.id === alert.id ? 'var(--border-bright)' :
                    alert.status === 'resolved' ? 'rgba(16,185,129,0.2)' :
                    alert.severity === 'critical' ? 'var(--critical-border)' : 'var(--border)',
                }}
                onClick={() => setSelected(selected?.id === alert.id ? null : alert)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  {/* Severity icon */}
                  <div style={{
                    fontSize: 20, width: 36, height: 36,
                    background: alert.severity === 'critical' ? 'var(--critical-bg)' :
                      alert.severity === 'high' ? 'var(--high-bg)' :
                      alert.severity === 'medium' ? 'var(--medium-bg)' : 'var(--low-bg)',
                    border: `1px solid ${
                      alert.severity === 'critical' ? 'var(--critical-border)' :
                      alert.severity === 'high' ? 'var(--high-border)' :
                      alert.severity === 'medium' ? 'var(--medium-border)' : 'var(--low-border)'
                    }`,
                    borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' :
                     alert.severity === 'medium' ? '🟡' : '🔵'}
                  </div>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {alert.secret_type}
                      </span>
                      <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
                      <span className={`badge ${alert.status === 'resolved' ? 'badge-success' : 'badge-critical'}`}>
                        {alert.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>📦 {alert.repo_name || alert.repo_full_name}</span>
                      <span>📄 <code className="mono">{alert.file_path}</code></span>
                      {alert.line_number && <span>Line {alert.line_number}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(alert.detected_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                      Est: {alert.estimated_fix_minutes}m
                    </div>
                    {alert.actual_fix_minutes && (
                      <div style={{ fontSize: 12, color: 'var(--success)', fontFamily: 'JetBrains Mono' }}>
                        Actual: {alert.actual_fix_minutes}m
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {selected?.id === alert.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                      <div>
                        {[
                          ['Description', alert.description],
                          ['Masked Value', alert.masked_value],
                          ['Account', `@${alert.account_username}`],
                          ['Repository', alert.repo_full_name],
                          ['File Path', alert.file_path],
                          ['Line Number', alert.line_number || 'N/A'],
                          ['Commit ID', alert.commit_id || 'N/A'],
                        ].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>{k}:</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        {[
                          ['Status', alert.status],
                          ['Estimated Fix', `${alert.estimated_fix_minutes} minutes`],
                          ['Actual Fix', alert.actual_fix_minutes ? `${alert.actual_fix_minutes} minutes` : 'Pending'],
                          ['Resolved By', alert.resolved_by || '—'],
                          ['Resolved At', alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : '—'],
                        ].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>{k}:</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {alert.status !== 'resolved' && (
                      <button className="btn btn-success btn-sm"
                        onClick={(e) => { e.stopPropagation(); setResolveModal(alert); }}>
                        ✓ Mark as Resolved
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="modal-overlay" onClick={() => setResolveModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">✅ Resolve Alert</div>
            <div className="modal-desc">
              Mark this alert as resolved. The actual remediation time will be calculated automatically from detection time to now.
            </div>
            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px', marginBottom: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{resolveModal.secret_type}</div>
              <div style={{ color: 'var(--text-muted)' }}>{resolveModal.repo_full_name} — {resolveModal.file_path}</div>
              <div style={{ color: 'var(--accent-cyan)', marginTop: 4, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                Est. fix: {resolveModal.estimated_fix_minutes}m
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Resolved By</label>
              <input className="input" value={resolveForm.resolved_by}
                onChange={(e) => setResolveForm({ ...resolveForm, resolved_by: e.target.value })}
                placeholder="Your name or ID" />
            </div>
            <div className="input-group">
              <label className="input-label">Resolution Notes (optional)</label>
              <textarea className="input" rows={3} value={resolveForm.notes}
                onChange={(e) => setResolveForm({ ...resolveForm, notes: e.target.value })}
                placeholder="Describe what was done to fix this issue…"
                style={{ resize: 'vertical' }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResolveModal(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleResolveSubmit} disabled={resolving}>
                {resolving ? <><div className="spinner spinner-sm" /> Resolving…</> : '✅ Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
