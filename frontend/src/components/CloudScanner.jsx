import React, { useState } from 'react';
import { scanCustomPath } from '../api';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function LeakRow({ leak, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
        onClick={() => setExpanded(e => !e)}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>#{index + 1}</td>
        <td style={{ padding: '10px 14px' }}>
          <span className={`badge badge-${leak.severity}`}>{leak.severity}</span>
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>{leak.secret_type}</td>
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
          {leak.file_path}
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
          :{leak.line_number}
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 18 }}>
          {expanded ? '▾' : '▸'}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--bg-input)' }}>
          <td colSpan={6} style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{leak.description}</div>
            <div className="leak-code" style={{ margin: 0 }}>{leak.line_content}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 16 }}>
              <span>Masked value: <code style={{ color: 'var(--critical)', fontFamily: 'JetBrains Mono' }}>{leak.matched_value}</code></span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CloudScanner() {
  const [path, setPath] = useState('');
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  async function handleScan() {
    if (!path.trim()) return;
    setScanning(true);
    setError('');
    setResult(null);
    try {
      const res = await scanCustomPath(path.trim());
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Scan failed. Check if the path exists and backend is running.');
    } finally {
      setScanning(false);
    }
  }

  const filteredLeaks = result?.leaks
    ? result.leaks
        .filter(lk => filter === 'all' || lk.severity === filter)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  // Cloud config file types to highlight
  const cloudFiles = result?.leaks
    ? [...new Set(result.leaks.map(l => l.file_path.split('/').pop()))]
    : [];

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Cloud Config Scanner</h1>
        <p className="page-subtitle">
          Scan any local directory for exposed cloud credentials (AWS, GCP, Azure) and other secrets
        </p>
      </div>

      {/* Scan input */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Scan Directory</span>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            id="scan-path-input"
            className="input"
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="Enter directory path, e.g. C:\Users\me\my-project"
            onKeyDown={e => e.key === 'Enter' && handleScan()}
          />
          <button
            id="custom-scan-btn"
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={handleScan}
            disabled={scanning || !path.trim()}
          >
            {scanning
              ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Scanning...</>
              : <><span>⚡</span> Scan</>}
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          The scanner will recursively check all files for secrets including cloud credentials, API keys, tokens, and passwords.
        </div>

        {/* Quick path buttons */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Quick scan:</span>
          {[
            { label: 'Alpha (Vulnerable)', path: String.raw`C:\Users\Victus\Desktop\hackathon(ctrlchoas)\test-repos\repo-alpha-vulnerable` },
            { label: 'Beta (Vulnerable)', path: String.raw`C:\Users\Victus\Desktop\hackathon(ctrlchoas)\test-repos\repo-beta-vulnerable` },
            { label: 'Gamma (Clean)', path: String.raw`C:\Users\Victus\Desktop\hackathon(ctrlchoas)\test-repos\repo-gamma-clean` },
            { label: 'Delta (Clean)', path: String.raw`C:\Users\Victus\Desktop\hackathon(ctrlchoas)\test-repos\repo-delta-clean` },
          ].map(qp => (
            <button
              key={qp.label}
              className="btn btn-ghost btn-sm"
              onClick={() => setPath(qp.path)}
              id={`quick-${qp.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
            >
              {qp.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert-banner danger">
          <span>⚠</span> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="fade-in">
          {/* Summary cards */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card red">
              <span className="stat-icon">🔐</span>
              <div className="stat-value">{result.total_leaks}</div>
              <div className="stat-label">Secrets Found</div>
            </div>
            <div className="stat-card red">
              <span className="stat-icon">💀</span>
              <div className="stat-value" style={{ color: 'var(--critical)' }}>{result.critical}</div>
              <div className="stat-label">Critical</div>
            </div>
            <div className="stat-card orange">
              <span className="stat-icon">⚠</span>
              <div className="stat-value">{result.high}</div>
              <div className="stat-label">High</div>
            </div>
            <div className="stat-card cyan">
              <span className="stat-icon">🟡</span>
              <div className="stat-value" style={{ color: 'var(--medium)' }}>{result.medium}</div>
              <div className="stat-label">Medium</div>
            </div>
          </div>

          {result.total_leaks === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="empty-icon">🛡️</span>
                <div className="empty-title">No secrets detected</div>
                <div className="empty-sub">This directory appears to be clean.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="alert-banner danger" style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>🚨</span>
                <span>
                  <strong>{result.total_leaks} secrets found</strong> in <strong>{result.repo_name}</strong>.
                  Files affected: {cloudFiles.slice(0, 5).join(', ')}{cloudFiles.length > 5 ? '...' : ''}
                </span>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Detected Secrets</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="badge badge-critical">{result.critical} critical</span>
                    <span className="badge badge-high">{result.high} high</span>
                  </div>
                </div>

                {/* Filter */}
                <div className="filter-bar">
                  {['all', 'critical', 'high', 'medium', 'low'].map(f => (
                    <button
                      key={f}
                      className={`filter-btn ${f} ${filter === f ? 'active' : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {f === 'all' ? `All (${result.total_leaks})` : `${f} (${result[f]})`}
                    </button>
                  ))}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['#', 'Severity', 'Type', 'File', 'Line', ''].map((h, i) => (
                          <th key={i} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeaks.map((lk, i) => (
                        <LeakRow key={i} leak={lk} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!result && !scanning && !error && (
        <div className="card">
          <div className="empty-state">
            <span className="empty-icon">☁️</span>
            <div className="empty-title">Ready to scan</div>
            <div className="empty-sub">
              Enter a directory path above or use the quick scan buttons to detect exposed credentials
            </div>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 24 }}>
        {[
          { icon: '☁️', title: 'AWS Credentials', desc: 'Access Key IDs, Secret Access Keys, session tokens' },
          { icon: '🔵', title: 'GCP Credentials', desc: 'Service account JSON keys, GCP API keys' },
          { icon: '🔷', title: 'Azure Credentials', desc: 'Storage keys, connection strings, SAS tokens' },
          { icon: '🔑', title: 'API Keys & Tokens', desc: 'GitHub, Slack, Stripe, SendGrid, and generic API keys' },
          { icon: '🗃️', title: 'Database URLs', desc: 'MySQL, PostgreSQL, MongoDB with credentials' },
          { icon: '🔒', title: 'Private Keys', desc: 'RSA, EC, and PEM private key materials' },
        ].map(item => (
          <div key={item.title} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
