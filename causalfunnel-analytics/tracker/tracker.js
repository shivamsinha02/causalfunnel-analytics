/*!
 * CausalFunnel tracker
 *
 * Usage:
 *   <script src="https://YOUR-API/tracker.js"></script>
 *   <!-- optional: point at a different API origin -->
 *   <script src="/tracker.js" data-api="https://api.example.com"></script>
 *
 * Tracks: page_view (incl. single-page-app navigations) and click.
 */
(function () {
  "use strict";
  if (window.__cfTrackerLoaded) return;
  window.__cfTrackerLoaded = true;

  var script = document.currentScript;
  var apiBase = "";
  try {
    apiBase =
      (script && script.getAttribute("data-api")) ||
      (script && script.src && new URL(script.src).origin) ||
      "";
  } catch (e) {}
  var ENDPOINT = apiBase.replace(/\/$/, "") + "/api/events";

  var STORAGE_KEY = "cf_session";
  var SESSION_TTL_MS = 30 * 60 * 1000; // a session ends after 30 min of inactivity
  var FLUSH_DELAY_MS = 1000;
  var MAX_BATCH = 20;
  var MAX_QUEUE = 200;

  // ---------------- session id (localStorage, cookie fallback) -------------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var m = document.cookie.match(new RegExp("(?:^|; )" + STORAGE_KEY + "=([^;]*)"));
    if (m) {
      try {
        return JSON.parse(decodeURIComponent(m[1]));
      } catch (e) {}
    }
    return null;
  }

  function writeStore(value) {
    var json = JSON.stringify(value);
    try {
      localStorage.setItem(STORAGE_KEY, json);
      return;
    } catch (e) {}
    document.cookie =
      STORAGE_KEY + "=" + encodeURIComponent(json) + "; path=/; max-age=1800; SameSite=Lax";
  }

  function getSessionId() {
    var now = Date.now();
    var s = readStore();
    if (!s || !s.id || now - s.last > SESSION_TTL_MS) s = { id: uuid(), last: now };
    s.last = now;
    writeStore(s);
    return s.id;
  }

  // ---------------- transport ----------------------------------------------
  var queue = [];
  var timer = null;

  function enqueue(evt) {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(evt);
    if (queue.length >= MAX_BATCH) return flush();
    if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function flush(useBeacon) {
    clearTimeout(timer);
    timer = null;
    if (!queue.length) return;
    var batch = queue.splice(0, MAX_BATCH);
    // text/plain keeps this a CORS "simple request" (no preflight) and works with sendBeacon
    var body = JSON.stringify({ events: batch });

    if (useBeacon === true && navigator.sendBeacon) {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) {
        if (queue.length) flush(true);
        return;
      }
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: body,
      keepalive: true,
    })
      .then(function (res) {
        if (!res.ok && res.status >= 500) throw new Error("server " + res.status);
      })
      .catch(function () {
        queue = batch.concat(queue).slice(-MAX_QUEUE); // retry on next flush
      });
    if (queue.length) timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  // ---------------- event builders -----------------------------------------
  function pageUrl() {
    return location.href.split("#")[0];
  }

  function docSize() {
    var de = document.documentElement,
      b = document.body || {};
    return {
      w: Math.max(de.scrollWidth, b.scrollWidth || 0, de.clientWidth),
      h: Math.max(de.scrollHeight, b.scrollHeight || 0, de.clientHeight),
    };
  }

  function describe(el) {
    if (!el || !el.tagName) return null;
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim())
      s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    return s.slice(0, 120);
  }

  function track(type, extra) {
    var evt = {
      session_id: getSessionId(),
      type: type,
      page_url: pageUrl(),
      timestamp: Date.now(),
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) evt[k] = extra[k];
    enqueue(evt);
  }

  var lastTrackedUrl = null;
  function trackPageView() {
    var url = pageUrl();
    if (url === lastTrackedUrl) return;
    lastTrackedUrl = url;
    track("page_view", {});
  }

  // ---------------- listeners ----------------------------------------------
  document.addEventListener(
    "click",
    function (e) {
      var size = docSize();
      track("click", {
        x: Math.round(e.pageX), // coordinates relative to the whole document
        y: Math.round(e.pageY),
        page_width: size.w,
        page_height: size.h,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        target: describe(e.target),
      });
    },
    true // capture: still fires if the page stops propagation
  );

  // single-page apps: history.pushState / replaceState / back button
  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var ret = orig.apply(this, arguments);
      setTimeout(trackPageView, 0);
      return ret;
    };
  });
  window.addEventListener("popstate", trackPageView);

  // don't lose the queue when the tab is closed or navigated away
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", function () {
    flush(true);
  });

  trackPageView();

  window.CFTracker = {
    sessionId: getSessionId,
    track: track,
    flush: function () {
      flush(false);
    },
  };
})();
