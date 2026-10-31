import React, { useState, useEffect } from 'react';
import { getDashboard, scanAllRepos } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const SEVERITY_COLORS = {
  critical: '#ff3366',
  high: '#f97316',
  medium: '#eab308',
  low: '#06b6d4',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
      }}>
        <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    try {
      setLoading(true);
      setError('');
      const [dashRes, scanRes] = await Promise.all([
        getDashboard(),
        scanAllRepos(),
      ]);
      setStats(dashRes.data);
      setAllResults(scanRes.data);
    } catch (e) {
      setError('Cannot connect to SecretGuard backend. Make sure the Python server is running on port 8000.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRescan() {
    setScanning(true);
    await fetchDashboard();
    setScanning(false);
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div className="skeleton" style={{ height: 36, width: 260, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 18, width: 360 }} />
        </div>
        <div className="stats-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  // Severity distribution for bar chart
  const severityData = stats ? [
    { name: 'Critical', count: stats.critical_count, fill: SEVERITY_COLORS.critical },
    { name: 'High', count: stats.high_count, fill: SEVERITY_COLORS.high },
    { name: 'Medium', count: stats.medium_count, fill: SEVERITY_COLORS.medium },
    { name: 'Low', count: stats.low_count, fill: SEVERITY_COLORS.low },
  ] : [];

  // Per-repo data
  const repoData = allResults.map(r => ({
    name: r.repo_name.replace('repo-', ''),
    leaks: r.total_leaks,
    critical: r.critical,
    high: r.high,
    medium: r.medium,
    low: r.low,
  }));

  // Secret type pie chart
  const pieData = stats
    ? Object.entries(stats.secret_types || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value], i) => ({
          name,
          value,
          color: [
            '#ff3366', '#f97316', '#eab308', '#06b6d4',
            '#8b5cf6', '#3b82f6', '#10b981', '#00d4ff',
          ][i],
        }))
    : [];

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Security Dashboard</h1>
          <p className="page-subtitle">
            Overview of secret leaks detected across all repositories
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRescan}
          disabled={scanning}
          id="rescan-btn"
        >
          {scanning ? (
            <><div className="spinner" style={{ width: 14, height: 14 }} /> Scanning...</>
          ) : (
            <><span>⟳</span> Refresh Scan</>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="alert-banner danger">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Alert: secrets found */}
      {stats && stats.total_secrets > 0 && (
        <div className="alert-banner danger" style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <span>
            <strong>{stats.total_secrets} secrets detected</strong> across {stats.repos_with_leaks} of {stats.total_repos} repositories.
            Immediate remediation required.
          </span>
        </div>
      )}

      {stats && stats.total_secrets === 0 && (
        <div className="alert-banner success" style={{ marginBottom: 24 }}>
          <span>✓</span>
          <span>All repositories are clean — no secrets detected.</span>
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card cyan">
            <span className="stat-icon">📂</span>
            <div className="stat-value">{stats.total_repos}</div>
            <div className="stat-label">Repositories</div>
          </div>
          <div className="stat-card red">
            <span className="stat-icon">🔴</span>
            <div className="stat-value">{stats.repos_with_leaks}</div>
            <div className="stat-label">Vulnerable Repos</div>
          </div>
          <div className="stat-card green">
            <span className="stat-icon">🟢</span>
            <div className="stat-value">{stats.clean_repos}</div>
            <div className="stat-label">Clean Repos</div>
          </div>
          <div className="stat-card red">
            <span className="stat-icon">🔐</span>
            <div className="stat-value">{stats.total_secrets}</div>
            <div className="stat-label">Secrets Found</div>
          </div>
          <div className="stat-card red" style={{ '--stat-color': SEVERITY_COLORS.critical }}>
            <span className="stat-icon">💀</span>
            <div className="stat-value" style={{ color: SEVERITY_COLORS.critical }}>{stats.critical_count}</div>
            <div className="stat-label">Critical</div>
          </div>
          <div className="stat-card orange">
            <span className="stat-icon">⚠</span>
            <div className="stat-value">{stats.high_count + stats.medium_count}</div>
            <div className="stat-label">High + Medium</div>
          </div>
        </div>
      )}

      {/* Charts */}
      {stats && (
        <div className="charts-grid">
          {/* Severity bar chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Secrets by Severity</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={severityData} barSize={36}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Secrets">
                  {severityData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Secret types pie chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Secret Types Found</span>
            </div>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="40%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {value.length > 20 ? value.slice(0, 20) + '…' : value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <span className="empty-icon" style={{ fontSize: 36 }}>🛡️</span>
                <p className="empty-title" style={{ fontSize: 14 }}>No secrets detected</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-repo stacked bar */}
      {repoData.length > 0 && (
        <div className="card" style={{ marginBottom: 32 }}>
          <div className="card-header">
            <span className="card-title">Leaks per Repository</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={repoData} barSize={48}>
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="critical" name="Critical" stackId="a" fill={SEVERITY_COLORS.critical} radius={[0,0,0,0]} />
              <Bar dataKey="high" name="High" stackId="a" fill={SEVERITY_COLORS.high} />
              <Bar dataKey="medium" name="Medium" stackId="a" fill={SEVERITY_COLORS.medium} />
              <Bar dataKey="low" name="Low" stackId="a" fill={SEVERITY_COLORS.low} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent findings table */}
      {allResults.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Findings</span>
            <span className="badge badge-critical">{allResults.reduce((s, r) => s + r.total_leaks, 0)} total</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Repository', 'Secret Type', 'File', 'Line', 'Severity'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allResults.flatMap(r => r.leaks).slice(0, 10).map((lk, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{lk.repo_name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{lk.secret_type}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{lk.file_path}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>:{lk.line_number}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge badge-${lk.severity}`}>{lk.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
