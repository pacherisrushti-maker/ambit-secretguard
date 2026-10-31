import React, { useState, useRef, useCallback } from 'react';
import { scanFile } from '../api';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const ALLOWED_EXTENSIONS = [
  '.py', '.js', '.jsx', '.ts', '.tsx', '.json', '.env', '.yaml', '.yml',
  '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.rb', '.go',
  '.java', '.kt', '.swift', '.php', '.cs', '.cpp', '.c', '.h', '.rs',
  '.tf', '.tfvars', '.properties', '.xml', '.gradle', '.pom', '.dockerfile',
  'Dockerfile', '.sql', '.md', '.txt', '.csv',
];

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
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, width: 36 }}>#{index + 1}</td>
        <td style={{ padding: '10px 14px' }}>
          <span className={`badge badge-${leak.severity}`}>{leak.severity}</span>
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>
          {leak.secret_type}
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
          Line {leak.line_number}
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 18, textAlign: 'right' }}>
          {expanded ? '▾' : '▸'}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--bg-input)' }}>
          <td colSpan={5} style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
              {leak.description}
            </div>
            <div className="leak-code">{leak.line_content}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span>📍 Line <strong style={{ color: 'var(--text-secondary)' }}>{leak.line_number}</strong></span>
              <span>🔑 Masked: <code style={{ color: 'var(--critical)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{leak.matched_value}</code></span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SeverityBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: `0 0 8px ${color}55`,
        }} />
      </div>
    </div>
  );
}

