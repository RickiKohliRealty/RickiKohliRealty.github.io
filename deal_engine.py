"""
arc/realty/deal_engine.py
Transparent, explainable deal scoring for every listing.
Extends ARC's InfluenceEngine + SignalEngine concepts for real estate.

Every score has an explanation block. No magic black boxes.
"""

import json
import logging
import math
from datetime import datetime
from arc.db import get_conn
from arc.realty.signal_store import save_signals
from arc.realty.listing_store import update_deal_score

logger = logging.getLogger(__name__)


# ── Area stats (computed live from DB) ────────────────────────────────────────

def get_area_stats(city: str, property_type: str = None) -> dict:
    """Compute median price/sqft and DOM for a city from active listings."""
    conn = get_conn()
    try:
        query = """
            SELECT l.list_price, p.sqft,
                   CAST(julianday('now') - julianday(l.date_listed) AS INTEGER) as dom
            FROM listings l
            JOIN properties p ON l.property_id = p.property_id
            WHERE l.status = 'active'
              AND LOWER(p.city) = LOWER(?)
              AND p.sqft > 0
              AND l.list_price > 0
        """
        params = [city]
        if property_type:
            query += " AND LOWER(p.property_type) = LOWER(?)"
            params.append(property_type)

        rows = conn.execute(query, params).fetchall()
        if not rows:
            return {}

        ppsqft_vals = [r["list_price"] / r["sqft"] for r in rows if r["sqft"] and r["list_price"]]
        dom_vals = [r["dom"] for r in rows if r["dom"] is not None]

        if not ppsqft_vals:
            return {}

        ppsqft_vals.sort()
        dom_vals.sort()

        return {
            "sample_size": len(ppsqft_vals),
            "median_ppsqft": _median(ppsqft_vals),
            "avg_ppsqft": sum(ppsqft_vals) / len(ppsqft_vals),
            "median_dom": _median(dom_vals) if dom_vals else None,
            "avg_dom": sum(dom_vals) / len(dom_vals) if dom_vals else None,
        }
    finally:
        conn.close()


def get_price_drop_info(listing_id: str) -> dict:
    """Compute price drop stats from price history."""
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT price, recorded_at FROM price_history WHERE listing_id=? ORDER BY recorded_at",
            (listing_id,)
        ).fetchall()
        if len(rows) < 2:
            return {"has_drop": False}

        prices = [r["price"] for r in rows]
        dates = [r["recorded_at"] for r in rows]
        original = prices[0]
        current = prices[-1]

        if current >= original:
            return {"has_drop": False}

        drop_amount = original - current
        drop_pct = (drop_amount / original) * 100

        # Days since last drop
        last_drop_at = dates[-1]
        try:
            last_drop_date = datetime.fromisoformat(last_drop_at.split(".")[0])
            days_since_drop = (datetime.utcnow() - last_drop_date).days
        except Exception:
            days_since_drop = None

        return {
            "has_drop": True,
            "original_price": original,
            "current_price": current,
            "drop_amount": drop_amount,
            "drop_pct": round(drop_pct, 1),
            "num_reductions": len([i for i in range(1, len(prices)) if prices[i] < prices[i - 1]]),
            "days_since_last_drop": days_since_drop,
        }
    finally:
        conn.close()


# ── Signal generators ──────────────────────────────────────────────────────────

