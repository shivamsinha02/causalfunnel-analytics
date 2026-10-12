"""CausalFunnel analytics API (Flask + MongoDB).

Endpoints
  POST /api/events                     ingest one event or a batch
  GET  /api/sessions                   sessions with event counts
  GET  /api/sessions/<id>/events       ordered events for one session
  GET  /api/heatmap/pages              pages that have tracked data
  GET  /api/heatmap?url=<page_url>     click points for one page
  GET  /tracker.js                     the client tracking script
  GET  /demo/                          demo pages used to test tracking
"""
import os
from datetime import datetime, timezone
from statistics import median
from urllib.parse import urlsplit, urlunsplit

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pymongo import ASCENDING, DESCENDING, MongoClient

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "causalfunnel")

ALLOWED_TYPES = {"page_view", "click"}
MAX_BATCH = 100
MAX_HEATMAP_POINTS = 10000


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def iso(dt):
    """Datetime -> ISO-8601 string in UTC with a trailing Z."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_timestamp(value):
    """Accept epoch milliseconds or an ISO-8601 string."""
    if isinstance(value, bool) or value is None:
        raise ValueError("timestamp is required")
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000.0, tz=timezone.utc)
    if isinstance(value, str):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    raise ValueError("timestamp must be epoch ms or ISO string")


def clean_url(url):
    """Drop the #fragment so one page maps to one heatmap."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))[:2048]


def number(value, name, required=False, minimum=None):
    if value is None:
        if required:
            raise ValueError(f"{name} is required")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return float(value)


def validate_event(raw):
    """Return a Mongo-ready document or raise ValueError."""
    if not isinstance(raw, dict):
        raise ValueError("event must be an object")

    session_id = raw.get("session_id")
    if not isinstance(session_id, str) or not 1 <= len(session_id) <= 100:
        raise ValueError("session_id must be a non-empty string")

    event_type = raw.get("type")
    if event_type not in ALLOWED_TYPES:
        raise ValueError(f"type must be one of {sorted(ALLOWED_TYPES)}")

    page_url = raw.get("page_url")
    if not isinstance(page_url, str) or not page_url.strip():
        raise ValueError("page_url is required")
    page_url = clean_url(page_url)

    try:
        timestamp = parse_timestamp(raw.get("timestamp"))
    except (TypeError, OverflowError, OSError) as exc:
        raise ValueError(f"invalid timestamp: {exc}")

    doc = {
        "session_id": session_id,
        "type": event_type,
        "page_url": page_url,
        "page_path": urlsplit(page_url).path or "/",
        "timestamp": timestamp,
        "received_at": datetime.now(timezone.utc),
        "user_agent": (request.headers.get("User-Agent") or "")[:300],
    }

    if event_type == "click":
        doc["x"] = number(raw.get("x"), "x", required=True, minimum=0)
        doc["y"] = number(raw.get("y"), "y", required=True, minimum=0)
        doc["page_width"] = number(raw.get("page_width"), "page_width", minimum=1)
        doc["page_height"] = number(raw.get("page_height"), "page_height", minimum=1)
        doc["viewport_width"] = number(raw.get("viewport_width"), "viewport_width", minimum=1)
        doc["viewport_height"] = number(raw.get("viewport_height"), "viewport_height", minimum=1)
        target = raw.get("target")
        doc["target"] = target[:200] if isinstance(target, str) else None
    return doc


def serialize_event(doc):
    out = {
        "id": str(doc["_id"]),
        "session_id": doc["session_id"],
        "type": doc["type"],
        "page_url": doc["page_url"],
        "timestamp": iso(doc["timestamp"]),
    }
    if doc["type"] == "click":
        for key in ("x", "y", "target", "page_width", "page_height"):
            out[key] = doc.get(key)
    return out


def int_arg(name, default, lo, hi):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, value))


