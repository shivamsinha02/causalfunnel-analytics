import { useCallback, useEffect, useState } from "react";
import { getSessions, getSessionEvents } from "../api.js";
import { fmtAgo, fmtDateTime, fmtDuration, fmtOffset, pathOf, shortId } from "../format.js";

export default function SessionsView() {
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSessions({ limit: 100 });
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="split">
      <section className="panel list-panel" aria-label="Sessions">
        <div className="panel-head">
          <div>
            <h2>Sessions</h2>
            <p className="muted">
              {total} total{total > sessions.length ? `, showing latest ${sessions.length}` : ""}
            </p>
          </div>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && <p className="notice error">{error}</p>}
        {!error && !loading && sessions.length === 0 && (
          <p className="notice">
            No sessions yet. Open the demo page at <code>http://localhost:5000/demo/</code> and click
            around, or run <code>python seed.py</code> in the backend folder.
          </p>
        )}

        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.session_id}>
              <button
                className={"session" + (selected === s.session_id ? " is-selected" : "")}
                onClick={() => setSelected(s.session_id)}
                aria-pressed={selected === s.session_id}
              >
                <span className="session-top">
                  <span className="session-id">{shortId(s.session_id)}</span>
                  <span className="count" title="Total events">
                    {s.total_events} events
                  </span>
                </span>
                <span className="session-meta">
                  {s.page_views} views · {s.clicks} clicks · {fmtDuration(s.duration_seconds)}
                </span>
                <span className="session-meta">
                  {pathOf(s.entry_url)} · {fmtAgo(s.last_seen)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel detail-panel" aria-label="User journey">
        {selected ? (
          <Journey key={selected} sessionId={selected} />
        ) : (
          <div className="empty">
            <h2>Pick a session</h2>
            <p className="muted">Select a session on the left to see what the visitor did, in order.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Journey({ sessionId }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSessionEvents(sessionId)
      .then((d) => !cancelled && setEvents(d.events))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) return <p className="notice error">{error}</p>;
  if (!events) return <p className="muted">Loading journey…</p>;

  const start = new Date(events[0].timestamp).getTime();

  return (
    <>
      <div className="panel-head">
        <div>
          <h2>Journey</h2>
          <p className="muted mono-id">{sessionId}</p>
        </div>
        <p className="muted">{events.length} events</p>
      </div>

      <ol className="timeline">
        {events.map((e) => {
          const isClick = e.type === "click";
          return (
            <li key={e.id} className={"step " + (isClick ? "step-click" : "step-view")}>
              <div className="step-main">
                <span className="step-title">{isClick ? "Clicked" : "Viewed page"}</span>
                <span className="step-url" title={e.page_url}>
                  {pathOf(e.page_url)}
                </span>
                {isClick && (
                  <span className="step-detail">
                    at x {Math.round(e.x)}, y {Math.round(e.y)}
                    {e.target ? ` on ${e.target}` : ""}
                  </span>
                )}
              </div>
              <div className="step-time">
                <span>{fmtOffset(new Date(e.timestamp).getTime() - start)}</span>
                <span className="muted">{fmtDateTime(e.timestamp)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