def generate_signals(listing: dict, area_stats: dict, price_drop: dict) -> list:
    """Return a list of signal dicts for this listing."""
    signals = []
    price = listing.get("list_price", 0) or 0
    sqft = listing.get("sqft", 0) or 0
    beds = listing.get("beds", 0) or 0
    baths = listing.get("baths", 0) or 0
    year_built = listing.get("year_built")
    dom = _days_on_market(listing.get("date_listed"))

    # 1. New listing
    if dom is not None and dom <= 3:
        signals.append({
            "signal_type": "new_listing",
            "signal_strength": round(1.0 - (dom / 3), 2),
            "signal_meta": {"days_on_market": dom},
        })

    # 2. Price drop (recent)
    if price_drop.get("has_drop") and price_drop.get("days_since_last_drop") is not None:
        days = price_drop["days_since_last_drop"]
        if days <= 14:
            strength = max(0.1, 1.0 - (days / 14))
            signals.append({
                "signal_type": "price_drop_recent",
                "signal_strength": round(strength, 2),
                "signal_meta": {
                    "drop_amount": price_drop["drop_amount"],
                    "drop_pct": price_drop["drop_pct"],
                    "days_since_drop": days,
                },
            })

    # 3. Price drop (large)
    if price_drop.get("has_drop") and price_drop.get("drop_pct", 0) >= 5:
        strength = min(1.0, price_drop["drop_pct"] / 15)
        signals.append({
            "signal_type": "price_drop_large",
            "signal_strength": round(strength, 2),
            "signal_meta": {
                "drop_amount": price_drop["drop_amount"],
                "drop_pct": price_drop["drop_pct"],
            },
        })

    # 4. Below area avg price/sqft
    if area_stats.get("median_ppsqft") and sqft > 0 and price > 0:
        listing_ppsqft = price / sqft
        area_avg = area_stats["median_ppsqft"]
        discount_pct = ((area_avg - listing_ppsqft) / area_avg) * 100
        if discount_pct > 5:
            strength = min(1.0, discount_pct / 30)
            signals.append({
                "signal_type": "price_per_sqft_below_area_avg",
                "signal_strength": round(strength, 2),
                "signal_meta": {
                    "listing_ppsqft": round(listing_ppsqft, 0),
                    "area_avg_ppsqft": round(area_avg, 0),
                    "discount_pct": round(discount_pct, 1),
                },
            })

    # 5. High days on market
    if dom is not None and dom > 30:
        strength = min(1.0, (dom - 30) / 60)
        signals.append({
            "signal_type": "days_on_market_high",
            "signal_strength": round(strength, 2),
            "signal_meta": {"days_on_market": dom, "threshold": 30},
        })

    # 6. Fixer candidate (old year built, low $/sqft)
    if year_built and year_built < 1975:
        signals.append({
            "signal_type": "fixer_candidate",
            "signal_strength": round(min(1.0, (1975 - year_built) / 50), 2),
            "signal_meta": {"year_built": year_built},
        })

    # 7. Family home candidate
    if beds >= 3 and baths >= 2 and price <= 1_200_000:
        signals.append({
            "signal_type": "family_home_candidate",
            "signal_strength": min(1.0, beds * 0.2 + baths * 0.1),
            "signal_meta": {"beds": beds, "baths": baths},
        })

    # 8. Investor candidate (high DOM + price drop)
    if dom is not None and dom > 45 and price_drop.get("has_drop"):
        signals.append({
            "signal_type": "investor_candidate",
            "signal_strength": 0.75,
            "signal_meta": {"dom": dom, "price_reduced": True},
        })

    # 9. Luxury candidate
    if price >= 1_500_000:
        signals.append({
            "signal_type": "luxury_candidate",
            "signal_strength": min(1.0, price / 3_000_000),
            "signal_meta": {"list_price": price},
        })

    # 10. Under market estimate
    if area_stats.get("median_ppsqft") and sqft > 0 and price > 0:
        listing_ppsqft = price / sqft
        estimated_market = area_stats["median_ppsqft"] * sqft
        if estimated_market > price * 1.1:
            gap = estimated_market - price
            signals.append({
                "signal_type": "under_market_estimate",
                "signal_strength": round(min(1.0, gap / price), 2),
                "signal_meta": {
                    "list_price": price,
                    "estimated_market_value": round(estimated_market, 0),
                    "estimated_gap": round(gap, 0),
                },
            })

    return signals


# ── Deal scorer ────────────────────────────────────────────────────────────────

