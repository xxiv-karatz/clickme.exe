# clickme.exe

> Reverse-engineering human manipulation — AI-powered forensic analysis of social engineering attacks.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-clickme--exe.onrender.com-blue?style=flat-square)](https://clickme-exe.onrender.com/)
![Python](https://img.shields.io/badge/Python-3.8+-blue?style=flat-square&logo=python)
![Flask](https://img.shields.io/badge/Flask-backend-lightgrey?style=flat-square&logo=flask)
![License](https://img.shields.io/badge/License-Educational%20%2F%20Defensive%20Use-green?style=flat-square)

---

## What is this?

**clickme.exe** is a defensive security tool that deconstructs phishing messages to expose the psychological mechanics behind them. Paste any suspicious email, SMS, or DM and receive a structured forensic report in seconds.

It is built for security professionals, IT/SOC teams, and security awareness educators — not for generating attacks.

---

## Features

- **Single message analysis** — paste any suspicious message for instant forensic breakdown
- **Batch CSV upload** — analyze up to 8 messages at once (requires a `message` column, max 3 MB)
- **Session dashboard** — real-time analytics and Chart.js visualizations
- **Example library** — 7 pre-loaded real-world phishing samples
- **PDF export** — generate professional forensic reports client-side via jsPDF
- **Dark / light theme** — toggle between modes
- **Zero data persistence** — all session data is ephemeral; nothing is written to disk or a database

### What's in a report?

| Output | Description |
|--------|-------------|
| Psychological trigger map | Urgency, fear, authority, scarcity, social proof, etc. |
| Exploitability score | 0–100 numeric severity rating |
| MITRE ATT&CK mapping | Relevant technique IDs |
| Technical indicators | URLs, domains, spoofed senders, attachments |
| Defense recommendations | Guidance for end-users and IT/SOC teams |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask (Python) |
| AI engine | DeepSeek API (`deepseek-chat`) |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Visualizations | Chart.js |
| PDF generation | jsPDF |
| Deployment | Render (free tier) |

---

## Local Setup

### Prerequisites

- Python 3.8+
- A [DeepSeek API key](https://platform.deepseek.com/)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/clickme-exe.git
cd clickme-exe
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Add your key to .env:
# DEEPSEEK_API_KEY=sk-...
```

Or export directly:

```bash
export DEEPSEEK_API_KEY=sk-your-api-key-here
```

### 3. Run

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000).

---

## Project Structure

```
clickme-exe/
├── app.py                    # Flask app and routes
├── requirements.txt
├── .env.example
├── gunicorn_config.py        # Production server config
├── templates/
│   ├── landing.html          # Marketing / landing page
│   └── app.html              # Main workspace
├── static/
│   ├── css/style.css
│   └── js/app.js
├── services/
│   ├── __init__.py
│   └── ai_service.py         # DeepSeek API integration
└── utils/
    ├── __init__.py
    └── session_manager.py    # In-memory session state
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Landing page |
| `/app` | GET | Workspace |
| `/api/session-init` | GET | Create new session |
| `/api/analyze` | POST | Analyze a single message |
| `/api/batch-analyze` | POST | Analyze a CSV batch |
| `/api/analytics` | GET | Retrieve session analytics |
| `/api/examples` | GET | Load example messages |

### Batch CSV format

The file must include a `message` column (header is case-sensitive):

```csv
message
"Urgent: Your account has been compromised. Click here to verify your identity immediately."
"Congratulations! You've won a free iPhone. Claim now by providing your shipping details."
"IT Department: Your password expires in 24 hours. Update at the link below."
```

**Limits:** max 8 messages per upload · max 3 MB file size · messages truncated to 1,500 characters

---

## Deployment (Render)

1. Push the repo to GitHub.
2. Create a new **Web Service** on [Render](https://render.com/) and connect the repository.
3. Set the build and start commands:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn -c gunicorn_config.py app:app`
4. Add the environment variable `DEEPSEEK_API_KEY`.
5. Deploy.

### Free-tier limits to be aware of

| Constraint | Detail |
|------------|--------|
| RAM | 512 MB |
| Request timeout | 90 seconds |
| Cold start | ~20–30 seconds after 15 min of inactivity |

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DEEPSEEK_API_KEY` | **Yes** | Your DeepSeek API key |
| `SECRET_KEY` | No | Flask secret key; falls back to a default if unset |

---

## Troubleshooting

**Batch upload fails**
- Confirm the CSV has a `message` column (exact casing).
- Keep the file under 3 MB and messages under 1,500 characters.
- Try uploading 5–6 messages instead of the full 8.

**`DEEPSEEK_API_KEY not set` error**
- Verify the key is present in your `.env` file or Render environment variables.

**Analysis times out**
- Single messages typically complete in 5–15 seconds.
- Batch requests are optimized for the 90-second free-tier limit, but complex messages may still time out — reduce the batch size if this occurs.

---

## Ethical Use

clickme.exe is a **defensive** tool. It analyzes messages you have received — it does not generate phishing content.

Intended users: security professionals · IT and SOC teams · security awareness educators · individuals investigating messages they've received.

**Do not use this tool to analyze messages you do not have permission to analyze.**

---

## Acknowledgements

- [DeepSeek API](https://platform.deepseek.com/) — AI engine
- [MITRE ATT&CK](https://attack.mitre.org/) — technique framework
- Inspired by social engineering defense research