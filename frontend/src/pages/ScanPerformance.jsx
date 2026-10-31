import React, { useState, useEffect } from 'react';
import { getScanHistory, getRepositories } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12,
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8 }}>
            <span>{p.name}:</span><strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function ScanPerformancePage() {
  const [history, setHistory] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterRepo, setFilterRepo] = useState('');

  const load = async () => {
    try {
      const [h, r] = await Promise.all([
        getScanHistory(filterRepo ? { repo_id: filterRepo } : {}),
        getRepositories(),
      ]);
      setHistory(h);
      setRepos(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterRepo]);

  const completed = history.filter(s => s.status === 'completed');

  const chartData = completed.slice(0, 15).reverse().map((s, i) => ({
    name: `#${i + 1} ${s.scan_type === 'webhook' ? '🔔' : '🔍'}`,
    duration: parseFloat(s.duration_seconds?.toFixed(2) || 0),
    files: s.files_scanned || 0,
    leaks: s.leaks_found || 0,
    type: s.scan_type,
    repo: s.repo_name || 'Unknown',
  }));

  const repoComparison = repos.map((r) => {
    const repoScans = completed.filter(s => s.repo_id === r.id);
    const avgDuration = repoScans.length
      ? repoScans.reduce((a, s) => a + (s.duration_seconds || 0), 0) / repoScans.length
      : 0;
    return {
      repo: r.repo_name,
      scans: repoScans.length,
      avgDuration: parseFloat(avgDuration.toFixed(2)),
      totalLeaks: repoScans.reduce((a, s) => a + (s.leaks_found || 0), 0),
    };
  });

  const totalDuration = completed.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const avgDuration = completed.length ? totalDuration / completed.length : 0;
  const webhookScans = completed.filter(s => s.scan_type === 'webhook').length;
  const manualScans = completed.filter(s => s.scan_type === 'manual').length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚡ Scan Performance</h1>
        <p className="page-subtitle">Detailed scan metrics, duration analysis, and repository comparison</p>
      </div>
      <div className="page-body">
        {error && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}

        {/* Summary Stats */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card blue">
            <div className="stat-icon">🔍</div>
            <div className="stat-value">{completed.length}</div>
            <div className="stat-label">Total Scans</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🔔</div>
            <div className="stat-value">{webhookScans}</div>
            <div className="stat-label">Webhook Scans</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🖱️</div>
            <div className="stat-value">{manualScans}</div>
            <div className="stat-label">Manual Scans</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-value">{avgDuration.toFixed(1)}s</div>
            <div className="stat-label">Avg. Duration</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📁</div>
            <div className="stat-value">{completed.reduce((a, s) => a + (s.files_scanned || 0), 0)}</div>
            <div className="stat-label">Total Files Scanned</div>
          </div>
          <div className="stat-card critical">
            <div className="stat-icon">🚨</div>
            <div className="stat-value">{completed.reduce((a, s) => a + (s.leaks_found || 0), 0)}</div>
            <div className="stat-label">Total Leaks Found</div>
          </div>
        </div>

        {/* Filter */}
        <div className="filters-bar" style={{ marginBottom: 16 }}>
          <select className="input" value={filterRepo} onChange={(e) => setFilterRepo(e.target.value)}>
            <option value="">All Repositories</option>
            {repos.map((r) => <option key={r.id} value={r.id}>{r.repo_name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
        </div>

        {/* Charts */}
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-title">⏱️ Scan Duration History</div>
            <div className="card-subtitle">Duration in seconds — 🔔 Webhook vs 🔍 Manual</div>
            {chartData.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-desc">No completed scans yet</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 9 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="duration" name="Duration (s)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-title">📁 Files Scanned vs Leaks Found</div>
            <div className="card-subtitle">Correlation between scan scope and findings</div>
            {chartData.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-desc">No completed scans yet</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 9 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>} />
                  <Line type="monotone" dataKey="files" name="Files Scanned" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="leaks" name="Leaks Found" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Repository Comparison */}
        {repoComparison.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">🏁 Repository Scan Comparison</div>
            <div className="card-subtitle">Average scan duration per repository</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={repoComparison} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis dataKey="repo" type="category" stroke="var(--text-muted)" tick={{ fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgDuration" name="Avg Duration (s)" fill="#14b8a6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Scan History Table */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">📋 Scan History</div>
          </div>
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : history.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <div className="empty-icon">🔍</div>
              <div className="empty-desc">No scans yet. Run a scan from the Repositories page.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Repository</th>
                    <th>Type</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Duration</th>
                    <th>Files Scanned</th>
                    <th>Inspected</th>
                    <th>Leaks Found</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 50).map((scan) => (
                    <tr key={scan.id}>
                      <td className="table-mono" style={{ color: 'var(--text-muted)' }}>#{scan.id}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {scan.repo_name || scan.repo_full_name || '—'}
                      </td>
                      <td>
                        <span className={`badge ${scan.scan_type === 'webhook' ? 'badge-purple' : 'badge-info'}`}>
                          {scan.scan_type === 'webhook' ? '🔔 Webhook' : '🔍 Manual'}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(scan.started_at).toLocaleString()}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {scan.completed_at ? new Date(scan.completed_at).toLocaleString() : '—'}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--accent-cyan)' }}>
                        {scan.duration_seconds ? `${parseFloat(scan.duration_seconds).toFixed(2)}s` : '—'}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>{scan.files_scanned ?? '—'}</td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>{scan.files_inspected ?? '—'}</td>
                      <td style={{
                        fontFamily: 'JetBrains Mono', fontSize: 11,
                        color: (scan.leaks_found ?? 0) > 0 ? 'var(--critical)' : 'var(--success)',
                      }}>
                        {scan.leaks_found ?? 0}
                      </td>
                      <td>
                        <span className={`badge ${
                          scan.status === 'completed' ? 'badge-success' :
                          scan.status === 'running' ? 'badge-info' : 'badge-critical'
                        }`}>
                          {scan.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
