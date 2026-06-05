"""
RRG-ARC Database Layer
Initializes SQLite schema. Swap connection string for Postgres in production.
"""

import sqlite3
import os
import logging

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("RRG_DB_PATH", "data/rrg.db")


def get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    # ── Properties (permanent identity) ──────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS properties (
        property_id     TEXT PRIMARY KEY,
        address         TEXT NOT NULL,
        city            TEXT NOT NULL,
        province        TEXT NOT NULL DEFAULT 'BC',
        postal_code     TEXT,
        lat             REAL,
        lng             REAL,
        property_type   TEXT,
        beds            REAL,
        baths           REAL,
        sqft            REAL,
        lot_size        REAL,
        year_built      INTEGER,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Listings (each MLS / source record) ──────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS listings (
        listing_id      TEXT PRIMARY KEY,
        property_id     TEXT NOT NULL REFERENCES properties(property_id),
        source          TEXT NOT NULL DEFAULT 'manual',
        source_ref      TEXT,
        mls_number      TEXT,
        list_price      REAL,
        status          TEXT DEFAULT 'active',
        date_listed     TEXT,
        date_updated    TEXT,
        description     TEXT,
        photos_json     TEXT DEFAULT '[]',
        raw_payload     TEXT,
        deal_score      REAL DEFAULT 0,
        deal_explanation TEXT DEFAULT '{}',
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Price history ─────────────────────────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS price_history (
        history_id      INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id      TEXT NOT NULL REFERENCES listings(listing_id),
        property_id     TEXT NOT NULL,
        price           REAL NOT NULL,
        recorded_at     TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Property signals ──────────────────────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS property_signals (
        signal_id       INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id      TEXT NOT NULL REFERENCES listings(listing_id),
        property_id     TEXT NOT NULL,
        signal_type     TEXT NOT NULL,
        signal_strength REAL NOT NULL DEFAULT 0,
        signal_meta_json TEXT DEFAULT '{}',
        created_at      TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Leads ─────────────────────────────────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        lead_id         TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        phone           TEXT,
        email           TEXT,
        intent          TEXT DEFAULT 'buying',
        budget_min      REAL,
        budget_max      REAL,
        beds_min        REAL,
        baths_min       REAL,
        target_areas_json TEXT DEFAULT '[]',
        timeline        TEXT,
        preapproved     INTEGER DEFAULT 0,
        source          TEXT DEFAULT 'website',
        status          TEXT DEFAULT 'new',
        score           TEXT DEFAULT 'cold',
        notes           TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Saved searches ────────────────────────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS saved_searches (
        search_id       INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id         TEXT REFERENCES leads(lead_id),
        label           TEXT,
        query_json      TEXT NOT NULL DEFAULT '{}',
        alert_enabled   INTEGER DEFAULT 1,
        created_at      TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Tasks ─────────────────────────────────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        task_id         INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id         TEXT REFERENCES leads(lead_id),
        listing_id      TEXT REFERENCES listings(listing_id),
        task_type       TEXT NOT NULL,
        priority        INTEGER DEFAULT 5,
        due_at          TEXT,
        status          TEXT DEFAULT 'open',
        notes           TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
    )
    """)

    # ── Worker run log ────────────────────────────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS worker_runs (
        run_id          INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_name     TEXT NOT NULL,
        started_at      TEXT DEFAULT (datetime('now')),
        finished_at     TEXT,
        status          TEXT DEFAULT 'running',
        items_processed INTEGER DEFAULT 0,
        items_failed    INTEGER DEFAULT 0,
        log_json        TEXT DEFAULT '[]',
        error           TEXT
    )
    """)

    # ── Indexes ───────────────────────────────────────────────────────────────
    c.execute("CREATE INDEX IF NOT EXISTS idx_listings_property ON listings(property_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_signals_listing ON property_signals(listing_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_signals_type ON property_signals(signal_type)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")

    conn.commit()
    conn.close()
    logger.info("Database initialized at %s", DB_PATH)
