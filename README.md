# 🏭 Factory Twin — AI Digital Twin for Smart Factory

A production-grade, real-time industrial AI platform that combines IoT telemetry, 
digital twin synchronisation, and machine learning to deliver predictive insights 
and decision support for smart factory operations.

## 🏗️ Architecture Overview
┌─────────────────────────────────────────────────────────────────────┐
│                         Factory Floor                                │
│   [Machines] → temperature, vibration, RPM, pressure, power, oil   │
└──────────────────────────┬──────────────────────────────────────────┘
│ HTTP POST /api/v1/telemetry/ingest
▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                                   │
│                                                                     │
│  IoT Simulator ──→ Ingest Pipeline ──→ PostgreSQL                  │
│                         │                                           │
│                         ├──→ ML Anomaly Scoring (Isolation Forest)  │
│                         │       └── Z-Score fallback (cold start)   │
│                         │                                           │
│                         ├──→ Threshold Alert Engine                 │
│                         │                                           │
│                         ├──→ Eclipse Ditto (Digital Twin Sync)      │
│                         │                                           │
│                         └──→ Kafka (optional telemetry streaming)   │
└─────────────────────────────────────────────────────────────────────┘
│
┌────────────┴────────────┐
│                         │
▼                         ▼
┌─────────────────────┐   ┌─────────────────────────────────────┐
│   Prometheus        │   │          React Frontend              │
│   + Grafana         │   │   (Vite + Tailwind + Nginx)          │
│   (metrics)         │   │                                      │
└─────────────────────┘   │  Dashboard → MachineView → Alerts   │
│       ↓              ↓              │
│  AI Insights Panel (client-side)   │
│  ┌────────────────────────────┐    │
│  │ Confidence Score            │    │
│  │ Risk Index + Momentum       │    │
│  │ Root Cause Analysis         │    │
│  │ Recommendation Engine       │    │
│  │ Predictive ETA              │    │
│  │ Correlation Detection       │    │
│  └────────────────────────────┘    │
└─────────────────────────────────────┘

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| IoT Simulation | Python async simulator (HTTP → FastAPI) |
| Backend API | FastAPI + SQLAlchemy async + asyncpg |
| Database | PostgreSQL 15 |
| ML Anomaly Detection | scikit-learn IsolationForest + StandardScaler |
| Digital Twin | Eclipse Ditto |
| Message Queue | Apache Kafka (optional) |
| Observability | Prometheus + Grafana |
| Frontend | React 18 + Vite + Tailwind CSS |
| Authentication | JWT (python-jose + bcrypt) + RBAC |
| Deployment | Docker Compose + Nginx |

## ✨ Features

### Real-Time IoT Pipeline
- **Telemetry ingestion** every 2 seconds per machine
- **Adaptive simulator** with realistic sensor drift and anomaly injection
- **DB-first design**: PostgreSQL writes complete before background tasks (Ditto, Kafka)
- **Backpressure-aware**: simulator backs off when backend is unavailable

### ML Anomaly Detection
- **IsolationForest** per machine, trained after 50 samples
- **StandardScaler** normalises temperature/vibration/RPM to equal scale
- **Automatic retraining** every 30 new samples
- **Model persistence**: saved to `/app/ml_models/`, survives container restarts
- **Z-score fallback** during cold start
- **Async-safe**: per-machine `asyncio.Lock` prevents race conditions during retraining

### AI Insights Panel (Client-Side Intelligence)
All intelligence runs in the browser using existing API data — no additional backend endpoints.

| Component | What it does |
|---|---|
| **Confidence Score** | 7-signal system (sample maturity, model readiness, variance stability, score trend, anomaly consistency, correlation-ETA agreement, oscillation penalty) |
| **Risk Index (0–100)** | Composite of anomaly score + frequency trend + ETA urgency |
| **Risk Momentum Badge** | 5 levels: Stable → Improving → Worsening → Rapidly Worsening → Critical Escalation |
| **Root Cause Analysis** | Scores all matching causal rules, ranks by trigger match + correlation + trend agreement. Shows primary + alternative causes |
| **Recommendation Engine** | 13 deterministic rules scored by urgency × ETA proximity × confidence. Shows "What if ignored?" per action |
| **Predictive ETA** | Linear regression per metric → estimated minutes to warning/critical threshold |
| **Correlation Detection** | Detects co-rising metric pairs with implication messages |
| **Anomaly Frequency** | Events/hour rate with trend direction |
| **Priority Insights** | 3-key sort (type → priority → confidence), low-confidence noise suppressed in stable state |