export default function FileScanner() {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const fileInputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    setSelectedFile(file);
    setResult(null);
    setError('');
    setFilter('all');
    setScanning(true);
    try {
      const res = await scanFile(file);
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Scan failed. Make sure the backend is running on port 8000.');
    } finally {
      setScanning(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setError('');
    setFilter('all');
  };

  const filteredLeaks = result?.leaks
    ? result.leaks
        .filter(lk => filter === 'all' || lk.severity === filter)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  const getFileIcon = (name = '') => {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { py: '🐍', js: '🟨', jsx: '⚛', ts: '🔷', tsx: '⚛', json: '📋', env: '⚙', yaml: '📄', yml: '📄', sh: '💻', go: '🐹', java: '☕', tf: '🔧', sql: '🗄', md: '📝', dockerfile: '🐳' };
    return icons[ext] || '📄';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">File Scanner</h1>
        <p className="page-subtitle">
          Upload any source file to instantly scan it for leaked secrets, credentials, and API keys
        </p>
      </div>

      {/* Drop zone */}
      {!result && (
        <div
          id="file-drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent-cyan)' : 'var(--border-bright)'}`,
            borderRadius: 20,
            padding: '64px 40px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging
              ? 'rgba(0, 212, 255, 0.05)'
              : 'var(--bg-card)',
            transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            marginBottom: 24,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: dragging ? 'var(--shadow-glow-cyan)' : 'none',
          }}
        >
          {/* Animated glow ring when dragging */}
          {dragging && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at center, rgba(0,212,255,0.08) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
          )}

          <div style={{ fontSize: 56, marginBottom: 20, filter: dragging ? 'drop-shadow(0 0 12px var(--accent-cyan))' : 'none', transition: 'filter 0.25s' }}>
            {scanning ? '⚙️' : dragging ? '📂' : '📁'}
          </div>

          {scanning ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
                <div className="spinner" />
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-cyan)' }}>Scanning...</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Analyzing <strong style={{ color: 'var(--text-secondary)' }}>{selectedFile?.name}</strong> for secrets
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: dragging ? 'var(--accent-cyan)' : 'var(--text-primary)', marginBottom: 10, transition: 'color 0.2s' }}>
                {dragging ? 'Drop file to scan' : 'Drop a file here to scan'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                or <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, textDecoration: 'underline' }}>click to browse</span>
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['.py', '.js', '.env', '.json', '.yaml', '.tf', '.sh', 'Dockerfile', '+more'].map(ext => (
                  <span key={ext} style={{
                    padding: '3px 10px', borderRadius: 100,
                    fontSize: 11, fontWeight: 600,
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace',
                  }}>
                    {ext}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        id="file-input"
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept={ALLOWED_EXTENSIONS.join(',')}
      />

      {/* Error */}
      {error && (
        <div className="alert-banner danger">
          <span>⚠</span> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="fade-in">
          {/* File info bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 20px', marginBottom: 20,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12,
          }}>
            <span style={{ fontSize: 28 }}>{getFileIcon(selectedFile?.name)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                {selectedFile?.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {selectedFile && formatSize(selectedFile.size)} · Scanned just now
              </div>
            </div>
            <button
              id="scan-another-btn"
              className="btn btn-ghost btn-sm"
              onClick={handleReset}
            >
              ← Scan Another File
            </button>
          </div>

          {/* Result alert */}
          {result.total_leaks > 0 ? (
            <div className="alert-banner danger" style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>🚨</span>
              <span>
                <strong>{result.total_leaks} secret{result.total_leaks !== 1 ? 's' : ''} detected</strong> in this file.
                {result.critical > 0 && <> Including <strong>{result.critical} critical</strong> finding{result.critical !== 1 ? 's' : ''}.</>}
                {' '}Rotate exposed credentials immediately.
              </span>
            </div>
          ) : (
            <div className="alert-banner success" style={{ marginBottom: 20 }}>
              <span>✓</span>
              <strong>No secrets detected</strong> — this file appears clean.
            </div>
          )}

          {result.total_leaks > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Summary mini-card */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 18 }}>Severity Breakdown</div>
                <SeverityBar label="Critical" count={result.critical} total={result.total_leaks} color="var(--critical)" />
                <SeverityBar label="High"     count={result.high}     total={result.total_leaks} color="var(--high)" />
                <SeverityBar label="Medium"   count={result.medium}   total={result.total_leaks} color="var(--medium)" />
                <SeverityBar label="Low"      count={result.low}      total={result.total_leaks} color="var(--low)" />
              </div>

              {/* Stat numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total', value: result.total_leaks, color: 'var(--accent-cyan)' },
                  { label: 'Critical', value: result.critical, color: 'var(--critical)' },
                  { label: 'High', value: result.high, color: 'var(--high)' },
                  { label: 'Medium', value: result.medium, color: 'var(--medium)' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 32, fontWeight: 900, color: s.color, letterSpacing: -1 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leak table */}
          {result.total_leaks > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Detected Secrets</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click a row to expand</span>
              </div>

              {/* Filter bar */}
              <div className="filter-bar">
                {['all', 'critical', 'high', 'medium', 'low'].map(f => (
                  <button
                    key={f}
                    className={`filter-btn ${f} ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                    id={`file-filter-${f}`}
                  >
                    {f === 'all'
                      ? `All (${result.total_leaks})`
                      : `${f} (${result[f]})`}
                  </button>
                ))}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Severity', 'Secret Type', 'Location', ''].map((h, i) => (
                        <th key={i} style={{
                          padding: '10px 14px', textAlign: 'left',
                          color: 'var(--text-muted)', fontWeight: 600,
                          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px',
                        }}>{h}</th>
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

              {filteredLeaks.length === 0 && (
                <div className="empty-state" style={{ padding: '30px 0' }}>
                  <div className="empty-title">No {filter} severity findings</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info cards at bottom (only when no result) */}
      {!result && !scanning && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
            What we detect
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: '🔑', label: 'API Keys', desc: 'Generic, Google, Stripe, SendGrid, Twilio' },
              { icon: '☁️', label: 'AWS Credentials', desc: 'Access Key ID, Secret Access Key' },
              { icon: '🔵', label: 'GCP Keys', desc: 'Service account JSON, GCP API keys' },
              { icon: '🐱', label: 'GitHub Tokens', desc: 'PATs (ghp_), OAuth (gho_), deploy keys' },
              { icon: '🗄️', label: 'Database URLs', desc: 'MySQL, PostgreSQL, MongoDB with creds' },
              { icon: '🔒', label: 'Private Keys', desc: 'RSA, EC, PEM key material' },
              { icon: '🔐', label: 'Passwords', desc: 'Hardcoded password strings' },
              { icon: '🪙', label: 'JWT Tokens', desc: 'Hardcoded JSON Web Tokens' },
            ].map(item => (
              <div key={item.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
