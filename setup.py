#!/usr/bin/env python3
"""
setup.py — One-command RKR-ARC setup.
Run this once to initialize the database and load sample data.

Usage:
    python setup.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

print("=" * 60)
print("  RKR-ARC Setup")
print("  RKR Ricki Kohli Realty Intelligence Platform")
print("=" * 60)

# 1. Init DB
print("\n[1/4] Initializing database…")
from arc.db import init_db
init_db()
print("      ✓ Database ready at data/rkr.db")

# 2. Ingest seed listings
print("\n[2/4] Ingesting sample listings…")
from arc.realty.listing_ingest import ingest_from_json
result = ingest_from_json("data/seed_listings.json")
print(f"      ✓ {result.created} new listings, {result.updated} updated, {result.failed} failed")
for err in result.errors:
    print(f"      ✗ {err}")

# 3. Seed price drops for signal testing
print("\n[3/4] Seeding price history…")
try:
    sys.path.insert(0, "data")
    import importlib.util
    spec = importlib.util.spec_from_file_location("seed_drops", "data/seed_price_drops.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.seed_drops()
    print("      ✓ Price history seeded")
except Exception as e:
    print(f"      ✗ Price history seed failed: {e}")

# 4. Compute deal scores
print("\n[4/4] Computing deal scores and signals…")
from arc.realty.deal_engine import recompute_all_scores
result = recompute_all_scores()
print(f"      ✓ Scored {result['scored']} / {result['total']} listings")

print("\n" + "=" * 60)
print("  Setup complete!")
print()
print("  Start the API:")
print("  → uvicorn arc.api.main:app --reload --port 8000")
print()
print("  Then open:")
print("  → http://localhost:8000        (Command Center)")
print("  → http://localhost:8000/deals  (Public Search)")
print("  → http://localhost:8000/leads  (Lead Management)")
print("  → http://localhost:8000/docs   (API Docs)")
print("=" * 60)
