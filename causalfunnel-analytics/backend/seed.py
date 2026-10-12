"""Generate fake sessions so the dashboard has something to show.

    python seed.py            # adds ~40 sessions
    python seed.py --reset    # wipes the events collection first
"""
import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient

from app import DB_NAME, MONGO_URI

BASE = "http://localhost:5000/demo/"
PAGES = {
    BASE: {
        "height": 1900,
        # (x share, y px, spread px, weight, target)
        "hotspots": [
            (0.50, 330, 40, 5, "a.btn.btn-primary"),
            (0.82, 40, 20, 3, "a.nav-link"),
            (0.25, 980, 60, 3, "article.card"),
            (0.75, 980, 60, 2, "article.card"),
            (0.50, 1640, 35, 2, "button.btn.signup"),
        ],
    },
    BASE + "pricing.html": {
        "height": 1400,
        "hotspots": [
            (0.50, 620, 45, 5, "button.btn.choose-plan"),
            (0.20, 560, 40, 2, "button.btn.choose-plan"),
            (0.80, 560, 40, 2, "button.btn.choose-plan"),
            (0.50, 1100, 50, 1, "details.faq"),
        ],
    },
}


def build_session(now):
    sid = str(uuid.uuid4())
    t = now - timedelta(minutes=random.randint(1, 60 * 24 * 3))
    width = random.choice([1280, 1366, 1440, 1536, 1920])
    docs = []
    journey = [BASE] + ([BASE + "pricing.html"] if random.random() < 0.6 else [])
    for url in journey:
        t += timedelta(seconds=random.uniform(2, 8))
        docs.append(_event(sid, "page_view", url, t))
        spec = PAGES[url]
        for _ in range(random.randint(1, 6)):
            t += timedelta(seconds=random.uniform(1, 12))
            hx, hy, spread, _w, target = random.choices(
                spec["hotspots"], weights=[h[3] for h in spec["hotspots"]]
            )[0]
            x = max(0, random.gauss(hx * width, spread))
            y = max(0, random.gauss(hy, spread))
            docs.append(
                _event(sid, "click", url, t, x=float(round(x)), y=float(round(y)),
                       page_width=float(width), page_height=float(spec["height"]),
                       viewport_width=float(width), viewport_height=800.0, target=target)
            )
    return docs


def _event(sid, kind, url, ts, **extra):
    return {
        "session_id": sid,
        "type": kind,
        "page_url": url,
        "page_path": "/" + url.split("/", 3)[-1],
        "timestamp": ts,
        "received_at": ts,
        "user_agent": "seed-script",
        **extra,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--sessions", type=int, default=40)
    args = ap.parse_args()

    col = MongoClient(MONGO_URI, tz_aware=True)[DB_NAME]["events"]
    if args.reset:
        col.delete_many({})
    now = datetime.now(timezone.utc)
    batch = [d for _ in range(args.sessions) for d in build_session(now)]
    col.insert_many(batch)
    print(f"Inserted {len(batch)} events across {args.sessions} sessions.")
