const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function get(path, params) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`);
  } catch {
    throw new Error("Can't reach the API. Check that the Flask server is running.");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const getSessions = (params) => get("/api/sessions", params);
export const getSessionEvents = (id) => get(`/api/sessions/${encodeURIComponent(id)}/events`);
export const getHeatmapPages = () => get("/api/heatmap/pages");
export const getHeatmap = (url) => get("/api/heatmap", { url });
