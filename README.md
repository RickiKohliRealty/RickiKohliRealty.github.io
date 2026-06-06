# RKR-ARC — RKR | Ricki Kohli Realty Intelligence Platform

Built on ARC's signal/store/engine/api architecture. Extended into a property intelligence and lead-ops command center.

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Initialize database and load sample listings
python setup.py

# 3. Start the API + UI server
uvicorn arc.api.main:app --reload --port 8000
```

Then open:

| URL | Surface |
|-----|---------|
| `http://localhost:8000` | **RKR Command Center** (internal) |
| `http://localhost:8000/deals` | **Public Property Search** |
| `http://localhost:8000/leads` | **Lead Management** |
| `http://localhost:8000/docs` | **API Docs** (auto-generated) |

---

## Architecture

```
arc/
  db.py                   — SQLite schema, connection pool
  realty/
    listing_normalizer.py — Address normalization, deduplication, property_id generation
    listing_ingest.py     — Idempotent ingest pipeline (CSV, JSON, API push)
    listing_store.py      — Property + listing persistence, search queries
    signal_store.py       — Property signal persistence
    deal_engine.py        — Signal generation + explainable deal scoring
    lead_store.py         — Lead capture, scoring (hot/warm/cold), task generation
  api/
    main.py               — FastAPI app, all endpoints
  workers/
    worker_engine.py      — Scheduled jobs, worker run logging

ui/
  dashboard.html          — Internal command center (dark theme)
  deals.html              — Public property search
  leads.html              — Internal lead management
  listing_detail.html     — Property detail + lead capture form

data/
  seed_listings.json      — Sample Williams Lake listings
  seed_price_drops.py     — Inject price history for signal testing
  rkr.db                  — SQLite database (created on first run)
```

---

## Ingest Listings

**From JSON file:**
```python
from arc.realty.listing_ingest import ingest_from_json
result = ingest_from_json("data/my_listings.json")
print(result.to_dict())
```

**From CSV:**
```python
from arc.realty.listing_ingest import ingest_from_csv
result = ingest_from_csv("data/my_listings.csv")
```

**Via API (webhook/push):**
```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "Content-Type: application/json" \
  -d '[{"address": "123 Main St", "city": "Williams Lake", ...}]'
```

Required fields: `address`, `city`

---

## Data Model

| Table | Purpose |
|-------|---------|
| `properties` | Permanent property identity (one row per physical address) |
| `listings` | Each MLS/source listing record with deal score |
| `price_history` | Price changes over time (auto-tracked) |
| `property_signals` | Generated signals (price_drop, below_market, etc.) |
| `leads` | Captured buyers/sellers with score |
| `saved_searches` | Stored search queries with alert flag |
| `tasks` | Internal action queue for RKR / Ricki Kohli Realty |
| `worker_runs` | Job execution log |

---

## Signal Types

| Signal | Meaning |
|--------|---------|
| `new_listing` | Listed in last 3 days |
| `price_drop_recent` | Price reduced in last 14 days |
| `price_drop_large` | Price dropped 5%+ |
| `price_per_sqft_below_area_avg` | $/sqft below area median |
| `under_market_estimate` | Estimated market value > list price |
| `days_on_market_high` | 30+ days on market |
| `fixer_candidate` | Pre-1975 build |
| `family_home_candidate` | 3+ bed / 2+ bath / under $1.2M |
| `investor_candidate` | High DOM + price drop |
| `luxury_candidate` | Over $1.5M |

---

## Deal Score (0–1)

Weighted, explainable — every score includes an explanation block the UI displays.

| Component | Weight |
|-----------|--------|
| Below market value ($/sqft vs area avg) | 35% |
| Price reduction history | 20% |
| Days on market signal | 15% |
| Comparable listings confidence | 15% |
| Property features (bed/bath) | 10% |
| Listing freshness | 5% |

---

## Lead Scoring

| Score | Rule |
|-------|------|
| **Hot** | 9+ points (preapproved + budget + immediate timeline + phone) |
| **Warm** | 5–8 points |
| **Cold** | < 5 points |

Hot leads auto-generate a "call within 1 hour" task.
Warm leads get a 24h follow-up task.
Cold leads get a 48h email task.

---

## API Reference

```
GET  /api/listings              — Search active listings
GET  /api/listings/{id}         — Listing detail + signals + price history
GET  /api/deals                 — Top deals (min_deal_score filter)
GET  /api/signals               — Recent signals (filter by type)
POST /api/leads                 — Submit a lead
GET  /api/leads                 — List all leads (filter by score/status)
GET  /api/call-queue            — RKR prioritized call list
POST /api/searches              — Save a search
GET  /api/dashboard/summary     — All dashboard data in one call
POST /api/ingest                — Push listing batch
POST /api/admin/recompute-scores — Recompute all deal scores
GET  /api/admin/workers         — Worker run history
```

---

## Worker Jobs

Run manually or wire to a scheduler (cron, APScheduler):

```python
from arc.workers.worker_engine import (
    job_recompute_scores,    # Recompute all deal scores + signals
    job_stale_lead_reminders, # Create follow-up tasks for inactive leads
    job_daily_digest,         # Write daily summary JSON to logs/
)

job_recompute_scores()
job_stale_lead_reminders()
job_daily_digest()
```

All jobs write to `worker_runs` table. No silent failures.

---

## Swap to Postgres

Change `DB_PATH` environment variable and swap `sqlite3` for `psycopg2` in `arc/db.py`. Schema is standard SQL.

---

## Adding a Listing Source

1. Write a fetcher that returns `List[dict]` matching the raw listing shape
2. Pass to `ingest_batch(raw_listings)` 
3. All normalization, deduplication, and scoring happens automatically

The ingest pipeline is the single entry point for all external data.
