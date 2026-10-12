# CausalFunnel User Analytics

A small full-stack app that tracks user interactions on a webpage and shows them in a dashboard.

- **Tracker**: a vanilla JS script (`tracker/tracker.js`) that records `page_view` and `click` events
- **Backend**: Flask API storing events in MongoDB
- **Dashboard**: React (Vite) app with a Sessions view (user journey) and a Heatmap view

```
demo page + tracker.js  --POST /api/events-->  Flask  -->  MongoDB
                                                 ^
                              React dashboard ---+  (sessions, journey, heatmap)
```

## Tech stack

| Layer     | Choice                                   |
|-----------|------------------------------------------|
| Tracker   | Vanilla JavaScript (no dependencies)     |
| Backend   | Python 3.9+, Flask, Flask-CORS, PyMongo  |
| Database  | MongoDB (single `events` collection)     |
| Dashboard | React 18 + Vite, plain CSS               |

## Setup

Prerequisites: Python 3.9+, Node 18+, and MongoDB (local, Docker, or Atlas).

### 1. MongoDB

```bash
docker compose up -d          # starts MongoDB on localhost:27017
```
Or use an existing instance / Atlas and set `MONGO_URI` in `backend/.env`.

### 2. Backend (http://localhost:5000)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # edit if your Mongo URI differs
python app.py
```

Optional: load sample data so the dashboard isn't empty.
```bash
python seed.py --reset
```

### 3. Dashboard (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```
In dev, Vite proxies `/api` to Flask. For a deployed build, set `VITE_API_URL` to the API origin.

### 4. Try the tracker

Open **http://localhost:5000/demo/**, click around, visit the pricing page, then open the dashboard.
Events are batched and sent about one second after each interaction, so hit **Refresh** on the Sessions tab.

## Adding the tracker to any page

```html
<script src="https://YOUR-API-HOST/tracker.js"></script>
<!-- or, if the script is hosted separately from the API: -->
<script src="/tracker.js" data-api="https://YOUR-API-HOST"></script>
```

Each event contains: `session_id`, `type`, `page_url`, `timestamp` (epoch ms), plus for clicks `x`, `y`
(document/page coordinates), `page_width`, `page_height`, `viewport_width`, `viewport_height`, `target`.

## API

| Method | Path                          | Purpose |
|--------|-------------------------------|---------|
| POST   | `/api/events`                 | Store one event, an array, or `{ "events": [...] }` (max 100). Returns `202 { accepted, rejected }` |
| GET    | `/api/sessions`               | Sessions with `total_events`, `page_views`, `clicks`, `first_seen`, `last_seen`; supports `limit`, `skip` |
| GET    | `/api/sessions/<id>/events`   | All events of one session, ordered by time |
| GET    | `/api/heatmap/pages`          | Pages with click / page view counts |
| GET    | `/api/heatmap?url=<page_url>` | Click points for one page (`x`, `y`, `nx`) plus reference page size |
| GET    | `/tracker.js`, `/demo/`       | Tracker script and demo pages |

Example:
```bash
curl -X POST localhost:5000/api/events -H 'Content-Type: application/json' \
  -d '{"session_id":"abc","type":"click","page_url":"http://localhost:5000/demo/","timestamp":1760000000000,"x":120,"y":340}'
```

## Data model

One document per event in `events`:

```json
{
  "session_id": "6f1c...",
  "type": "click",
  "page_url": "http://localhost:5000/demo/",
  "page_path": "/demo/",
  "timestamp": "ISODate",
  "received_at": "ISODate",
  "x": 412, "y": 880,
  "page_width": 1440, "page_height": 1900,
  "viewport_width": 1440, "viewport_height": 800,
  "target": "a.btn.btn-primary",
  "user_agent": "..."
}
```
Indexes: `(session_id, timestamp)` for journeys, `(type, page_url)` for heatmaps, `(timestamp desc)`.
Sessions are computed with an aggregation (`$group` by `session_id`), so there is no second collection to keep in sync.

## Assumptions and trade-offs

- **Sessions**: a session ID lives in `localStorage` (cookie fallback) and rotates after 30 minutes of inactivity.
- **Click coordinates** are page coordinates (`pageX/pageY`), not viewport coordinates, so scrolling doesn't skew the heatmap.
  `x` is also normalised against the visitor's page width, so clicks from different screen sizes overlay roughly correctly.
  Layouts that change a lot between breakpoints will still blur together; a production version would bucket by device class
  or anchor clicks to DOM elements.
- **URLs**: the `#fragment` is stripped; the query string is kept, so `?a=1` and `?a=2` are separate pages in the heatmap.
- **Transport**: events are batched and posted as `text/plain` JSON. That avoids CORS preflight requests and lets
  `navigator.sendBeacon` flush the queue when the tab closes. The server parses the body as JSON regardless of content type.
- **Sessions aggregation** runs over the whole collection on each request. Fine for a demo and mid-size data; at scale you'd
  maintain a `sessions` collection (upsert on ingest) or use pre-aggregated rollups.
- **No auth, no rate limiting, open CORS**: the ingest endpoint must accept traffic from any site, and the dashboard API is
  unauthenticated. A real deployment needs a site/API key on ingest and login on the read endpoints.
- **Heatmap cap**: at most 10,000 most recent clicks per page are returned.
- **Heatmap background**: the optional "show the page underneath" uses an iframe, so sites that send `X-Frame-Options` won't render.
- Not included: bot filtering, consent banner / GDPR handling, scroll or mouse-move tracking, automated tests.

## Deploying (optional)

- API: `gunicorn app:app` on any host (Render, Railway, Fly) with `MONGO_URI` pointing at Atlas.
- Dashboard: `npm run build` and host `frontend/dist` on Netlify/Vercel with `VITE_API_URL` set.
- Update the `<script>` tag on tracked pages to the deployed API host.

## Project layout

```
backend/    Flask app, seed script
tracker/    tracker.js
demo/       two small pages that include the tracker
frontend/   React dashboard (Vite)
```