# --------------------------------------------------------------------------
# app factory
# --------------------------------------------------------------------------
def create_app(db=None):
    app = Flask(__name__)
    CORS(app)  # the tracker may run on any customer domain

    if db is None:
        db = MongoClient(MONGO_URI, tz_aware=True, serverSelectionTimeoutMS=5000)[DB_NAME]
    events = db["events"]

    try:
        events.create_index([("session_id", ASCENDING), ("timestamp", ASCENDING)])
        events.create_index([("type", ASCENDING), ("page_url", ASCENDING)])
        events.create_index([("timestamp", DESCENDING)])
    except Exception as exc:  # keep booting so the error is visible per request
        app.logger.warning("Could not create indexes (is MongoDB running?): %s", exc)

    # ---- ingestion -------------------------------------------------------
    @app.post("/api/events")
    def ingest():
        # force=True: the tracker posts text/plain so the request stays a
        # CORS "simple request" and can also be sent with navigator.sendBeacon.
        payload = request.get_json(force=True, silent=True)
        if payload is None:
            return jsonify(error="body must be valid JSON"), 400

        if isinstance(payload, dict) and "events" in payload:
            raw_events = payload["events"]
        elif isinstance(payload, list):
            raw_events = payload
        else:
            raw_events = [payload]

        if not isinstance(raw_events, list) or not raw_events:
            return jsonify(error="no events supplied"), 400
        if len(raw_events) > MAX_BATCH:
            return jsonify(error=f"max {MAX_BATCH} events per request"), 413

        docs, rejected = [], []
        for index, raw in enumerate(raw_events):
            try:
                docs.append(validate_event(raw))
            except ValueError as exc:
                rejected.append({"index": index, "error": str(exc)})

        if docs:
            events.insert_many(docs, ordered=False)
        status = 202 if docs else 400
        return jsonify(accepted=len(docs), rejected=rejected), status

    # ---- sessions --------------------------------------------------------
    @app.get("/api/sessions")
    def list_sessions():
        limit = int_arg("limit", 50, 1, 200)
        skip = int_arg("skip", 0, 0, 1_000_000)
        pipeline = [
            {"$sort": {"timestamp": 1}},
            {
                "$group": {
                    "_id": "$session_id",
                    "total_events": {"$sum": 1},
                    "page_views": {"$sum": {"$cond": [{"$eq": ["$type", "page_view"]}, 1, 0]}},
                    "clicks": {"$sum": {"$cond": [{"$eq": ["$type", "click"]}, 1, 0]}},
                    "first_seen": {"$min": "$timestamp"},
                    "last_seen": {"$max": "$timestamp"},
                    "entry_url": {"$first": "$page_url"},
                }
            },
            {"$sort": {"last_seen": -1}},
            {
                "$facet": {
                    "items": [{"$skip": skip}, {"$limit": limit}],
                    "total": [{"$count": "n"}],
                }
            },
        ]
        result = next(events.aggregate(pipeline, allowDiskUse=True), {"items": [], "total": []})
        sessions = []
        for row in result["items"]:
            first, last = row["first_seen"], row["last_seen"]
            sessions.append(
                {
                    "session_id": row["_id"],
                    "total_events": row["total_events"],
                    "page_views": row["page_views"],
                    "clicks": row["clicks"],
                    "first_seen": iso(first),
                    "last_seen": iso(last),
                    "duration_seconds": round((last - first).total_seconds(), 1),
                    "entry_url": row["entry_url"],
                }
            )
        total = result["total"][0]["n"] if result["total"] else 0
        return jsonify(sessions=sessions, total=total, limit=limit, skip=skip)

    @app.get("/api/sessions/<session_id>/events")
    def session_events(session_id):
        docs = list(events.find({"session_id": session_id}).sort([("timestamp", 1), ("_id", 1)]))
        if not docs:
            return jsonify(error="session not found"), 404
        return jsonify(
            session_id=session_id,
            total=len(docs),
            events=[serialize_event(d) for d in docs],
        )

    # ---- heatmap ---------------------------------------------------------
    @app.get("/api/heatmap/pages")
    def heatmap_pages():
        pipeline = [
            {
                "$group": {
                    "_id": "$page_url",
                    "clicks": {"$sum": {"$cond": [{"$eq": ["$type", "click"]}, 1, 0]}},
                    "page_views": {"$sum": {"$cond": [{"$eq": ["$type", "page_view"]}, 1, 0]}},
                }
            },
            {"$sort": {"clicks": -1, "_id": 1}},
        ]
        pages = [
            {"page_url": r["_id"], "clicks": r["clicks"], "page_views": r["page_views"]}
            for r in events.aggregate(pipeline)
        ]
        return jsonify(pages=pages)

    @app.get("/api/heatmap")
    def heatmap():
        url = request.args.get("url", "").strip()
        if not url:
            return jsonify(error="url query parameter is required"), 400
        url = clean_url(url)
        limit = int_arg("limit", MAX_HEATMAP_POINTS, 1, MAX_HEATMAP_POINTS)

        docs = list(
            events.find({"type": "click", "page_url": url})
            .sort("timestamp", -1)
            .limit(limit)
        )
        widths = [d["page_width"] for d in docs if d.get("page_width")]
        heights = [d["page_height"] for d in docs if d.get("page_height")]
        ref_w = median(widths) if widths else 1280.0
        ref_h = median(heights) if heights else 800.0

        points = []
        for d in docs:
            width = d.get("page_width") or ref_w
            points.append(
                {
                    "x": d["x"],
                    "y": d["y"],
                    # x as a share of that visitor's page width, so clicks from
                    # different screen sizes line up on one canvas
                    "nx": max(0.0, min(1.0, d["x"] / width)),
                    "session_id": d["session_id"],
                    "target": d.get("target"),
                }
            )
        return jsonify(
            page_url=url,
            total=len(points),
            unique_sessions=len({d["session_id"] for d in docs}),
            page_width=ref_w,
            page_height=ref_h,
            clicks=points,
        )

    # ---- static: tracker + demo -----------------------------------------
    @app.get("/tracker.js")
    def tracker():
        resp = send_from_directory(
            os.path.join(ROOT_DIR, "tracker"), "tracker.js", mimetype="application/javascript"
        )
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.get("/demo/")
    def demo_index():
        return send_from_directory(os.path.join(ROOT_DIR, "demo"), "index.html")

    @app.get("/demo/<path:filename>")
    def demo_files(filename):
        return send_from_directory(os.path.join(ROOT_DIR, "demo"), filename)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
