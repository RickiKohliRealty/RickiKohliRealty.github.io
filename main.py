"""
arc/api/main.py
RRG-ARC FastAPI application.
All endpoints are boring and correct.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import json
import os

from arc.db import init_db
from arc.realty.listing_store import (
    search_listings, get_listing, get_listing_count,
    get_price_history, get_all_active_listing_ids
)
from arc.realty.signal_store import get_signals_for_listing, get_signals_by_type, get_recent_signals
from arc.realty.lead_store import (
    create_lead, get_lead, get_leads, get_lead_counts,
    get_call_queue, save_search, get_saved_searches, score_lead
)
from arc.realty.deal_engine import get_area_stats, recompute_all_scores
from arc.workers.worker_engine import get_worker_history, job_recompute_scores, job_daily_digest

app = FastAPI(title="RRG-ARC Intelligence API", version="1.0.0")

# Init DB on startup
init_db()


# ── Pydantic models ────────────────────────────────────────────────────────────

class LeadSubmit(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    intent: Optional[str] = "buying"
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    beds_min: Optional[float] = None
    baths_min: Optional[float] = None
    target_areas: Optional[List[str]] = []
    timeline: Optional[str] = None
    preapproved: Optional[bool] = False
    source: Optional[str] = "website"
    notes: Optional[str] = None


class SavedSearchSubmit(BaseModel):
    lead_id: Optional[str] = None
    label: Optional[str] = "My Search"
    query: dict
    alert_enabled: Optional[bool] = True


# ── Listings ───────────────────────────────────────────────────────────────────

@app.get("/api/listings")
def api_listings(
    city: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    beds: Optional[float] = None,
    baths: Optional[float] = None,
    property_type: Optional[str] = None,
    min_deal_score: Optional[float] = None,
    sort: Optional[str] = "deal_score",
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    filters = {
        k: v for k, v in {
            "city": city,
            "min_price": min_price,
            "max_price": max_price,
            "beds": beds,
            "baths": baths,
            "property_type": property_type,
            "min_deal_score": min_deal_score,
        }.items() if v is not None
    }
    listings = search_listings(filters, sort=sort, limit=limit, offset=offset)
    return {"count": len(listings), "listings": listings}


@app.get("/api/listings/{listing_id}")
def api_listing_detail(listing_id: str):
    listing = get_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing["price_history"] = get_price_history(listing_id)
    listing["signals"] = get_signals_for_listing(listing_id)
    return listing


# ── Deals ──────────────────────────────────────────────────────────────────────

@app.get("/api/deals")
def api_deals(
    city: Optional[str] = None,
    min_deal_score: float = 0.5,
    max_price: Optional[float] = None,
    limit: int = Query(default=20, le=100),
):
    filters = {"min_deal_score": min_deal_score}
    if city:
        filters["city"] = city
    if max_price:
        filters["max_price"] = max_price
    listings = search_listings(filters, sort="deal_score", limit=limit)
    return {"count": len(listings), "deals": listings}


# ── Signals ────────────────────────────────────────────────────────────────────

@app.get("/api/signals")
def api_signals(
    signal_type: Optional[str] = None,
    hours: int = 48,
    limit: int = 50,
):
    if signal_type:
        signals = get_signals_by_type(signal_type, limit=limit)
    else:
        signals = get_recent_signals(hours=hours, limit=limit)
    return {"count": len(signals), "signals": signals}


@app.get("/api/signals/{listing_id}")
def api_signals_for_listing(listing_id: str):
    signals = get_signals_for_listing(listing_id)
    return {"listing_id": listing_id, "signals": signals}


# ── Leads ──────────────────────────────────────────────────────────────────────

@app.post("/api/leads", status_code=201)
def api_submit_lead(lead: LeadSubmit):
    data = lead.dict()
    lead_id = create_lead(data)
    lead_record = get_lead(lead_id)
    return {
        "lead_id": lead_id,
        "score": lead_record["score"],
        "message": "Thank you — Ricky will be in touch shortly.",
    }


@app.get("/api/leads")
def api_leads(
    status: Optional[str] = None,
    score: Optional[str] = None,
    limit: int = 100,
):
    leads = get_leads(status=status, score=score, limit=limit)
    return {"count": len(leads), "leads": leads}


@app.get("/api/leads/{lead_id}")
def api_lead_detail(lead_id: str):
    lead = get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@app.get("/api/call-queue")
def api_call_queue(limit: int = 20):
    queue = get_call_queue(limit=limit)
    return {"count": len(queue), "queue": queue}


# ── Saved searches ─────────────────────────────────────────────────────────────

@app.post("/api/searches", status_code=201)
def api_save_search(search: SavedSearchSubmit):
    search_id = save_search(
        lead_id=search.lead_id,
        label=search.label,
        query=search.query,
        alert_enabled=search.alert_enabled,
    )
    return {"search_id": search_id, "message": "Search saved"}


@app.get("/api/searches")
def api_searches(lead_id: Optional[str] = None):
    searches = get_saved_searches(lead_id=lead_id)
    return {"count": len(searches), "searches": searches}


# ── Dashboard summary ──────────────────────────────────────────────────────────

@app.get("/api/dashboard/summary")
def api_dashboard_summary():
    listing_counts = get_listing_count()
    lead_counts = get_lead_counts()
    top_deals = search_listings({"min_deal_score": 0.0}, sort="deal_score", limit=10)
    hot_leads = get_leads(score="hot", limit=10)
    call_queue = get_call_queue(limit=5)
    recent_signals = get_recent_signals(hours=24, limit=10)
    worker_status = get_worker_history(limit=5)

    # Recent price drops
    price_drops = get_signals_by_type("price_drop_recent", limit=5)

    return {
        "listing_counts": listing_counts,
        "lead_counts": lead_counts,
        "top_deals": top_deals[:10],
        "hot_leads": hot_leads,
        "call_queue": call_queue,
        "recent_signals": recent_signals,
        "recent_price_drops": price_drops,
        "worker_status": worker_status,
    }


# ── Admin / Worker endpoints ───────────────────────────────────────────────────

@app.post("/api/admin/recompute-scores")
def api_recompute_scores():
    result = job_recompute_scores()
    return {"status": "complete", "result": result}


@app.get("/api/admin/workers")
def api_worker_history(limit: int = 20):
    history = get_worker_history(limit=limit)
    return {"runs": history}


@app.post("/api/admin/daily-digest")
def api_daily_digest():
    summary = job_daily_digest()
    return {"status": "complete", "summary": summary}


# ── Ingest endpoint (for webhook / manual push) ────────────────────────────────

@app.post("/api/ingest")
def api_ingest(listings: List[dict]):
    from arc.realty.listing_ingest import ingest_batch
    result = ingest_batch(listings)
    # Recompute scores after ingest
    job_recompute_scores()
    return result.to_dict()


# ── Static UI files ────────────────────────────────────────────────────────────

@app.get("/")
def serve_dashboard():
    return FileResponse("ui/dashboard.html")


@app.get("/deals")
def serve_deals():
    return FileResponse("ui/deals.html")


@app.get("/leads")
def serve_leads():
    return FileResponse("ui/leads.html")


@app.get("/listing/{listing_id}")
def serve_listing_detail(listing_id: str):
    return FileResponse("ui/listing_detail.html")
