"""
arc/realty/listing_store.py
Normalized property and listing persistence. All reads and writes go through here.
"""

import json
import logging
from typing import Optional
from arc.db import get_conn

logger = logging.getLogger(__name__)


# ── Property CRUD ──────────────────────────────────────────────────────────────

def upsert_property(data: dict) -> str:
    """Insert or update a property record. Returns property_id."""
    conn = get_conn()
    try:
        existing = conn.execute(
            "SELECT property_id FROM properties WHERE property_id = ?",
            (data["property_id"],)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE properties SET
                    address=?, city=?, province=?, postal_code=?,
                    lat=?, lng=?, property_type=?, beds=?, baths=?,
                    sqft=?, lot_size=?, year_built=?, updated_at=datetime('now')
                WHERE property_id=?
            """, (
                data.get("address"), data.get("city"), data.get("province", "BC"),
                data.get("postal_code"), data.get("lat"), data.get("lng"),
                data.get("property_type"), data.get("beds"), data.get("baths"),
                data.get("sqft"), data.get("lot_size"), data.get("year_built"),
                data["property_id"]
            ))
        else:
            conn.execute("""
                INSERT INTO properties
                (property_id, address, city, province, postal_code, lat, lng,
                 property_type, beds, baths, sqft, lot_size, year_built)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                data["property_id"], data.get("address"), data.get("city"),
                data.get("province", "BC"), data.get("postal_code"),
                data.get("lat"), data.get("lng"), data.get("property_type"),
                data.get("beds"), data.get("baths"), data.get("sqft"),
                data.get("lot_size"), data.get("year_built")
            ))
        conn.commit()
        return data["property_id"]
    finally:
        conn.close()


def get_property(property_id: str) -> Optional[dict]:
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM properties WHERE property_id=?", (property_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ── Listing CRUD ───────────────────────────────────────────────────────────────

def upsert_listing(data: dict) -> str:
    """Insert or update a listing. Returns listing_id."""
    conn = get_conn()
    try:
        existing = conn.execute(
            "SELECT listing_id, list_price FROM listings WHERE listing_id=?",
            (data["listing_id"],)
        ).fetchone()

        price_changed = False
        if existing:
            price_changed = existing["list_price"] != data.get("list_price")
            conn.execute("""
                UPDATE listings SET
                    list_price=?, status=?, date_updated=?, description=?,
                    photos_json=?, raw_payload=?, updated_at=datetime('now')
                WHERE listing_id=?
            """, (
                data.get("list_price"), data.get("status", "active"),
                data.get("date_updated"), data.get("description"),
                json.dumps(data.get("photos", [])),
                json.dumps(data.get("raw_payload", {})),
                data["listing_id"]
            ))
        else:
            price_changed = True
            conn.execute("""
                INSERT INTO listings
                (listing_id, property_id, source, source_ref, mls_number,
                 list_price, status, date_listed, date_updated, description,
                 photos_json, raw_payload)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                data["listing_id"], data["property_id"],
                data.get("source", "manual"), data.get("source_ref"),
                data.get("mls_number"), data.get("list_price"),
                data.get("status", "active"), data.get("date_listed"),
                data.get("date_updated"), data.get("description"),
                json.dumps(data.get("photos", [])),
                json.dumps(data.get("raw_payload", {}))
            ))

        conn.commit()

        if price_changed and data.get("list_price"):
            _record_price(conn, data["listing_id"], data["property_id"], data["list_price"])

        return data["listing_id"]
    finally:
        conn.close()


def _record_price(conn, listing_id: str, property_id: str, price: float):
    conn.execute(
        "INSERT INTO price_history (listing_id, property_id, price) VALUES (?,?,?)",
        (listing_id, property_id, price)
    )
    conn.commit()


def get_listing(listing_id: str) -> Optional[dict]:
    conn = get_conn()
    try:
        row = conn.execute("""
            SELECT l.*, p.address, p.city, p.province, p.postal_code,
                   p.lat, p.lng, p.property_type, p.beds, p.baths,
                   p.sqft, p.lot_size, p.year_built
            FROM listings l
            JOIN properties p ON l.property_id = p.property_id
            WHERE l.listing_id=?
        """, (listing_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["photos"] = json.loads(d.get("photos_json") or "[]")
        d["deal_explanation"] = json.loads(d.get("deal_explanation") or "{}")
        return d
    finally:
        conn.close()


def search_listings(filters: dict, sort: str = "deal_score", limit: int = 50, offset: int = 0) -> list:
    conn = get_conn()
    try:
        where = ["l.status = 'active'"]
        params = []

        if filters.get("city"):
            where.append("LOWER(p.city) LIKE ?")
            params.append(f"%{filters['city'].lower()}%")
        if filters.get("min_price"):
            where.append("l.list_price >= ?")
            params.append(filters["min_price"])
        if filters.get("max_price"):
            where.append("l.list_price <= ?")
            params.append(filters["max_price"])
        if filters.get("beds"):
            where.append("p.beds >= ?")
            params.append(filters["beds"])
        if filters.get("baths"):
            where.append("p.baths >= ?")
            params.append(filters["baths"])
        if filters.get("property_type"):
            where.append("LOWER(p.property_type) = ?")
            params.append(filters["property_type"].lower())
        if filters.get("min_deal_score"):
            where.append("l.deal_score >= ?")
            params.append(filters["min_deal_score"])

        sort_map = {
            "deal_score": "l.deal_score DESC",
            "newest": "l.date_listed DESC",
            "price_asc": "l.list_price ASC",
            "price_desc": "l.list_price DESC",
            "days_on_market": "l.date_listed ASC",
            "price_drop": "l.deal_score DESC",
        }
        order = sort_map.get(sort, "l.deal_score DESC")

        sql = f"""
            SELECT l.*, p.address, p.city, p.province, p.postal_code,
                   p.lat, p.lng, p.property_type, p.beds, p.baths,
                   p.sqft, p.lot_size, p.year_built
            FROM listings l
            JOIN properties p ON l.property_id = p.property_id
            WHERE {' AND '.join(where)}
            ORDER BY {order}
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(sql, params + [limit, offset]).fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["photos"] = json.loads(d.get("photos_json") or "[]")
            d["deal_explanation"] = json.loads(d.get("deal_explanation") or "{}")
            results.append(d)
        return results
    finally:
        conn.close()


def get_price_history(listing_id: str) -> list:
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT price, recorded_at FROM price_history WHERE listing_id=? ORDER BY recorded_at",
            (listing_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_deal_score(listing_id: str, score: float, explanation: dict):
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE listings SET deal_score=?, deal_explanation=?, updated_at=datetime('now') WHERE listing_id=?",
            (score, json.dumps(explanation), listing_id)
        )
        conn.commit()
    finally:
        conn.close()


def get_all_active_listing_ids() -> list:
    conn = get_conn()
    try:
        rows = conn.execute("SELECT listing_id FROM listings WHERE status='active'").fetchall()
        return [r["listing_id"] for r in rows]
    finally:
        conn.close()


def get_listing_count() -> dict:
    conn = get_conn()
    try:
        total = conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
        active = conn.execute("SELECT COUNT(*) FROM listings WHERE status='active'").fetchone()[0]
        props = conn.execute("SELECT COUNT(*) FROM properties").fetchone()[0]
        return {"total_listings": total, "active_listings": active, "total_properties": props}
    finally:
        conn.close()
