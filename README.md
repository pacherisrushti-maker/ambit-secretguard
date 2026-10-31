# AMBIT SecretGuard
## GitHub Repository Monitoring and Secret Leak Detection System

> **AI-Powered** security monitoring for GitHub repositories — detects accidental credential exposures in real time.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+ (64-bit)
- Node.js 16+ (`C:\Users\Victus\nodejs\` or system PATH)
- Git

### 1 — Clone & Setup

```bash
# Already in your workspace at:
# C:\Users\Victus\Desktop\hackathon(ctrlchoas)\
```

### 2 — Configure Environment

```bash
# Copy the example file
copy .env.example backend\.env
```

Edit `backend\.env` and set:
```env
# One token per GitHub account (replace USERNAME with actual GitHub username in UPPERCASE)
GITHUB_TOKEN_USERNAME1=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_TOKEN_USERNAME2=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_TOKEN_USERNAME3=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhook secret (any random string)
GITHUB_WEBHOOK_SECRET=ambit-secretguard-webhook-secret

# For live webhook detection (use ngrok for local dev)
WEBHOOK_PUBLIC_URL=https://your-ngrok-url.ngrok.io
```

### 3 — Start Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
# → Running on http://localhost:5000
```

### 4 — Start Frontend

```powershell
# PowerShell (Windows)
$env:PATH = "C:\Users\Victus\nodejs;" + $env:PATH
cd frontend
npm start
# → Running on http://localhost:3000
```

Or double-click `start-backend.bat` and `start-frontend.bat`.

---

## 🏗️ Architecture

```
AMBIT-SECRETGUARD/
├── backend/
│   ├── app.py                  ← Flask REST API (main entry)
│   ├── database.py             ← SQLite setup (7 tables)
│   ├── github_service.py       ← GitHub REST API calls
│   ├── webhook_handler.py      ← HMAC-SHA256 webhook processor
│   ├── secret_scanner.py       ← 25+ pattern regex engine
│   ├── repository_scanner.py   ← Full repo scan via API
│   ├── remediation.py          ← Fix-time tracker
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx       ← Page 1: Live stats
│       │   ├── Accounts.jsx        ← Page 2: GitHub connections
│       │   ├── Repositories.jsx    ← Page 3: Repo monitoring
│       │   ├── Modifications.jsx   ← Page 4: Change detection
│       │   ├── SecretLeaks.jsx     ← Page 5: Leak findings
│       │   ├── ScanPerformance.jsx ← Page 6: Scan metrics
│       │   ├── Remediation.jsx     ← Page 7: Fix-time tracking
│       │   ├── Alerts.jsx          ← Page 8: Alert management
│       │   └── Reports.jsx         ← Page 9: Analytics
│       ├── services/api.js         ← Axios API service
│       ├── App.js                  ← Router + sidebar
│       └── index.css               ← Full design system
│
├── .env.example
├── start-backend.bat
├── start-frontend.bat
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/dashboard` | Summary statistics |
| GET | `/api/accounts` | List connected accounts |
| POST | `/api/accounts/connect` | Connect GitHub account via PAT |
| POST | `/api/accounts/:id/disconnect` | Disconnect account |
| GET | `/api/repositories` | List repositories |
| POST | `/api/repositories/connect` | Add repository |
| POST | `/api/repositories/scan` | Trigger manual scan |
| POST | `/api/repositories/:id/setup-webhook` | Register GitHub webhook |
| GET | `/api/alerts` | List alerts (filterable) |
| GET | `/api/alerts/:id` | Get alert detail |
| POST | `/api/alerts/:id/resolve` | Resolve alert |
| GET | `/api/modifications` | Repository change log |
| GET | `/api/scan-history` | Scan run history |
| GET | `/api/remediation-history` | Fix time history |
| GET | `/api/remediation-stats` | Aggregated stats |
| POST | `/api/demo/push-test-modification` | Push demo file (test repo only) |
| POST | `/webhook` | GitHub push event receiver |

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `connected_accounts` | GitHub accounts (token masked) |
| `repositories` | Monitored repos with status |
| `commits` | Received commit records |
| `repository_modifications` | Per-file change log |
| `security_alerts` | Detected credential findings |
| `scan_history` | Scan timing and stats |
| `remediation_history` | Resolution audit trail |

---

## 🔐 Secret Detection Patterns (25+)

- AWS Access Key ID / Secret
- GitHub PAT / OAuth / Actions tokens
- GCP API Key / Service Account
- Azure Storage Key / Connection String
- MySQL / PostgreSQL / MongoDB connection strings
- RSA / EC / PEM private keys
- Stripe, Slack, SendGrid, Twilio API keys
- JWT tokens
- Generic API key / password patterns
- `.env` file secrets
- Demo test patterns (for demonstration)

---

## 🧪 Demonstration Workflow

1. **Connect 3 GitHub accounts** via the Accounts page
2. **Add 3 repositories** on the Repositories page
3. **Mark one** as the Test Repository (checkbox)
4. **Click "Push Test Mod"** on the test repo card
5. Confirm the dialog (harmless FAKE credential only)
6. **GitHub sends webhook** → Flask verifies & processes
7. **Scanner detects** `TEST_API_KEY_DEMO*` pattern
8. **Alert created** with HIGH severity, 30-min estimate
9. **Dashboard updates** with live data
10. **Click Resolve** on the alert to record actual fix time

> ⚠️ The demo file contains a completely fake pattern (`TEST_API_KEY_DEMO1234567890ABCDEF`). It has no real access to any system.

---

## 🔔 Webhook Setup (for live push detection)

1. Install ngrok: https://ngrok.com
2. Run: `ngrok http 5000`
3. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`)
4. Set in `.env`: `WEBHOOK_PUBLIC_URL=https://abc123.ngrok.io`
5. Restart the Flask backend
6. Click **"Setup Webhook"** on each repository card
7. GitHub will now send push events directly to SecretGuard

---

## ⏱️ Remediation Time Estimates

| Severity | Default Estimate |
|----------|-----------------|
| Critical | 60 minutes |
| High | 30 minutes |
| Medium | 20 minutes |
| Low | 10 minutes |

Actual time is measured from alert creation to manual resolution.

---

## 🔒 Security Notes

- GitHub tokens are **never stored in full** — only the last 4 characters are saved
- Detected secret values are **always masked** before display (e.g. `ghp_****`)
- Webhook signatures are verified with **HMAC-SHA256**
- The demo modification uses a **completely fake** pattern with no real credentials
- All secrets are stored in environment variables, never hardcoded

---

## 🛠️ Troubleshooting

**Backend won't start:**
```bash
pip install flask flask-cors requests python-dotenv
python app.py
```

**Frontend not found:**
```powershell
$env:PATH = "C:\Users\Victus\nodejs;" + $env:PATH
cd frontend && npm install && npm start
```

**GitHub API rate limit:**  
Ensure your PAT is valid and not expired. Check at https://github.com/settings/tokens

**Webhook not receiving events:**  
Ensure ngrok is running and `WEBHOOK_PUBLIC_URL` is set correctly. Test with:  
`curl http://localhost:5000/health`
