# clickme.exe

**Reverse-Engineering Human Manipulation**  
AI-powered social engineering forensics platform.

---

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set your API key
```bash
cp .env.example .env
# Edit .env and add your DeepSeek API key:
# DEEPSEEK_API_KEY=sk-...
```

Or set it as an environment variable directly:
```bash
export DEEPSEEK_API_KEY=sk-...
```

### 3. Run
```bash
python app.py
```

Open http://localhost:5000 in your browser.

---

## File structure
```
clickme-exe/
├── app.py                   # Flask app + routes
├── requirements.txt
├── .env.example
├── templates/
│   ├── landing.html         # Landing page
│   └── app.html             # Workspace
├── static/
│   ├── css/style.css
│   └── js/app.js
├── services/
│   └── ai_service.py        # DeepSeek API integration
└── utils/
    └── session_manager.py   # In-memory session state
```

## Features
- Single message forensic analysis
- Batch CSV upload (up to 20 messages)
- Dashboard with Chart.js visualizations
- PDF report generation (client-side, jsPDF)
- Example library with 7 pre-loaded attacks
- Dark / light theme toggle
- Zero data persistence — everything is session-only

## Notes
- All data is ephemeral. Nothing is written to disk or a database.
- Sessions expire after 1 hour of inactivity.
- Temp files are cleaned every 30 minutes automatically.
- The AI model used is `deepseek-chat` from DeepSeek.
