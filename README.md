# 🏭 Factory Twin — AI Digital Twin for Smart Factory

A **production-grade, real-time industrial AI platform** that combines IoT telemetry, digital twin synchronization, and machine learning to deliver **predictive insights, anomaly detection, and decision support** for smart factory operations.

---

## 🚀 What This Project Demonstrates

This is not just a dashboard — it is a **complete intelligent system**:

* ⚡ Real-time telemetry ingestion pipeline
* 🧠 ML anomaly detection (Isolation Forest + fallback)
* 🔄 Digital Twin synchronization (Eclipse Ditto)
* 📊 AI-powered insights (client-side intelligence layer)
* 🧭 Predictive + explainable decision support
* 🐳 Fully containerized production-ready architecture

---

## 🏗️ System Architecture

```
Factory Floor (Machines)
   ↓
Telemetry (HTTP / MQTT)
   ↓
FastAPI Backend
   ├── PostgreSQL (DB-first persistence)
   ├── ML Anomaly Engine (Isolation Forest)
   ├── Alert Engine (threshold + ML)
   ├── Eclipse Ditto (Digital Twin sync)
   └── Kafka (optional streaming)

   ↓

Frontend (React + Vite + Tailwind + Nginx)
   ├── Dashboard
   ├── Machine View
   ├── Alerts
   └── AI Insights Panel (client-side intelligence)

   ↓

Observability
   ├── Prometheus
   └── Grafana
```

---

## 🧠 Core Capabilities

### 🔹 1. Real-Time IoT Pipeline

* Telemetry ingestion every **2 seconds per machine**
* Adaptive simulator with:

  * drift
  * noise
  * anomaly injection
* DB-first architecture (no data loss)
* Backpressure-aware ingestion

---

### 🔹 2. ML Anomaly Detection Engine

| Feature     | Description                    |
| ----------- | ------------------------------ |
| Model       | Isolation Forest (per machine) |
| Cold Start  | Z-score fallback               |
| Training    | After 50 samples               |
| Retraining  | Every 30 new samples           |
| Scaling     | StandardScaler                 |
| Persistence | Saved to disk (`/ml_models`)   |
| Concurrency | Async-safe with locks          |

✔ Fully automatic lifecycle
✔ No manual intervention required

---

### 🔹 3. AI Intelligence Layer (Frontend)

> ⚠️ Runs entirely on **client-side using existing API data**
> No additional backend endpoints

#### Components

* **Confidence Score**

  * 7-signal evaluation system
* **Risk Index (0–100)**

  * anomaly score + frequency + ETA
* **Risk Momentum**

  * Stable → Improving → Worsening → Critical Escalation
* **Root Cause Analysis**

  * Ranked causal inference
* **Recommendation Engine**

  * Action prioritization + impact analysis
* **Predictive ETA**

  * Time to threshold breach
* **Correlation Detection**

  * Multi-metric anomaly relationships
* **Anomaly Frequency Tracking**
* **Priority Insights Filtering**

👉 This transforms raw data into **actionable intelligence**

---

### 🔹 4. Explainability & Fallback System

* ML unavailable → fallback to **threshold-based reasoning**
* “Why?” explanation panel
* Evidence-based reasoning (metrics + trends)
* No black-box outputs

---

### 🔹 5. Alerts System

* Threshold + ML-driven alerts
* Severity levels:

  * normal
  * warning
  * critical
* Acknowledgement flow
* Analytics (trend + distribution)

---

### 🔹 6. Digital Twin Integration

* Eclipse Ditto synchronization
* Real-time machine state representation
* Backend → twin → frontend consistency

---

### 🔹 7. Observability

* Prometheus metrics endpoint
* Grafana dashboards
* Tracks:

  * ingestion rate
  * anomaly scores
  * alert trends
  * latency

---

## 🧪 System Status (Current)

✔ Backend: Stable
✔ ML Pipeline: Active (Isolation Forest)
✔ Frontend: Fully functional
✔ AI Insights: Integrated and validated
✔ Docker Deployment: Working
✔ Runtime Errors: None

👉 **Production-ready development baseline achieved**

---

## ⚙️ Tech Stack

| Layer         | Technology                      |
| ------------- | ------------------------------- |
| Backend       | FastAPI + SQLAlchemy + asyncpg  |
| Database      | PostgreSQL                      |
| ML            | scikit-learn (Isolation Forest) |
| Frontend      | React + Vite + Tailwind         |
| Digital Twin  | Eclipse Ditto                   |
| Messaging     | Kafka (optional)                |
| Observability | Prometheus + Grafana            |
| Auth          | JWT + RBAC                      |
| Deployment    | Docker Compose + Nginx          |

---

## 🐳 Getting Started

### Prerequisites

* Docker Desktop (WSL2 recommended)

---

### Run the System

```bash
git clone <repo-url>
cd factory-twin

docker compose -f docker-compose.factory.yml up -d --build
```

---

### Verify

```bash
docker ps --filter "name=factory"
```

---

### Access

| Service    | URL                                                      |
| ---------- | -------------------------------------------------------- |
| Frontend   | [http://localhost:5173](http://localhost:5173)           |
| API Docs   | [http://localhost:8000/docs](http://localhost:8000/docs) |
| Grafana    | [http://localhost:3001](http://localhost:3001)           |
| Prometheus | [http://localhost:9091](http://localhost:9091)           |

---

## 🧩 Key UI Features

### Dashboard

* Fleet health summary
* Machine ranking by anomaly score
* Real-time sparklines

### Machine View

* Live telemetry
* AI Insights panel
* Anomaly status card
* Digital twin viewer

### Alerts

* Trend analysis
* Distribution analytics
* Acknowledgement system

---

## 🎬 Demo Flow

### Normal State

* Low risk
* Stable metrics
* No alerts

### ML Activation

* Model trains at 50 samples
* Confidence increases

### Anomaly

* Score spikes (> 2.8σ)
* Risk increases
* Root cause identified
* Recommendations generated

### Sustained Issue

* Critical escalation triggered
* Priority insights shown
* Frequency increases

---

## 📁 Project Structure

```
backend/
frontend/
simulator/
observability/
docker-compose.factory.yml
```

(organized into modular services)

---

## 🔑 Default Credentials

| User     | Password    |
| -------- | ----------- |
| admin    | admin123    |
| engineer | engineer123 |
| operator | operator123 |
| viewer   | viewer123   |

---

## 🧠 Engineering Highlights

* Async-safe ML pipeline (no race conditions)
* Client-side AI intelligence (low backend load)
* Graceful degradation (fallback logic)
* DB-first ingestion (no data loss)
* Fully containerized system

---

## 🚀 Future Enhancements

* Predictive failure modeling (advanced ML)
* Model explainability (SHAP / feature importance)
* Frontend performance optimization
* Cloud deployment (Kubernetes)
* Real IoT device integration

---

## ⚠️ Important Notes

Avoid destructive Docker commands:

```
docker system prune -a
docker volume prune
docker compose down -v
```

Use project-specific commands only.

---

## 🎯 Final Statement

This project demonstrates the design and implementation of a:

> **Real-time AI-powered Digital Twin system with predictive intelligence and explainable decision support**

---

