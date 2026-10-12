import { useEffect, useMemo, useRef, useState } from "react";
import { getHeatmap, getHeatmapPages } from "../api.js";

const MAX_ASPECT = 4; // cap very long pages so the canvas stays a sane size

export default function HeatmapView() {
  const [pages, setPages] = useState(null);
  const [pageUrl, setPageUrl] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("heat");
  const [showPage, setShowPage] = useState(false);

  useEffect(() => {
    getHeatmapPages()
      .then((d) => {
        const withClicks = d.pages.filter((p) => p.clicks > 0);
        setPages(withClicks);
        if (withClicks.length) setPageUrl(withClicks[0].page_url);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!pageUrl) return;
    let cancelled = false;
    setData(null);
    getHeatmap(pageUrl)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [pageUrl]);

  if (error) return <p className="notice error">{error}</p>;
  if (!pages) return <p className="muted">Loading pages…</p>;
  if (pages.length === 0) {
    return (
      <p className="notice">
        No click data yet. Open <code>http://localhost:5000/demo/</code>, click around, then come back, or run{" "}
        <code>python seed.py</code> in the backend folder.
      </p>
    );
  }

  return (
    <div className="heatmap">
      <section className="panel controls">
        <label className="field">
          <span>Page</span>
          <select value={pageUrl} onChange={(e) => setPageUrl(e.target.value)}>
            {pages.map((p) => (
              <option key={p.page_url} value={p.page_url}>
                {p.page_url.replace(/^https?:\/\//, "")} ({p.clicks} clicks)
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Display</span>
          <div className="segmented" role="group" aria-label="Display style">
            {[
              ["heat", "Heat"],
              ["dots", "Dots"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={mode === id ? "is-active" : ""}
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={showPage} onChange={(e) => setShowPage(e.target.checked)} />
          Show the page underneath
        </label>

        {data && (
          <p className="muted stats">
            {data.total} clicks from {data.unique_sessions} sessions
          </p>
        )}
      </section>

      <section className="panel canvas-panel">
        {data ? (
          <HeatCanvas data={data} mode={mode} showPage={showPage} />
        ) : (
          <p className="muted">Loading clicks…</p>
        )}
      </section>
    </div>
  );
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// 256-step colour ramp: cool blue -> green -> yellow -> red
function buildPalette() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0.0, "#2b6cd9");
  g.addColorStop(0.35, "#1fb59a");
  g.addColorStop(0.6, "#f2d338");
  g.addColorStop(0.8, "#f08a24");
  g.addColorStop(1.0, "#d62b2b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

function HeatCanvas({ data, mode, showPage }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const width = useWidth(wrapRef);

  const refW = data.page_width || 1280;
  const refH = data.page_height || 800;
  const scale = width / refW;
  const height = Math.round(width * Math.min(refH / refW, MAX_ASPECT));

  const points = useMemo(
    () => data.clicks.map((c) => ({ px: c.nx * width, py: c.y * scale })),
    [data, width, scale]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(width * dpr);
    const H = Math.round(height * dpr);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    if (mode === "dots") {
      ctx.scale(dpr, dpr);
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(214, 43, 43, 0.6)";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.stroke();
      }
      return;
    }

    // Heat: stack soft alpha blobs, then colour each pixel by its accumulated alpha.
    const shadow = document.createElement("canvas");
    shadow.width = W;
    shadow.height = H;
    const sctx = shadow.getContext("2d");
    sctx.scale(dpr, dpr);
    const radius = Math.max(18, width * 0.03);
    for (const p of points) {
      const g = sctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, radius);
      g.addColorStop(0, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = g;
      sctx.fillRect(p.px - radius, p.py - radius, radius * 2, radius * 2);
    }
    const img = sctx.getImageData(0, 0, W, H);
    const px = img.data;
    const palette = buildPalette();
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (!a) continue;
      const k = a * 4;
      px[i] = palette[k];
      px[i + 1] = palette[k + 1];
      px[i + 2] = palette[k + 2];
      px[i + 3] = Math.min(235, a * 1.5);
    }
    ctx.putImageData(img, 0, 0);
  }, [points, width, height, mode]);

  return (
    <div className="frame-scroll">
      <div ref={wrapRef} className="frame" style={{ height: height || undefined }}>
        {showPage && width > 0 && (
          <iframe
            title="Page preview"
            src={data.page_url}
            tabIndex={-1}
            style={{
              width: refW,
              height: refH,
              transform: `scale(${scale})`,
            }}
          />
        )}
        <canvas ref={canvasRef} style={{ width, height }} />
      </div>
      {showPage && (
        <p className="muted small">
          If the preview is blank, the site doesn't allow being embedded. The clicks are still placed
          correctly.
        </p>
      )}
    </div>
  );
}
