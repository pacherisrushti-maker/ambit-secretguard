import React, { useState, useEffect, useCallback } from 'react';
import { getDashboard, getAlerts, getScanHistory, checkHealth } from '../services/api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#06b6d4',
};

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = Number(value) || 0;
    if (end === 0) { setDisplay(0); return; }
    const step = Math.ceil(end / 30);
    const timer = setInterval(() => {
      start = Math.min(start + step, end);
      setDisplay(start);
      if (start >= end) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

function StatCard({ icon, label, value, variant = '', sublabel }) {
  return (
    <div className={`stat-card ${variant} animate-in`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value"><AnimatedNumber value={value} /></div>
      <div className="stat-label">{label}</div>
      {sublabel && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{sublabel}</div>}
    </div>
  );
}

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

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [d, a, sh] = await Promise.all([
        getDashboard(),
        getAlerts({ status: 'unresolved' }),
        getScanHistory(),
      ]);
      setStats(d);
      setAlerts(a.slice(0, 5));
      setScanHistory(sh.slice(0, 10));
      setLastUpdated(new Date());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const severityData = alerts.reduce((acc, a) => {
    const sev = a.severity || 'low';
    const found = acc.find(x => x.name === sev);
    if (found) found.value++;
    else acc.push({ name: sev, value: 1 });
    return acc;
  }, []);

  const scanChartData = scanHistory
    .filter(s => s.duration_seconds)
    .slice(0, 8)
    .reverse()
    .map((s, i) => ({
      name: `Scan ${i + 1}`,
      duration: parseFloat(s.duration_seconds?.toFixed(2) || 0),
      files: s.files_scanned || 0,
      type: s.scan_type,
    }));

  if (loading) return (
    <div className="loading" style={{ height: '100vh' }}>
      <div className="spinner" />
      <span>Loading SecretGuard Dashboard…</span>
    </div>
  );

  return (
    <div>
      {error && (
        <div className="offline-banner">
          ⚠️ <strong>Backend Error:</strong> {error} — Start Flask: <code style={{ marginLeft: 6 }}>python app.py</code>
        </div>
      )}

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🛡️ AMBIT SecretGuard</h1>
            <p className="page-subtitle">AI-Powered GitHub Repository Monitoring and Secret Leak Detection</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
            {lastUpdated && <div>Last updated: {lastUpdated.toLocaleTimeString()}</div>}
            <div style={{ color: 'var(--accent-cyan)', marginTop: 2 }}>● Live</div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats Grid */}
        <div className="stats-grid">
          <StatCard icon="🔗" label="Connected Accounts" value={stats?.connected_accounts ?? 0} variant="blue" />
          <StatCard icon="📦" label="Monitored Repos" value={stats?.monitored_repositories ?? 0} variant="blue" />
          <StatCard icon="📝" label="Commits Detected" value={stats?.total_commits ?? 0} />
          <StatCard icon="🔄" label="Modifications" value={stats?.total_modifications ?? 0} />
          <StatCard icon="🔍" label="Files Scanned" value={stats?.files_scanned ?? 0} />
          <StatCard icon="🚨" label="Possible Leaks" value={stats?.possible_leaks ?? 0} variant={stats?.possible_leaks > 0 ? 'critical' : ''} />
          <StatCard icon="🔴" label="Critical Alerts" value={stats?.critical_alerts ?? 0} variant={stats?.critical_alerts > 0 ? 'critical' : ''} />
          <StatCard icon="✅" label="Resolved" value={stats?.resolved_alerts ?? 0} variant="success" />
          <StatCard icon="⏳" label="Pending Alerts" value={stats?.pending_alerts ?? 0} variant={stats?.pending_alerts > 0 ? 'high' : ''} />
        </div>

        {/* Charts Row */}
        <div className="grid-2" style={{ marginBottom: 20 }}>
          {/* Scan Duration Chart */}
          <div className="card">
            <div className="card-title">📊 Scan Duration History</div>
            <div className="card-subtitle">Recent scan durations in seconds</div>
            {scanChartData.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-icon">📊</div>
                <div className="empty-desc">No scan history yet. Run a scan to see results.</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={scanChartData}>
                  <defs>
                    <linearGradient id="durationGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="duration" name="Duration (s)"
                    stroke="#3b82f6" fill="url(#durationGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Alert Severity Pie */}
          <div className="card">
            <div className="card-title">🎯 Alert Severity Distribution</div>
            <div className="card-subtitle">Active unresolved alerts by severity</div>
            {severityData.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-icon">✅</div>
                <div className="empty-title" style={{ fontSize: 13 }}>No Active Alerts</div>
                <div className="empty-desc">All repositories are clean.</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={severityData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {severityData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11, textTransform: 'capitalize' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">🚨 Recent Unresolved Alerts</div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing latest 5</span>
          </div>
          {alerts.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <div className="empty-icon">🔒</div>
              <div className="empty-title" style={{ fontSize: 13 }}>No Active Alerts</div>
              <div className="empty-desc">Connect repositories and run a scan.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>File</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Detected</th>
                    <th>Est. Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {alert.repo_name || alert.repo_full_name || '—'}
                      </td>
                      <td className="table-mono" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {alert.file_path}
                      </td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {alert.secret_type}
                      </td>
                      <td>
                        <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(alert.detected_at).toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--accent-cyan)' }}>
                        {alert.estimated_fix_minutes}m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Scan Files Chart */}
        {scanChartData.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">📁 Files Scanned per Run</div>
            <div className="card-subtitle">Number of files inspected in each scan</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scanChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="files" name="Files Scanned" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