### Authentication + RBAC
| Role | Access |
|---|---|
| admin | Full access |
| engineer | AI Insights + anomalies + alerts |
| operator | Dashboard + telemetry + alerts |
| viewer | Dashboard only |

### Observability
- Prometheus metrics at `/metrics`
- Grafana dashboard auto-provisioned
- Key metrics: ingestion rate, anomaly score per machine, alerts by severity, latency p50/p95/p99

## 🛠️ Getting Started

### Prerequisites
- Docker Desktop (WSL2 backend on Windows)
- No other local dependencies required

### Clone and Start

```bash
git clone <repo-url>
cd factory-twin

# Start the factory-twin stack
# (Eclipse Ditto and Kafka run separately if needed)
docker compose -f docker-compose.factory.yml up -d --build

# Verify all containers healthy
docker ps --filter "name=factory"
```

Expected containers:
factory-backend      FastAPI + ML pipeline
factory-frontend     React app served by Nginx
factory-postgres     PostgreSQL 15
factory-simulator    IoT data generator
factory-prometheus   Metrics collection
factory-grafana      Dashboards
### Register Machines

```bash
# Get a JWT first
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Register machines
for i in 1 2 3; do
  curl -s -X POST http://localhost:8000/api/v1/machines/ \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"machine_id\": \"machine$i\", \"name\": \"CNC Unit #$i\", \
         \"location\": \"Hall A\", \"machine_type\": \"CNC\"}"
done
```

### Access Points

| Service | URL | Credentials |
|---|---|---|
| **Frontend** | http://localhost:5173 | admin / admin123 |
| **API Docs** | http://localhost:8000/docs | — |
| **Grafana** | http://localhost:3001 | admin / admin123 |
| **Prometheus** | http://localhost:9091 | — |

## 🎬 Demo Script

### 1. Normal State (~minutes 0–2)

Navigate to http://localhost:5173

**Dashboard:**
- Fleet health bar shows all machines Online (green)
- Machine cards display live sparklines
- Anomaly score pills absent (scores near 0)

**Machine View → AI Insights tab:**
- Confidence Badge: "Low" (warming up, < 50 samples)
- Risk Index: ~5–15 (normal range)
- Risk Momentum: "Stable"
- Recommendations: "No Immediate Action Required"

### 2. ML Warm-Up (~minutes 2–4)

After 50 samples per machine:
- Confidence Badge upgrades to "Moderate" or "High"
- `detector_type` field in `/anomaly-stats` switches to `"isolation_forest"`
- Anomaly scores begin varying continuously (0.1–0.8σ for normal operation)

### 3. Anomaly Injection (~every 60 ticks = 2 minutes)

The simulator injects temperature + vibration spikes on machine1.

**Dashboard:**
- machine1 card gets orange border
- Score pill appears (2.8σ+)
- FleetAnomalySummary highlights machine1

**Machine View — machine1 → AI Insights:**
- Risk Index jumps (40–80 range)
- Risk Momentum: "Worsening" or "Rapidly Worsening"
- Root Cause: "High confidence: Thermal stress is elevating vibration"
  - Supporting evidence: temperature deviation, vibration deviation
  - Alternative causes shown (collapsible)
- Recommendations: "Cooling System — Urgent Inspection" (score ~85)
  - "What if ignored?" expands to show consequence
- Anomaly Frequency: events/hr counter increases
- Correlation Panel: "Temperature & Vibration — Both Rising"

### 4. Sustained Anomaly

If anomalies continue across 3+ cycles:
- Risk Momentum escalates to "Critical Escalation" (all signals + urgent ETA)
- Confidence boosts due to anomaly consistency signal
- PriorityInsights suppresses noise, shows only critical/warning rows
- Anomaly history tab shows expandable z-score breakdown per event

## 📡 API Reference