def compute_deal_score(listing: dict, area_stats: dict, price_drop: dict) -> tuple:
    """
    Returns (score: float 0-1, explanation: dict)
    Weights are transparent and tunable.
    """
    price = listing.get("list_price", 0) or 0
    sqft = listing.get("sqft", 0) or 0
    dom = _days_on_market(listing.get("date_listed"))

    components = {}
    explanation = {}

    # Under market (35%)
    if area_stats.get("median_ppsqft") and sqft > 0 and price > 0:
        listing_ppsqft = price / sqft
        area_avg = area_stats["median_ppsqft"]
        discount = (area_avg - listing_ppsqft) / area_avg
        under_market_score = max(0.0, min(1.0, discount * 3))
        components["under_market"] = (under_market_score, 0.35)
        explanation["under_market"] = {
            "score": round(under_market_score, 2),
            "weight": 0.35,
            "description": f"${listing_ppsqft:.0f}/sqft vs ${area_avg:.0f}/sqft area avg ({discount*100:.1f}% {'below' if discount > 0 else 'above'} market)",
        }
    else:
        components["under_market"] = (0.3, 0.35)  # neutral if no comps
        explanation["under_market"] = {"score": 0.3, "weight": 0.35, "description": "Insufficient area comps"}

    # Price drop (20%)
    if price_drop.get("has_drop"):
        drop_pct = price_drop.get("drop_pct", 0)
        recency_bonus = 0.2 if (price_drop.get("days_since_last_drop") or 999) <= 7 else 0
        drop_score = min(1.0, (drop_pct / 15) + recency_bonus)
        components["price_drop"] = (drop_score, 0.20)
        explanation["price_drop"] = {
            "score": round(drop_score, 2),
            "weight": 0.20,
            "description": f"Price reduced {drop_pct:.1f}% (${price_drop['drop_amount']:,.0f}) — {price_drop.get('days_since_last_drop', '?')} days ago",
        }
    else:
        components["price_drop"] = (0.0, 0.20)
        explanation["price_drop"] = {"score": 0.0, "weight": 0.20, "description": "No price reductions"}

    # Days on market (15%)
    if dom is not None:
        if dom <= 7:
            dom_score = 0.9  # Fresh listing is good
        elif dom <= 30:
            dom_score = 0.5
        elif dom <= 60:
            dom_score = 0.7  # Motivated seller territory
        else:
            dom_score = 0.85  # Very motivated
        components["dom"] = (dom_score, 0.15)
        label = "fresh listing" if dom <= 7 else f"{dom} days on market"
        explanation["dom"] = {
            "score": round(dom_score, 2),
            "weight": 0.15,
            "description": label,
        }
    else:
        components["dom"] = (0.3, 0.15)
        explanation["dom"] = {"score": 0.3, "weight": 0.15, "description": "Date listed unknown"}

    # Comps confidence (15%)
    sample = area_stats.get("sample_size", 0)
    comps_score = min(1.0, sample / 20)
    components["comps"] = (comps_score, 0.15)
    explanation["comps"] = {
        "score": round(comps_score, 2),
        "weight": 0.15,
        "description": f"Based on {sample} comparable listings in area",
    }

    # Feature score (10%) — beds + baths desirability
    beds = listing.get("beds", 0) or 0
    baths = listing.get("baths", 0) or 0
    feature_score = min(1.0, (beds * 0.15 + baths * 0.1))
    components["features"] = (feature_score, 0.10)
    explanation["features"] = {
        "score": round(feature_score, 2),
        "weight": 0.10,
        "description": f"{beds:.0f} bed / {baths:.0f} bath",
    }

    # Freshness (5%) — newer listing date
    freshness = 0.0
    if dom is not None:
        freshness = max(0.0, 1.0 - (dom / 180))
    components["freshness"] = (freshness, 0.05)
    explanation["freshness"] = {
        "score": round(freshness, 2),
        "weight": 0.05,
        "description": f"Listed {dom} days ago" if dom is not None else "Listing date unknown",
    }

    # Weighted total
    total = sum(score * weight for score, weight in components.values())
    total = round(min(1.0, max(0.0, total)), 3)

    return total, {
        "deal_score": total,
        "components": explanation,
        "summary": _build_summary(total, explanation, price_drop, dom, area_stats),
    }


def _build_summary(score: float, explanation: dict, price_drop: dict, dom, area_stats: dict) -> list:
    """Return 2-4 human readable bullet points explaining the score."""
    bullets = []
    um = explanation.get("under_market", {})
    if "below market" in um.get("description", ""):
        bullets.append(um["description"])
    pd = explanation.get("price_drop", {})
    if pd.get("score", 0) > 0.1:
        bullets.append(pd["description"])
    if dom and dom > 30:
        bullets.append(f"{dom} days on market — seller may be motivated")
    comps = explanation.get("comps", {})
    if comps.get("score", 0) < 0.3:
        bullets.append("Limited local comps — score confidence low")
    if not bullets:
        bullets.append("No strong value signals detected")
    return bullets


# ── Recompute all listings ────────────────────────────────────────────────────

def recompute_all_scores():
    """Recompute signals and deal scores for all active listings."""
    from arc.realty.listing_store import get_all_active_listing_ids, get_listing
    ids = get_all_active_listing_ids()
    logger.info("Recomputing scores for %d active listings", len(ids))
    success = 0
    for lid in ids:
        try:
            listing = get_listing(lid)
            if not listing:
                continue
            city = listing.get("city", "")
            prop_type = listing.get("property_type", "")
            area_stats = get_area_stats(city, prop_type)
            price_drop = get_price_drop_info(lid)
            signals = generate_signals(listing, area_stats, price_drop)
            save_signals(lid, listing["property_id"], signals)
            score, explanation = compute_deal_score(listing, area_stats, price_drop)
            update_deal_score(lid, score, explanation)
            success += 1
        except Exception as e:
            logger.error("Score error for %s: %s", lid, e)
    logger.info("Score recompute done: %d/%d succeeded", success, len(ids))
    return {"scored": success, "total": len(ids)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _days_on_market(date_listed) -> int | None:
    if not date_listed:
        return None
    try:
        if isinstance(date_listed, str):
            dl = datetime.fromisoformat(date_listed.split("T")[0])
        else:
            dl = date_listed
        return max(0, (datetime.utcnow() - dl).days)
    except Exception:
        return None


def _median(lst):
    if not lst:
        return None
    s = sorted(lst)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2
