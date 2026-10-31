import React, { useState, useEffect } from 'react';
import {
  getDashboard, getRepositories, getAlerts, getScanHistory,
  getRemediationStats, getModifications,
} from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

const SEVERITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#06b6d4' };

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
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

export default function ReportsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [repos, setRepos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [remStats, setRemStats] = useState(null);
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [d, r, a, sh, rs, m] = await Promise.all([
        getDashboard(), getRepositories(), getAlerts(),
        getScanHistory(), getRemediationStats(), getModifications(),
      ]);
      setDashboard(d);
      setRepos(r);
      setAlerts(a);
      setScanHistory(sh);
      setRemStats(rs);
      setMods(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Severity distribution pie data
  const severityPieData = ['critical', 'high', 'medium', 'low'].map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: alerts.filter(a => a.severity === s).length,
  })).filter(d => d.value > 0);

  // Repository security status
  const repoStatusData = repos.map((r) => ({
    repo: r.repo_name,
    Alerts: r.alert_count || 0,
    Commits: r.commit_count || 0,
    Mods: r.modification_count || 0,
  }));

  // Scan history chart
  const scanChart = scanHistory.slice(0, 10).reverse().map((s, i) => ({
    name: `#${i + 1}`,
    duration: parseFloat(s.duration_seconds?.toFixed(2) || 0),
    files: s.files_scanned || 0,
    leaks: s.leaks_found || 0,
  }));

  // Resolved vs unresolved
  const resolvedPie = [
    { name: 'Resolved', value: dashboard?.resolved_alerts || 0 },
    { name: 'Unresolved', value: dashboard?.pending_alerts || 0 },
  ].filter(d => d.value > 0);

  if (loading) return <div className="loading" style={{ height: '80vh' }}><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">📊 Reports & Analytics</h1>
            <p className="page-subtitle">Comprehensive security overview and historical analytics</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}

        {/* Executive Summary */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>📋 Executive Security Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { label: 'Accounts', value: dashboard?.connected_accounts || 0, icon: '🔗', color: 'var(--accent-cyan)' },
              { label: 'Repositories', value: dashboard?.monitored_repositories || 0, icon: '📦', color: 'var(--accent-blue)' },
              { label: 'Commits', value: dashboard?.total_commits || 0, icon: '📝', color: 'var(--text-primary)' },
              { label: 'Modifications', value: dashboard?.total_modifications || 0, icon: '🔄', color: 'var(--warning)' },
              { label: 'Files Scanned', value: dashboard?.files_scanned || 0, icon: '🔍', color: 'var(--text-primary)' },
              { label: 'Leaks Detected', value: dashboard?.possible_leaks || 0, icon: '🚨', color: 'var(--critical)' },
              { label: 'Resolved', value: dashboard?.resolved_alerts || 0, icon: '✅', color: 'var(--success)' },
              { label: 'Pending', value: dashboard?.pending_alerts || 0, icon: '⏳', color: 'var(--high)' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '12px 8px' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'JetBrains Mono', color }}>{value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid-2" style={{ marginBottom: 16 }}>
          {/* Alert severity pie */}
          <div className="card">
            <div className="card-title">🎯 Alert Severity Distribution</div>
            <div className="card-subtitle">All alerts by severity level</div>
            {severityPieData.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}><div className="empty-desc">No alerts yet</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={severityPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {severityPieData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name.toLowerCase()] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Resolved vs Unresolved */}
          <div className="card">
            <div className="card-title">✅ Resolution Status</div>
            <div className="card-subtitle">Resolved vs pending alerts</div>
            {resolvedPie.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}><div className="empty-desc">No alerts yet</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={resolvedPie} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Repository Status Bar Chart */}
        {repoStatusData.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📦 Repository Security Status Comparison</div>
            <div className="card-subtitle">Alerts, commits, and modifications per repository</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={repoStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="repo" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="Commits" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Mods" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Alerts" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Scan Performance Line Chart */}
        {scanChart.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">⚡ Scan Performance Over Time</div>
            <div className="card-subtitle">Duration, files, and leaks across recent scans</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scanChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                <Line type="monotone" dataKey="duration" name="Duration (s)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="files" name="Files Scanned" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="leaks" name="Leaks Found" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Remediation Summary */}
        {remStats && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>⏱️ Remediation Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Avg. Estimated Fix', value: `${remStats.avg_estimated_minutes}m`, icon: '📐' },
                { label: 'Avg. Actual Fix', value: `${remStats.avg_actual_minutes}m`, icon: '⌚' },
                { label: 'Resolution Rate', value: remStats.total > 0 ? `${Math.round((remStats.resolved / remStats.total) * 100)}%` : 'N/A', icon: '📈' },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'var(--accent-cyan)' }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Repository Detail Table */}
        {repos.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>📋 Repository Security Report</div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Commits</th>
                    <th>Modifications</th>
                    <th>Active Alerts</th>
                    <th>Test Repo</th>
                    <th>Last Scanned</th>
                  </tr>
                </thead>
                <tbody>
                  {repos.map((repo) => (
                    <tr key={repo.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{repo.repo_name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>@{repo.owner}</td>
                      <td>
                        <span className={`badge ${
                          repo.security_status === 'secure' ? 'badge-success' :
                          repo.security_status === 'possible_leak' ? 'badge-critical' : 'badge-muted'
                        }`}>
                          {repo.security_status === 'secure' ? '✅ Secure' :
                           repo.security_status === 'possible_leak' ? '🚨 Leak' : '❓ Unscanned'}
                        </span>
                      </td>
                      <td className="table-mono">{repo.commit_count ?? 0}</td>
                      <td className="table-mono">{repo.modification_count ?? 0}</td>
                      <td className="table-mono" style={{ color: (repo.alert_count ?? 0) > 0 ? 'var(--critical)' : 'inherit' }}>
                        {repo.alert_count ?? 0}
                      </td>
                      <td>{repo.is_test_repo ? <span className="badge badge-purple">🧪 Yes</span> : '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {repo.last_scanned_at ? new Date(repo.last_scanned_at).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