### Auth
| Endpoint | Method | Description |
|---|---|---|
| `/auth/login` | POST | Authenticate → JWT |
| `/auth/me` | GET | Current user profile |

### Machines
| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/machines/` | GET/POST | List / register |
| `/api/v1/machines/{id}` | GET/PATCH/DELETE | Single machine |
| `/api/v1/machines/{id}/twin` | GET | Live Ditto twin state |

### Telemetry
| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/telemetry/ingest` | POST | Ingest reading |
| `/api/v1/telemetry/{id}` | GET | History (limit, from/to) |
| `/api/v1/telemetry/{id}/latest` | GET | Latest reading |
| `/api/v1/telemetry/{id}/anomalies` | GET | Anomalous readings only |
| `/api/v1/telemetry/{id}/anomaly-stats` | GET | ML model stats + trend |

### Alerts
| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/alerts/` | GET | List (severity, machine, unacked filter) |
| `/api/v1/alerts/{id}/acknowledge` | PATCH | Acknowledge alert |

### Health
| Endpoint | Description |
|---|---|
| `/health` | Liveness (always 200) |
| `/health/deep` | Readiness (checks Postgres + Ditto) |
| `/metrics` | Prometheus scrape endpoint |

## 📁 Project Structure

factory-twin/
├── backend/
│   ├── app/
│   │   ├── core/           # Logging, middleware, metrics, auth deps
│   │   ├── models/         # SQLAlchemy models (Machine, Telemetry, Alert, User)
│   │   ├── routers/        # FastAPI routers
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/
│   │       ├── ml_anomaly_service.py   # IsolationForest + z-score fallback
│   │       ├── anomaly_service.py      # Z-score detector (fallback)
│   │       ├── ditto_service.py        # Eclipse Ditto integration
│   │       ├── kafka_producer.py       # Kafka (optional)
│   │       └── auth_service.py         # JWT + bcrypt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AIInsightPanel.jsx      # Main AI intelligence panel
│   │   │   ├── RootCausePanel.jsx      # Ranked causal analysis
│   │   │   ├── RecommendationCard.jsx  # Scored action engine
│   │   │   ├── RiskMomentumBadge.jsx   # 5-level risk direction
│   │   │   ├── ConfidenceBadge.jsx     # System confidence display
│   │   │   ├── AnomalyStatusCard.jsx   # Compact machine anomaly summary
│   │   │   ├── FleetAnomalySummary.jsx # Dashboard fleet overview
│   │   │   └── charts/                 # Recharts wrappers
│   │   ├── context/
│   │   │   ├── AuthContext.jsx         # JWT auth + RBAC
│   │   │   └── TelemetryContext.jsx    # Shared polling cache
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── MachineView.jsx
│   │       └── Alerts.jsx
│   ├── nginx.conf                      # SPA routing + API proxy
│   └── Dockerfile
├── simulator/
│   └── mqtt_simulator.py               # Adaptive IoT data generator
├── observability/
│   ├── prometheus.yml
│   └── grafana/provisioning/           # Auto-provisioned Grafana
├── docker-compose.factory.yml          # All factory-twin services
└── README.md

## 🔑 Default Accounts

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Full access |
| engineer | engineer123 | AI + alerts + telemetry |
| operator | operator123 | Dashboard + telemetry |
| viewer | viewer123 | Dashboard only |

> **Production note:** Replace `JWT_SECRET` in `backend/.env` before any public deployment.

## 📈 Key Design Decisions

**DB-first ingest:** PostgreSQL writes complete synchronously; Ditto and Kafka updates run as background tasks. This ensures data is never lost even if downstream services are unavailable.

**Async anomaly scoring:** The ML scoring function is `async` with a per-machine `asyncio.Lock`. Retraining (CPU-bound sklearn work) runs in a thread executor to avoid blocking the event loop during the ~100ms training operation.

**Client-side AI intelligence:** All predictive and explanatory logic (ETAs, correlations, confidence, root cause, recommendations) runs in the React frontend using existing API data. This keeps backend complexity low while enabling rich real-time intelligence display.

**Graceful degradation:** If the ML model file is missing on startup, the system automatically falls back to the z-score detector. If Kafka is unavailable, telemetry is written to the DB and Ditto without error. If Ditto is unreachable, DB writes still complete.