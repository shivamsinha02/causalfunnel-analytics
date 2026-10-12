import { useState } from "react";
import SessionsView from "./components/SessionsView.jsx";
import HeatmapView from "./components/HeatmapView.jsx";

const TABS = [
  { id: "sessions", label: "Sessions" },
  { id: "heatmap", label: "Heatmap" },
];

export default function App() {
  const [tab, setTab] = useState("sessions");

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">CausalFunnel Analytics</h1>
        <nav className="tabs" role="tablist" aria-label="Dashboard views">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={"tab" + (tab === t.id ? " is-active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === "sessions" ? <SessionsView /> : <HeatmapView />}
      </main>
    </div>
  );
}
