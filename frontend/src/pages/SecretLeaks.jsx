import React, { useState, useEffect } from 'react';
import { getAlerts, getRepositories, resolveAlert } from '../services/api';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function RecommendationBox({ secretType, severity }) {
  const tips = {
    'GitHub Personal Access Token': [
      'Revoke the token immediately at github.com/settings/tokens',
      'Generate a new token with minimal required scopes',
      'Use GitHub Actions secrets or environment variables instead',
      'Enable secret scanning alerts on your repositories',
    ],
    'AWS Access Key ID': [
      'Deactivate the key in AWS IAM console immediately',
      'Check CloudTrail for unauthorized usage',
      'Create a new key pair and update your applications',
      'Use IAM roles instead of long-lived access keys',
    ],
    'Hardcoded Password': [
      'Change the password immediately in the target system',
      'Use environment variables or a secrets manager',
      'Audit access logs for unauthorized use',
      'Implement secret rotation policies',
    ],
  };

  const defaultTips = [
    `Revoke or rotate the exposed ${secretType} immediately`,
    'Remove the secret from the repository and all history',
    'Store secrets in environment variables or a vault service',
    'Review access logs for any unauthorized usage',
    'Enable branch protection and required reviews',
  ];

  const recommendations = tips[secretType] || defaultTips;

  return (
    <div style={{
      background: 'rgba(59, 130, 246, 0.06)',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      borderRadius: 8, padding: '12px 14px', marginTop: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        🛡️ Recommendations
      </div>
      {recommendations.map((tip, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
          <span style={{ color: 'var(--accent-blue)', flexShrink: 0 }}>→</span>
          <span>{tip}</span>
        </div>
      ))}
    </div>
  );
}

function AlertRow({ alert, onResolve, onExpand, expanded }) {
  return (
    <>
      <tr onClick={() => onExpand(alert.id)} style={{ cursor: 'pointer' }}>
        <td>
          <span className={`badge badge-${alert.severity}`}>{alert.severity?.toUpperCase()}</span>
        </td>
        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {alert.repo_name || alert.repo_full_name || '—'}
        </td>
        <td className="table-mono"><code className="mono">{alert.file_path}</code></td>
        <td>{alert.secret_type}</td>
        <td>
          <span className="masked-secret">{alert.masked_value || '****'}</span>
        </td>
        <td>
          <span className={`badge ${alert.status === 'resolved' ? 'badge-success' : 'badge-critical'}`}>
            {alert.status === 'resolved' ? '✅ Resolved' : '⚠️ Unresolved'}
          </span>
        </td>
        <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {new Date(alert.detected_at).toLocaleString()}
        </td>
        <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--accent-cyan)' }}>
          {alert.estimated_fix_minutes}m est.
        </td>
        <td>
          {alert.status !== 'resolved' && (
            <button className="btn btn-success btn-sm"
              onClick={(e) => { e.stopPropagation(); onResolve(alert.id); }}>
              ✓ Resolve
            </button>
          )}
        </td>
      </tr>
      {expanded === alert.id && (
        <tr>
          <td colSpan={9} style={{ background: 'rgba(0,0,0,0.2)', padding: '14px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Finding Detail</div>
                {[
                  ['Repository', alert.repo_full_name],
                  ['File', alert.file_path],
                  ['Line Number', alert.line_number || 'N/A'],
                  ['Commit ID', alert.commit_id || 'N/A'],
                  ['Secret Type', alert.secret_type],
                  ['Severity', alert.severity],
                  ['Description', alert.description],
                  ['Detection Time', new Date(alert.detected_at).toLocaleString()],
                  ['Est. Fix Time', `${alert.estimated_fix_minutes} minutes`],
                  ['Actual Fix Time', alert.actual_fix_minutes ? `${alert.actual_fix_minutes} minutes` : 'Pending'],
                  ['Status', alert.status],
                  ['Resolved By', alert.resolved_by || '—'],
                  ['Resolved At', alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>{k}:</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: k === 'File' ? 'JetBrains Mono' : 'inherit' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <RecommendationBox secretType={alert.secret_type} severity={alert.severity} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SecretLeaksPage() {
  const [alerts, setAlerts] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({ repo_id: '', severity: '', status: '' });

  const load = async () => {
    try {
      const params = {};
      if (filters.repo_id) params.repo_id = filters.repo_id;
      if (filters.severity) params.severity = filters.severity;
      if (filters.status) params.status = filters.status;
      const [a, r] = await Promise.all([getAlerts(params), getRepositories()]);
      const sorted = [...a].sort((x, y) =>
        (SEVERITY_ORDER[x.severity] ?? 4) - (SEVERITY_ORDER[y.severity] ?? 4)
      );
      setAlerts(sorted);
      setRepos(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const handleResolve = async (id) => {
    const resolvedBy = window.prompt('Enter your name or ID to mark this alert resolved:', 'admin');
    if (resolvedBy === null) return;
    const notes = window.prompt('Add optional resolution notes:', '');
    try {
      await resolveAlert(id, resolvedBy || 'admin', notes || '');
      setSuccess('Alert marked as resolved. Remediation time recorded.');
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleExpand = (id) => setExpanded(expanded === id ? null : id);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🚨 Secret Leak Detection</h1>
        <p className="page-subtitle">All detected credential exposures across monitored repositories</p>
      </div>
      <div className="page-body">
        {error && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}
        {success && <div className="alert-banner success"><span>✅</span><span>{success}</span></div>}

        <div className="alert-banner info" style={{ marginBottom: 16 }}>
          <span>ℹ️</span>
          <span>Detected values are <strong>masked</strong> for security. Click any row to see full details and security recommendations. Never expose raw credential values.</span>
        </div>

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
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {alerts.length} finding{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔒</div>
            <div className="empty-title">No Findings</div>
            <div className="empty-desc">No secret leaks detected. Connect repositories and run scans to check for exposures.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Repository</th>
                  <th>File</th>
                  <th>Secret Type</th>
                  <th>Masked Value</th>
                  <th>Status</th>
                  <th>Detected At</th>
                  <th>Est. Fix</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} onResolve={handleResolve}
                    onExpand={handleExpand} expanded={expanded} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
