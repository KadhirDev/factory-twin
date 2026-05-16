# 🏭 Factory Twin — AI Digital Twin for Smart Factory

A production-style AI-powered industrial monitoring platform that detects anomalies, predicts equipment failures, identifies root causes, and guides operator decisions in real time.

Built as a full-stack portfolio project demonstrating modern AI/ML integration, async backend architecture, and a sophisticated intelligence layer.

---

## 🎯 What This Does

Factory Twin ingests live sensor telemetry from industrial machines, runs it through an Isolation Forest ML model, and surfaces actionable insights through a multi-layer AI intelligence panel — all without human labelling.

**Operator experience goal:** understand what is happening, why, how urgent it is, and what to do — in under 5 seconds.

---

## 🏗️ Architecture
IoT Simulator ──► FastAPI Backend ──► PostgreSQL
│
Isolation Forest
(async, per-machine)
│
Anomaly Scores + Contributors
│
React Frontend Intelligence Layer
│
┌──────────────┼──────────────┐
Root Cause      Recommendations   Predictive ETAs
Analysis        (ranked + scored) (linear projection)
│                │                │
ML-backed         Cause→Action     Metric trends

Live fallback    linkage          per metric


---

## 🧠 AI Intelligence Layer

### Anomaly Detection (Backend)

- **Model:** Isolation Forest (scikit-learn) per machine
- **Cold start:** Z-score fallback until 50 samples collected
- **Training:** Automatic retraining every 30 samples
- **Persistence:** Pickle-serialised models at `/app/ml_models/<machine_id>.pkl`
- **Concurrency:** Per-machine `asyncio.Lock`, retraining in thread executor

### Frontend Intelligence (No Backend Changes Required)

| Component | What it does |
|---|---|
| **Predictive ETA** | Linear slope extrapolation to warn/critical threshold per metric |
| **Correlation Detection** | Detects simultaneous rising trends across metric pairs |
| **Anomaly Frequency** | Compares recent vs older half of window for trend direction |
| **Confidence Scoring** | 7-signal model: sample maturity, model type, variance, score trend, anomaly consistency, correlation agreement, oscillation penalty |
| **Risk Index** | Composite: anomaly score (40pts) + frequency (30pts) + ETA urgency (30pts) |
| **Risk Momentum** | 3 signals → Stabilizing / Stable / Worsening / Critical Escalation |
| **Root Cause Analysis** | ML-backed path (stored contributors) + live threshold fallback |
| **Recommendations** | 13 deterministic rules, scored by urgency × ETA × correlation × confidence |
| **Stale Telemetry Detection** | Client-side timestamp age tracking; degrades confidence after 15s, shows offline state after 60s |

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** — async REST API
- **PostgreSQL** — telemetry + anomaly storage
- **SQLAlchemy** (async) — ORM with idempotent migrations
- **scikit-learn** — Isolation Forest anomaly detection
- **JWT + RBAC** — auth with 4 roles (admin / engineer / operator / viewer)
- **Prometheus** — metrics endpoint

### Frontend
- **React 18** + **Vite**
- **TailwindCSS**
- **Recharts** — sparklines and trend charts
- **date-fns** — timestamp utilities
- **lucide-react** — icons

### Infrastructure
- **Docker Compose** — all services containerised
- **Nginx** — SPA serving + `/api/` proxy
- **Prometheus + Grafana** — optional observability stack

---

## 🚀 Quick Start

### Prerequisites

- Docker Desktop
- Docker Compose v2

### Start all services

```bash
docker compose -f docker-compose.factory.yml up -d
```

### Access

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000/docs |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9091 |

### Default credentials

| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Engineer | engineer | engineer123 |
| Operator | operator | operator123 |
| Viewer | viewer | viewer123 |

### Rebuild frontend only

```powershell
docker compose -f docker-compose.factory.yml build factory-frontend
docker compose -f docker-compose.factory.yml up -d factory-frontend
docker logs factory-frontend --tail 20
```

---

