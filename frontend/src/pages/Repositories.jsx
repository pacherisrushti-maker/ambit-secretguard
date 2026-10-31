import React, { useState, useEffect } from 'react';
import {
  getRepositories, getAccounts, connectRepository, disconnectRepository,
  scanRepository, setupWebhook, removeWebhook, pushTestModification,
} from '../services/api';

function SecurityStatusBadge({ status }) {
  const map = {
    secure:        { cls: 'badge-success',  label: '✅ SECURE' },
    possible_leak: { cls: 'badge-critical', label: '🚨 LEAK DETECTED' },
    not_scanned:   { cls: 'badge-muted',    label: '⏸ NOT SCANNED' },
  };
  const s = map[status] || map.not_scanned;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function RepoCard({ repo, idx, onScan, onDisconnect, onWebhook, onPushTest, scanning }) {
  const isTest = repo.is_test_repo === 1;
  return (
    <div className={`repo-card ${isTest ? 'test-repo' : ''}`}>
      <div className="repo-card-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {repo.repo_name}
            </span>
            {isTest && <span className="badge badge-purple">🧪 TEST REPO</span>}
            {repo.private
              ? <span className="badge badge-muted">🔒 Private</span>
              : <span className="badge badge-muted">🌐 Public</span>}
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Repo {idx + 1}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            @{repo.account_username} / {repo.owner}/{repo.repo_name}
          </div>
        </div>
        <SecurityStatusBadge status={repo.security_status} />
      </div>

      <div className="repo-card-body">
        {repo.description && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{repo.description}</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Commits',       value: repo.commit_count       ?? 0, icon: '📝' },
            { label: 'Modifications', value: repo.modification_count ?? 0, icon: '🔄' },
            { label: 'Active Alerts', value: repo.alert_count        ?? 0, icon: '🚨', danger: (repo.alert_count ?? 0) > 0 },
          ].map((item) => (
            <div key={item.label} style={{
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${item.danger ? 'var(--critical-border)' : 'var(--border)'}`,
              borderRadius: 8, padding: '10px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, marginBottom: 3 }}>{item.icon}</div>
              <div style={{
                fontSize: 20, fontWeight: 800, fontFamily: 'JetBrains Mono',
                color: item.danger ? 'var(--critical)' : 'var(--text-primary)',
              }}>{item.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>Branch: <code className="mono">{repo.default_branch || 'main'}</code></span>
          {repo.last_scanned_at
            ? <span>Last scanned: {new Date(repo.last_scanned_at).toLocaleString()}</span>
            : <span style={{ color: 'var(--warning)' }}>Never scanned</span>}
          {repo.webhook_id && <span style={{ color: 'var(--success)' }}>🔔 Webhook active</span>}
        </div>
      </div>

      <div className="repo-card-footer">
        <button className="btn btn-primary btn-sm" onClick={() => onScan(repo.id)} disabled={scanning === repo.id}>
          {scanning === repo.id ? <><div className="spinner spinner-sm" /> Scanning…</> : '🔍 Scan Now'}
        </button>

        {!repo.webhook_id
          ? <button className="btn btn-secondary btn-sm" onClick={() => onWebhook(repo.id, true)}>🔔 Setup Webhook</button>
          : <button className="btn btn-secondary btn-sm" onClick={() => onWebhook(repo.id, false)}>🔕 Remove Webhook</button>}

        {isTest && (
          <button className="btn btn-purple btn-sm" onClick={() => onPushTest(repo.id)}>
            🧪 Push Test Mod
          </button>
        )}

        {repo.html_url && (
          <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            ↗ GitHub
          </a>
        )}

        <button className="btn btn-danger btn-sm" onClick={() => onDisconnect(repo.id, repo.repo_full_name)}>
          🗑 Remove
        </button>
      </div>
    </div>
  );
}

/* ─── Add Repository Form ─── */
function AddRepoForm({ accounts, onSuccess, onCancel }) {
  const [accountId, setAccountId]       = useState('');
  const [repoName, setRepoName]         = useState('');   // just the repo name part
  const [isTestRepo, setIsTestRepo]     = useState(false);
  const [adding, setAdding]             = useState(false);
  const [error, setError]               = useState('');

  // Derive the selected account's username for the owner prefix
  const selectedAccount = accounts.find(a => String(a.id) === String(accountId));
  const ownerPrefix     = selectedAccount ? selectedAccount.username : '';

  // The full name sent to the API — always "owner/repo"
  const fullName = ownerPrefix && repoName.trim()
    ? `${ownerPrefix}/${repoName.trim()}`
    : repoName.trim();

  // If the user pastes "owner/repo" directly, accept it
  const handleRepoChange = (val) => {
    // Strip any prefix that matches the current owner to avoid "owner/owner/repo"
    if (ownerPrefix && val.startsWith(`${ownerPrefix}/`)) {
      setRepoName(val.slice(ownerPrefix.length + 1));
    } else {
      setRepoName(val);
    }
  };

  // Final full name to submit
  const getSubmitName = () => {
    const trimmed = repoName.trim();
    if (!trimmed) return '';
    // If user already typed "owner/repo" format
    if (trimmed.includes('/')) return trimmed;
    // Otherwise prepend owner
    return ownerPrefix ? `${ownerPrefix}/${trimmed}` : trimmed;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!accountId)       { setError('Please select a GitHub account.'); return; }
    const submitName = getSubmitName();
    if (!submitName)      { setError('Please enter a repository name.'); return; }
    if (!submitName.includes('/')) {
      setError(`Repository must be in "owner/repo" format. Example: ${ownerPrefix || 'username'}/my-repo`);
      return;
    }

    setAdding(true);
    try {
      const r = await connectRepository({
        account_id: accountId,
        repo_full_name: submitName,
        is_test_repo: isTestRepo ? 1 : 0,
      });
      onSuccess(r.message || `Repository "${submitName}" connected!`);
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      {/* Title */}
      <div className="card-title" style={{ marginBottom: 4 }}>➕ Connect Repository</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Enter the repository name — the owner is taken from the selected account automatically.
      </div>

      {error && (
        <div className="alert-banner danger" style={{ marginBottom: 14 }}>
          <span>❌</span>
          <div>
            <strong>{error}</strong>
            {ownerPrefix && (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                Example: <code className="mono">{ownerPrefix}/repository-name</code>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Account selector */}
        <div className="input-group">
          <label className="input-label">GitHub Account</label>
          <select
            id="repo-account-select"
            className="input"
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setError(''); }}
          >
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
        </div>

        {/* Repository name — split visual (owner prefix + repo name) */}
        <div className="input-group">
          <label className="input-label">Repository Name</label>

          {/* Visual split input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {/* Owner prefix pill */}
            <div style={{
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid var(--border-bright)',
              borderRight: 'none',
              borderRadius: '10px 0 0 10px',
              padding: '10px 14px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: ownerPrefix ? 'var(--accent-cyan)' : 'var(--text-muted)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              minWidth: ownerPrefix ? undefined : 100,
            }}>
              {ownerPrefix || (accountId ? '…' : 'select account')}
              <span style={{ color: 'var(--text-muted)' }}>/</span>
            </div>

            {/* Repo name input */}
            <input
              id="repo-name-input"
              className="input input-mono"
              style={{
                borderRadius: '0 10px 10px 0',
                borderLeft: '1px solid var(--border-bright)',
                flex: 1,
              }}
              placeholder="repository-name"
              value={repoName}
              onChange={(e) => { handleRepoChange(e.target.value); setError(''); }}
              disabled={!accountId}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Live preview */}
          {repoName.trim() && ownerPrefix && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Will connect:&nbsp;
              <a
                href={`https://github.com/${getSubmitName()}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono', fontSize: 11 }}
              >
                github.com/{getSubmitName()} ↗
              </a>
            </div>
          )}

          {/* Format hint */}
          {!accountId && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              ℹ️ Select an account first — the owner prefix is auto-filled.
            </div>
          )}
        </div>

        {/* Test repo checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input
            type="checkbox"
            id="is-test-repo"
            checked={isTestRepo}
            onChange={(e) => setIsTestRepo(e.target.checked)}
            style={{ accentColor: 'var(--accent-purple)', cursor: 'pointer', width: 14, height: 14 }}
          />
          <label htmlFor="is-test-repo" style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            🧪 Mark as <strong>Test Repository</strong> — used for the demo modification workflow
          </label>
        </div>

        {accounts.length === 0 && (
          <div className="alert-banner warning" style={{ marginBottom: 12 }}>
            ⚠️ No accounts connected. Go to <strong>Accounts</strong> page first.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            id="connect-repo-btn"
            className="btn btn-primary"
            type="submit"
            disabled={adding || !accountId || !repoName.trim()}
          >
            {adding ? <><div className="spinner spinner-sm" /> Connecting…</> : '🔗 Connect Repository'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            ✕ Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Main Page ─── */
export default function RepositoriesPage() {
  const [repos, setRepos]         = useState([]);
  const [accounts, setAccounts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(null);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const load = async () => {
    try {
      const [r, a] = await Promise.all([getRepositories(), getAccounts()]);
      setRepos(r);
      setAccounts(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else         { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 6000);
  };

  const handleScan = async (repo_id) => {
    setScanning(repo_id);
    try {
      const r = await scanRepository(repo_id);
      notify(r.message || 'Scan started in background.');
      setTimeout(load, 3000);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setScanning(null);
    }
  };

  const handleDisconnect = async (id, name) => {
    if (!window.confirm(`Remove repository ${name}?`)) return;
    try {
      await disconnectRepository(id);
      notify(`${name} removed.`);
      load();
    } catch (e) {
      notify(e.message, true);
    }
  };

  const handleWebhook = async (id, setup) => {
    try {
      if (setup) {
        await setupWebhook(id);
        notify('Webhook created on GitHub. Push events will now be detected automatically.');
      } else {
        await removeWebhook(id);
        notify('Webhook removed from GitHub.');
      }
      load();
    } catch (e) {
      notify(e.message, true);
    }
  };

  const handlePushTest = async (repo_id) => {
    if (!window.confirm(
      'WARNING: This will push a harmless demo file with a FAKE test credential to your test repository.\n\n' +
      'The file contains NO real secrets. This is for SecretGuard demonstration only.\n\n' +
      'Click OK to confirm.'
    )) return;
    try {
      const r = await pushTestModification(repo_id);
      notify(`${r.message} — File: ${r.filename}`);
      setTimeout(load, 3000);
    } catch (e) {
      notify(e.message, true);
    }
  };

  const handleFormSuccess = (msg) => {
    notify(msg);
    setShowAddForm(false);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">📦 Repository Monitoring</h1>
            <p className="page-subtitle">Monitor up to three GitHub repositories for modifications and secret leaks</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
            {repos.length < 3 && (
              <button
                id="add-repo-btn"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? '✕ Cancel' : '➕ Add Repository'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {error   && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}
        {success && <div className="alert-banner success"><span>✅</span><span>{success}</span></div>}

        {/* How-to hint when no repos yet */}
        {!showAddForm && repos.length === 0 && accounts.length > 0 && !loading && (
          <div className="alert-banner info" style={{ marginBottom: 16 }}>
            <span>💡</span>
            <div>
              <strong>Tip:</strong> Click <strong>➕ Add Repository</strong> and enter just the <em>repository name</em>.
              The owner is filled automatically from your connected account.
              <br />
              Example: if your account is <code className="mono">@swastishri4-lgtm</code>, just type{' '}
              <code className="mono">my-repo-name</code> (not the full username/repo).
            </div>
          </div>
        )}

        {/* Add Repository Form */}
        {showAddForm && (
          <AddRepoForm
            accounts={accounts}
            onSuccess={handleFormSuccess}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Repository Cards */}
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading repositories…</span></div>
        ) : repos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-title">No Repositories Connected</div>
            <div className="empty-desc">
              {accounts.length === 0
                ? 'Connect a GitHub account on the Accounts page first.'
                : 'Click "➕ Add Repository" above to start monitoring.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {repos.map((repo, idx) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                idx={idx}
                onScan={handleScan}
                onDisconnect={handleDisconnect}
                onWebhook={handleWebhook}
                onPushTest={handlePushTest}
                scanning={scanning}
              />
            ))}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 3 - repos.length) }).map((_, i) => (
              <div key={`slot-${i}`} className="card" style={{
                border: '1px dashed var(--border)', textAlign: 'center',
                padding: '32px', opacity: 0.5,
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Repository {repos.length + i + 1} — Slot Available
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Click "➕ Add Repository" to connect
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        {repos.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>ℹ️ Repository Roles</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
              <div><span className="badge badge-success">✅ SECURE</span> — No leaks detected</div>
              <div><span className="badge badge-critical">🚨 LEAK DETECTED</span> — Possible credential exposure found</div>
              <div><span className="badge badge-muted">⏸ NOT SCANNED</span> — Run a scan first</div>
              <div><span className="badge badge-purple">🧪 TEST REPO</span> — Used for demonstration modification</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
