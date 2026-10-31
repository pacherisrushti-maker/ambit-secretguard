import React, { useState, useEffect, useCallback } from 'react';
import { getModifications, getRepositories, fetchCommits } from '../services/api';

const MOD_TYPE_CONFIG = {
  added:    { cls: 'badge-success',  icon: '✅', label: 'Added'    },
  modified: { cls: 'badge-warning',  icon: '✏️',  label: 'Modified' },
  removed:  { cls: 'badge-critical', icon: '🗑',  label: 'Removed'  },
};

function ModBadge({ type }) {
  const cfg = MOD_TYPE_CONFIG[type] || MOD_TYPE_CONFIG.modified;
  return <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>;
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

/* Group flat modification rows into commit groups */
function groupByCommit(mods) {
  const map = new Map();
  for (const m of mods) {
    const key = m.commit_sha || `no-commit-${m.id}`;
    if (!map.has(key)) {
      map.set(key, {
        commit_sha: m.commit_sha,
        author_name: m.author_name,
        author_email: m.author_email,
        commit_message: m.commit_message,
        committed_at: m.committed_at || m.detected_at,
        repo_full_name: m.repo_full_name,
        repo_name: m.repo_name,
        account_username: m.account_username,
        files: [],
      });
    }
    map.get(key).files.push({
      id: m.id,
      file_path: m.file_path,
      modification_type: m.modification_type,
      detected_at: m.detected_at,
    });
  }
  return Array.from(map.values());
}

function CommitCard({ commit }) {
  const [expanded, setExpanded] = useState(false);
  const sha7 = commit.commit_sha ? commit.commit_sha.slice(0, 7) : '—';
  const fileCount = commit.files.length;

  const typeCounts = commit.files.reduce((acc, f) => {
    acc[f.modification_type] = (acc[f.modification_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      {/* Commit header */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '14px 18px', cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* SHA badge + timeline dot */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--accent-cyan)', border: '2px solid var(--border-bright)',
          }} />
          <code style={{
            fontSize: 11, color: 'var(--accent-cyan)',
            fontFamily: 'JetBrains Mono', background: 'rgba(6,182,212,.12)',
            padding: '2px 6px', borderRadius: 4,
          }}>{sha7}</code>
        </div>

        {/* Commit info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 4,
          }}>
            {commit.commit_message || 'No commit message'}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>👤 {commit.author_name || 'Unknown'}</span>
            {commit.author_email && <span>✉️ {commit.author_email}</span>}
            <span>📦 {commit.repo_full_name || commit.repo_name}</span>
            <span title={formatDate(commit.committed_at)}>🕐 {timeAgo(commit.committed_at)}</span>
          </div>
        </div>

        {/* File count pills */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {Object.entries(typeCounts).map(([type, count]) => {
            const cfg = MOD_TYPE_CONFIG[type] || MOD_TYPE_CONFIG.modified;
            return (
              <span key={type} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                background: 'rgba(255,255,255,.05)', color: 'var(--text-secondary)',
              }}>
                {cfg.icon} {count}
              </span>
            );
          })}
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s', lineHeight: 1,
          }}>▼</span>
        </div>
      </div>

      {/* Expanded file list */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,.2)' }}>
          {commit.files.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 18px 8px 42px',
              borderBottom: '1px solid rgba(255,255,255,.04)',
            }}>
              <ModBadge type={f.modification_type} />
              <code style={{
                fontSize: 12, color: 'var(--text-secondary)',
                fontFamily: 'JetBrains Mono', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{f.file_path}</code>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {timeAgo(f.detected_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModificationsPage() {
  const [mods, setMods]         = useState([]);
  const [repos, setRepos]       = useState([]);
  const [repoId, setRepoId]     = useState('');
  const [modType, setModType]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (repoId)  params.repo_id = repoId;
      const [data, repoData] = await Promise.all([
        getModifications(params),
        getRepositories(),
      ]);
      let filtered = data;
      if (modType) filtered = filtered.filter((m) => m.modification_type === modType);
      setMods(filtered);
      setRepos(repoData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repoId, modType]);

  useEffect(() => { load(); }, [load]);

  const handleFetchCommits = async () => {
    const targetId = repoId || (repos[0]?.id);
    if (!targetId) { setError('No repository connected yet.'); return; }

    setFetching(true);
    setError('');
    setSuccess('');
    try {
      const r = await fetchCommits(targetId);
      setSuccess(r.message);
      setTimeout(load, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const groups = groupByCommit(mods);
  const totalFiles = mods.length;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🔄 Repository Modification Detection</h1>
          <p className="page-subtitle">Track every change detected across your monitored repositories</p>
        </div>
      </div>

      <div className="page-body">
        {error   && <div className="alert-banner danger"  style={{ marginBottom: 14 }}><span>❌</span><span>{error}</span></div>}
        {success && <div className="alert-banner success" style={{ marginBottom: 14 }}><span>✅</span><span>{success}</span></div>}

        {/* Filters + actions toolbar */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
        }}>
          {/* Repo filter */}
          <select
            id="mod-repo-filter"
            className="input"
            style={{ minWidth: 200, flex: 1 }}
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
          >
            <option value="">All Repositories</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.repo_full_name}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            id="mod-type-filter"
            className="input"
            style={{ minWidth: 150 }}
            value={modType}
            onChange={(e) => setModType(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="added">Added</option>
            <option value="modified">Modified</option>
            <option value="removed">Removed</option>
          </select>

          {/* Actions */}
          <button
            id="fetch-commits-btn"
            className="btn btn-primary btn-sm"
            onClick={handleFetchCommits}
            disabled={fetching || repos.length === 0}
          >
            {fetching
              ? <><div className="spinner spinner-sm" /> Fetching…</>
              : '📥 Fetch Commits'}
          </button>

          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            🔄 Refresh
          </button>

          {/* Summary count */}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {groups.length} commit{groups.length !== 1 ? 's' : ''} · {totalFiles} file change{totalFiles !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Stats row */}
        {!loading && mods.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Files Added',    count: mods.filter(m => m.modification_type === 'added').length,    icon: '✅', cls: '--success' },
              { label: 'Files Modified', count: mods.filter(m => m.modification_type === 'modified').length, icon: '✏️',  cls: '--warning' },
              { label: 'Files Removed',  count: mods.filter(m => m.modification_type === 'removed').length,  icon: '🗑',  cls: '--critical' },
            ].map((s) => (
              <div key={s.label} className="stat-card" style={{ textAlign: 'center', padding: '16px 12px' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'JetBrains Mono', color: `var(${s.cls})` }}>
                  {s.count}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading modifications…</span></div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No Modifications Detected</div>
            <div className="empty-desc" style={{ maxWidth: 400 }}>
              Click <strong>📥 Fetch Commits</strong> to pull recent commit history from your connected repository,
              or go to <strong>Repositories → Scan Now</strong> to run a full scan.
            </div>
            {repos.length > 0 && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={handleFetchCommits}
                disabled={fetching}
              >
                {fetching ? 'Fetching…' : '📥 Fetch Commits Now'}
              </button>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical timeline line */}
            <div style={{
              position: 'absolute', left: 22, top: 0, bottom: 0,
              width: 2, background: 'linear-gradient(to bottom, var(--accent-cyan), transparent)',
              borderRadius: 1, zIndex: 0,
            }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 1 }}>
              {groups.map((commit, i) => (
                <CommitCard key={commit.commit_sha || i} commit={commit} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