## 📁 Project Structure
factory-twin/
├── backend/
│   └── app/
│       ├── main.py                  # FastAPI app, lifespan, CORS
│       ├── config.py                # Settings
│       ├── database.py              # Async engine, pool, migrations
│       ├── models/                  # SQLAlchemy models
│       ├── schemas/                 # Pydantic v2 schemas
│       ├── routers/                 # machines, telemetry, alerts, auth
│       └── services/
│           ├── ml_anomaly_service.py    # Isolation Forest pipeline
│           ├── alert_service.py
│           ├── ditto_service.py
│           └── auth_service.py
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AIInsightPanel.jsx       # Main intelligence orchestrator
│       │   ├── RootCausePanel.jsx       # ML-backed + live fallback
│       │   ├── RecommendationCard.jsx   # Ranked action engine
│       │   ├── RiskMomentumBadge.jsx    # 5-level momentum display
│       │   └── ConfidenceBadge.jsx      # 7-signal confidence
│       ├── hooks/
│       │   ├── useStableInsights.js     # Insight list stability
│       │   └── useTelemetryAge.js       # Stale telemetry detection
│       ├── pages/
│       │   ├── Dashboard.jsx            # Fleet overview
│       │   └── MachineView.jsx          # Per-machine 4-tab view
│       └── context/
│           ├── AuthContext.jsx
│           └── TelemetryContext.jsx
├── docker-compose.factory.yml
└── README.md

---

## 🎬 Demo Walkthrough

### 1. Normal State
Open any machine's AI Insights tab. With stable telemetry:
- Confidence badge shows score and model type
- Risk Index shows "Normal" with green momentum
- Signal Insights shows "All metrics within normal ranges"
- Sensor Analysis section is suppressed (no noise)

### 2. Anomaly Escalation
The simulator injects anomalies automatically. Watch:
- `TimeToActBadge` appears: **Act Urgently** → **Immediate Action Required**
- `TopInsightBanner` surfaces the highest-priority condition
- `RootCausePanel` switches from amber (live threshold) to indigo (ML-backed) once anomaly records accumulate
- `RecommendationCard` ranks actions with cause → action linkage
- `RiskMomentumBadge` transitions: Stable → Worsening → Critical Escalation
- Critical Escalation: `RiskIndexBar` grows a red ring + "All signals active" pulse

### 3. Explainability
Click **Why?** on any Signal Insight row to expand contributing signals:
- Measurement value vs threshold
- Trend direction
- ETA projection
- Anomaly count + peak score

### 4. Root Cause
`RootCausePanel` shows:
- **Indigo (ML-backed):** top contributor metrics by σ deviation, ranked causal rules, corroborating correlation evidence, alternative causes
- **Amber (live fallback):** threshold breach analysis when no stored ML anomaly exists yet

### 5. Recovery
As the simulator stabilises:
- `RiskMomentumBadge` shows **Stabilizing** → **Recovering**
- `TimeToActBadge` fades: Urgent → Soon → hidden
- Sensor Analysis panels suppress when riskIndex drops below 10

### 6. Stale Telemetry
Stop the simulator. After 15 seconds, an amber **Telemetry Delayed** banner appears. After 60 seconds, it transitions to **Machine Offline** (gray), and live-escalation UI (TimeToActBadge, TopInsightBanner) is suppressed — operators see the last known state clearly labelled rather than potentially misleading live urgency.

---

## 🔑 Key Design Decisions

**Frontend-only intelligence:** All ETAs, correlations, frequency analysis, confidence scoring, and risk indexing run purely in the browser from existing API data. No new backend endpoints were required.

**Memo correctness:** Telemetry-derived memos depend on `[telemetry]` (full reference), not `[telemetry?.length]`. This ensures ETA projections and correlations update on every poll even when the reading count stabilises.

**Stable insight ordering:** `useStableInsights` prevents list reordering every 3s poll. Reorders only commit when a new critical/warning appears, a critical/warning disappears, count changes ≥2, or 8s has elapsed.

**Content-based keys:** `InsightRow` uses `key={ins.text.slice(0, 50)}` rather than array index, preventing React from transferring expanded "Why?" state between rows during list updates.

**Null safety:** All timestamp parsing is wrapped in try/catch. `FeatureContributors` uses a triple fallback: `c.label ?? c.metric ?? "Sensor"`. `AnomalyClusters` filters out invalid timestamps before sorting to prevent NaN-based sort instability.

---

## 🔐 Authentication

JWT-based with role-based UI gating:

- **Admin / Engineer:** full access including AI Insights tab
- **Operator:** Combined + Anomalies tabs
- **Viewer:** read-only dashboard

---

## 📊 API Endpoints (Key)
POST /api/telemetry/ingest          # IoT reading ingestion
GET  /api/telemetry/{id}/latest     # Latest reading per machine
GET  /api/telemetry/{id}/anomalies  # Anomaly records
GET  /api/telemetry/{id}/anomaly-stats # Stats + score trend + config
GET  /api/machines/                 # Fleet list
GET  /api/alerts/                   # Active alerts
POST /api/auth/login                # JWT token

---

## 🧪 Known Non-Blocking Items

These are deferred and do not affect functionality:

- Large JS bundle (~800KB) — code splitting not yet applied
- Vite CJS interop warning
- PostCSS module type warning

---

## 📄 License

MIT