import React, { useState, useEffect } from 'react';
import { getRemediationHistory, getRemediationStats, getAlerts, resolveAlert } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const SEVERITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#06b6d4' };

function RemediationCard({ alert }) {
  const detected = new Date(alert.detected_at);
  const now = new Date();
  const elapsedMs = now - detected;
  const elapsedMin = Math.round(elapsedMs / 60000);
  const estMin = alert.estimated_fix_minutes || 30;
  const progress = Math.min((elapsedMin / estMin) * 100, 100);
  const isOverdue = elapsedMin > estMin && alert.status !== 'resolved';

  return (
    <div className="card" style={{
      borderColor: alert.status === 'resolved'
        ? 'rgba(16,185,129,0.3)'
        : isOverdue ? 'var(--critical-border)' : 'var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {alert.secret_type}
            </span>
            <span className={`badge badge-${alert.severity}`}>{alert.severity?.toUpperCase()}</span>
            {isOverdue && alert.status !== 'resolved' && (
              <span className="badge badge-critical">⚠️ OVERDUE</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {alert.repo_name || alert.repo_full_name} — <code className="mono">{alert.file_path}</code>
          </div>
        </div>
        <span className={`badge ${alert.status === 'resolved' ? 'badge-success' : 'badge-critical'}`}>
          {alert.status === 'resolved' ? '✅ RESOLVED' : '⏳ UNRESOLVED'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Detected', value: new Date(alert.detected_at).toLocaleTimeString() },
          { label: 'Est. Fix', value: `${alert.estimated_fix_minutes}m`, color: 'var(--accent-cyan)' },
          { label: 'Actual Fix', value: alert.actual_fix_minutes ? `${alert.actual_fix_minutes}m` : (alert.status === 'resolved' ? '—' : 'Pending'), color: alert.actual_fix_minutes ? 'var(--success)' : undefined },
          { label: 'Time Elapsed', value: alert.status === 'resolved' ? (alert.actual_fix_minutes ? `${alert.actual_fix_minutes}m` : '—') : `${elapsedMin}m`, color: isOverdue ? 'var(--critical)' : undefined },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono', color: color || 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      {alert.status !== 'resolved' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Time Progress vs Estimate</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: progress >= 100 ? 'var(--critical)' : progress >= 70 ? 'var(--warning)' : 'var(--gradient-brand)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {alert.resolved_at && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          Resolved by <strong style={{ color: 'var(--text-secondary)' }}>{alert.resolved_by || 'admin'}</strong>
          {' '}on {new Date(alert.resolved_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default function RemediationPage() {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [h, s, a] = await Promise.all([
        getRemediationHistory(),
        getRemediationStats(),
        getAlerts(),
      ]);
      setHistory(h);
      setStats(s);
      setAlerts(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const chartData = stats ? Object.entries(stats.by_severity || {}).map(([sev, data]) => ({
    severity: sev.charAt(0).toUpperCase() + sev.slice(1),
    Total: data.total,
    Resolved: data.resolved,
    Unresolved: data.total - data.resolved,
  })) : [];

  const estVsActualData = alerts
    .filter(a => a.estimated_fix_minutes && a.actual_fix_minutes)
    .slice(0, 10)
    .map((a, i) => ({
      name: `Alert ${i + 1}`,
      Estimated: a.estimated_fix_minutes,
      Actual: a.actual_fix_minutes,
    }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
          {payload.map((p) => (
            <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8 }}>
              <span>{p.name}:</span><strong>{p.value} min</strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⏱️ Remediation Time Tracking</h1>
        <p className="page-subtitle">Track estimated vs. actual time to resolve security findings</p>
      </div>
      <div className="page-body">
        {error && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}

        {/* Stats */}
        {stats && (
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card blue"><div className="stat-icon">📊</div><div className="stat-value">{stats.total}</div><div className="stat-label">Total Alerts</div></div>
            <div className="stat-card success"><div className="stat-icon">✅</div><div className="stat-value">{stats.resolved}</div><div className="stat-label">Resolved</div></div>
            <div className="stat-card high"><div className="stat-icon">⏳</div><div className="stat-value">{stats.unresolved}</div><div className="stat-label">Unresolved</div></div>
            <div className="stat-card"><div className="stat-icon">📐</div><div className="stat-value">{stats.avg_estimated_minutes}m</div><div className="stat-label">Avg. Estimated</div></div>
            <div className="stat-card"><div className="stat-icon">⌚</div><div className="stat-value">{stats.avg_actual_minutes}m</div><div className="stat-label">Avg. Actual</div></div>
          </div>
        )}

        {/* Charts */}
        {chartData.length > 0 && (
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">📊 Alerts by Severity</div>
              <div className="card-subtitle">Total vs Resolved per severity level</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="severity" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  <Bar dataKey="Total" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Resolved" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {estVsActualData.length > 0 && (
              <div className="card">
                <div className="card-title">🎯 Estimated vs. Actual Fix Time</div>
                <div className="card-subtitle">Minutes to resolve — comparison chart</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={estVsActualData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                    <Bar dataKey="Estimated" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Actual" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Alert Remediation Cards */}
        <div className="section-header" style={{ marginBottom: 14 }}>
          <div className="section-title">🗂️ Alert Remediation Status</div>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⏱️</div>
            <div className="empty-title">No Alerts to Track</div>
            <div className="empty-desc">Run a scan to generate security alerts. Remediation tracking begins automatically.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.map((alert) => (
              <RemediationCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}

        {/* Default Estimates Reference */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>📋 Default Remediation Estimates</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            These are planning estimates based on severity. Actual resolution time is measured from alert creation until it is manually marked resolved.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { sev: 'Critical', mins: 60, color: 'var(--critical)', bg: 'var(--critical-bg)' },
              { sev: 'High', mins: 30, color: 'var(--high)', bg: 'var(--high-bg)' },
              { sev: 'Medium', mins: 20, color: 'var(--medium)', bg: 'var(--medium-bg)' },
              { sev: 'Low', mins: 10, color: 'var(--low)', bg: 'var(--low-bg)' },
            ].map(({ sev, mins, color, bg }) => (
              <div key={sev} style={{
                background: bg, border: `1px solid ${color}33`,
                borderRadius: 8, padding: '12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{sev}</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'JetBrains Mono', color }}>{mins}m</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>estimated</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
