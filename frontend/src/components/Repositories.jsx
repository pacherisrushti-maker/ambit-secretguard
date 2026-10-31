import React, { useState, useEffect } from 'react';
import { getRepos, scanRepo, scanAllRepos } from '../api';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function LeakItem({ leak }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`leak-item ${leak.severity}`}>
      <div className="leak-header" onClick={() => setExpanded(e => !e)}>
        <span className={`badge badge-${leak.severity}`}>{leak.severity}</span>
        <span className="leak-type">{leak.secret_type}</span>
        <span className="leak-location">{leak.file_path}:{leak.line_number}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 18, marginLeft: 4 }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>
      {expanded && (
        <div className="leak-body">
          <div className="leak-description">{leak.description}</div>
          <div className="leak-code">{leak.line_content}</div>
          <div className="leak-meta">
            <span>📁 {leak.file_path}</span>
            <span>🔢 Line {leak.line_number}</span>
            <span>🔑 Masked: <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--critical)' }}>{leak.matched_value}</code></span>
          </div>
        </div>
      )}
    </div>
  );
}

function RepoCard({ repo, onScan, scanResult, scanning }) {
  const isVulnerable = scanResult && scanResult.total_leaks > 0;
  const isClean = scanResult && scanResult.total_leaks === 0;
  const cardClass = isVulnerable ? 'vulnerable' : isClean ? 'clean' : '';
  const iconClass = isVulnerable ? 'vulnerable' : 'clean';

  return (
    <div className={`repo-card ${cardClass}`} id={`repo-card-${repo.name}`}>
      <div className="repo-header">
        <div className={`repo-icon ${iconClass}`}>
          {isVulnerable ? '⚠' : isClean ? '✓' : '📁'}
        </div>
        <div style={{ flex: 1 }}>
          <div className="repo-name">{repo.name}</div>
          <div className="repo-path">{repo.path.split('\\').slice(-2).join('/')}</div>
        </div>
      </div>

      {scanResult && (
        <div className="repo-stats">
          {scanResult.critical > 0 && (
            <span className="badge badge-critical">{scanResult.critical} critical</span>
          )}
          {scanResult.high > 0 && (
            <span className="badge badge-high">{scanResult.high} high</span>
          )}
          {scanResult.medium > 0 && (
            <span className="badge badge-medium">{scanResult.medium} medium</span>
          )}
          {scanResult.low > 0 && (
            <span className="badge badge-low">{scanResult.low} low</span>
          )}
          {scanResult.total_leaks === 0 && (
            <span className="badge badge-clean">Clean</span>
          )}
        </div>
      )}

      {scanResult?.git_info && Object.keys(scanResult.git_info).length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>🕐 {scanResult.git_info.date} · {scanResult.git_info.author}</span>
        </div>
      )}

      <div className="repo-footer">
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {scanResult ? `${scanResult.total_leaks} secret${scanResult.total_leaks !== 1 ? 's' : ''} found` : 'Not scanned'}
        </div>
        <button
          className={`btn btn-sm ${isVulnerable ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => onScan(repo.name)}
          disabled={scanning === repo.name}
          id={`scan-btn-${repo.name}`}
        >
          {scanning === repo.name ? (
            <><div className="spinner" style={{ width: 12, height: 12 }} /> Scanning</>
          ) : 'Scan'}
        </button>
      </div>
    </div>
  );
}

export default function Repositories() {
  const [repos, setRepos] = useState([]);
  const [scanResults, setScanResults] = useState({});
  const [scanning, setScanning] = useState(null);
  const [scanningAll, setScanningAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchRepos();
  }, []);

  async function fetchRepos() {
    try {
      setLoading(true);
      const res = await getRepos();
      setRepos(res.data);
    } catch {
      setError('Failed to load repositories. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(repoName) {
    setScanning(repoName);
    setError('');
    try {
      const res = await scanRepo(repoName);
      setScanResults(prev => ({ ...prev, [repoName]: res.data }));
      setSelectedRepo(repoName);
    } catch (e) {
      setError(`Failed to scan ${repoName}.`);
    } finally {
      setScanning(null);
    }
  }

  async function handleScanAll() {
    setScanningAll(true);
    setError('');
    try {
      const res = await scanAllRepos();
      const map = {};
      res.data.forEach(r => { map[r.repo_name] = r; });
      setScanResults(map);
    } catch {
      setError('Failed to scan all repositories.');
    } finally {
      setScanningAll(false);
    }
  }

  const selectedResult = selectedRepo ? scanResults[selectedRepo] : null;

  const filteredLeaks = selectedResult?.leaks
    ? selectedResult.leaks
        .filter(lk => filter === 'all' || lk.severity === filter)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Repositories</h1>
          <p className="page-subtitle">Scan individual or all repositories for exposed secrets</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleScanAll}
          disabled={scanningAll}
          id="scan-all-btn"
        >
          {scanningAll
            ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Scanning All...</>
            : <><span>⚡</span> Scan All Repos</>}
        </button>
      </div>

      {error && <div className="alert-banner danger"><span>⚠</span>{error}</div>}

      {loading ? (
        <div className="repos-grid">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: 16 }} />
          ))}
        </div>
      ) : (
        <div className="repos-grid">
          {repos.map(repo => (
            <div key={repo.name} onClick={() => setSelectedRepo(repo.name)}>
              <RepoCard
                repo={repo}
                onScan={handleScan}
                scanResult={scanResults[repo.name]}
                scanning={scanning}
              />
            </div>
          ))}
        </div>
      )}

      {/* Leak detail panel */}
      {selectedResult && (
        <div className="card fade-in">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {selectedRepo}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {selectedResult.total_leaks} secrets found
                {selectedResult.git_info?.hash && ` · commit ${selectedResult.git_info.hash}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedResult.total_leaks > 0 ? (
                <span className="badge badge-critical">{selectedResult.total_leaks} leaks</span>
              ) : (
                <span className="badge badge-clean">Clean</span>
              )}
            </div>
          </div>

          {selectedResult.total_leaks === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🛡️</span>
              <div className="empty-title">No secrets detected</div>
              <div className="empty-sub">This repository follows secure coding practices.</div>
            </div>
          ) : (
            <>
              {/* Severity summary */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {selectedResult.critical > 0 && <span className="badge badge-critical">💀 {selectedResult.critical} Critical</span>}
                {selectedResult.high > 0 && <span className="badge badge-high">⚠ {selectedResult.high} High</span>}
                {selectedResult.medium > 0 && <span className="badge badge-medium">🟡 {selectedResult.medium} Medium</span>}
                {selectedResult.low > 0 && <span className="badge badge-low">ℹ {selectedResult.low} Low</span>}
              </div>

              {/* Filters */}
              <div className="filter-bar">
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Filter:</span>
                {['all', 'critical', 'high', 'medium', 'low'].map(f => (
                  <button
                    key={f}
                    className={`filter-btn ${f} ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                    id={`filter-${f}`}
                  >
                    {f === 'all' ? `All (${selectedResult.total_leaks})` : `${f} (${selectedResult[f]})`}
                  </button>
                ))}
              </div>

              <div className="leaks-list">
                {filteredLeaks.map((lk, i) => (
                  <LeakItem key={i} leak={lk} />
                ))}
              </div>

              {filteredLeaks.length === 0 && (
                <div className="empty-state" style={{ padding: '30px 0' }}>
                  <div className="empty-title">No {filter} severity leaks</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!selectedResult && !loading && repos.length > 0 && (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <div className="empty-title">Select a repository to view scan results</div>
          <div className="empty-sub">Click "Scan" on any repo above, or use "Scan All Repos"</div>
        </div>
      )}
    </div>
  );
}
