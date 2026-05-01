import { useState, useRef, useCallback } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ── CSV Parser ──────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] ?? "");
    return obj;
  }).filter(r => r["Athlete"] || r["#"]);
}

function parseMark(s) {
  if (!s) return null;
  const v = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(v) ? null : v;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function extractYear(season) {
  const m = season?.match(/\((\d{4})\)/);
  return m ? m[1] : season || "Unknown";
}

function extractYearClass(s) {
  return s?.split("-")[0] || s || "?";
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Wind color: positive = tailwind = GREEN, negative = headwind = RED ──
function windToColor(wind, min, max) {
  if (wind === null || isNaN(wind)) return "rgba(255,255,255,0.25)";
  const range = Math.max(Math.abs(min), Math.abs(max), 0.01);
  const n = Math.max(-1, Math.min(1, wind / range)); // -1..1
  if (n >= 0) {
    // zero → white, +max → green
    const t = n;
    const r = Math.round(220 - 180 * t);
    const g = Math.round(220 + 35 * t);
    const b = Math.round(220 - 180 * t);
    return `rgb(${r},${g},${b})`;
  } else {
    // zero → white, -max → red
    const t = -n;
    const r = Math.round(220 + 35 * t);
    const g = Math.round(220 - 180 * t);
    const b = Math.round(220 - 180 * t);
    return `rgb(${r},${g},${b})`;
  }
}

// ── Tooltip ─────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, xMode }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "rgba(8,10,16,0.97)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#ddd",
      fontFamily: "'DM Mono', monospace", lineHeight: 1.8, minWidth: 210,
      boxShadow: "0 12px 40px rgba(0,0,0,0.7)"
    }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 5 }}>{d.Athlete}</div>
      <Row k="Mark"  v={d.Mark} />
      <Row k="Wind"  v={d.Wind ? `${d.Wind} m/s` : "NWI"} col={parseFloat(d.Wind) > 0 ? "#5ae878" : parseFloat(d.Wind) < 0 ? "#e85a5a" : "#aaa"} />
      <Row k="Date"  v={d["Meet Date"]} />
      <Row k="Meet"  v={d.Meet} />
      <Row k="Team"  v={d.Team} />
      <Row k="Class" v={d.Year} />
      <Row k="Conf"  v={d.Conference} />
    </div>
  );
};
const Row = ({ k, v, col }) => (
  <div style={{ display: "flex", gap: 8 }}>
    <span style={{ color: "#555", minWidth: 44 }}>{k}</span>
    <span style={{ color: col || "#ccc" }}>{v}</span>
  </div>
);

// ── Pill toggle group ────────────────────────────────────────────────
function PillGroup({ label, options, selected, onToggle, colorMap }) {
  const all = selected.length === options.length;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 9, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", marginBottom: 7, fontFamily: "'DM Mono', monospace" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        <Pill label="ALL" on={all} col="#e8a45a" onClick={() => onToggle("__all__")} />
        {options.map(opt => (
          <Pill key={opt} label={opt} on={selected.includes(opt)} col={colorMap?.[opt]} onClick={() => onToggle(opt)} />
        ))}
      </div>
    </div>
  );
}
function Pill({ label, on, col, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 10px", borderRadius: 20, cursor: "pointer", fontSize: 10,
      fontFamily: "'DM Mono', monospace", letterSpacing: 0.5, transition: "all 0.12s",
      border: `1px solid ${on ? (col || "rgba(255,255,255,0.5)") : "rgba(255,255,255,0.08)"}`,
      background: on ? (col ? col + "22" : "rgba(255,255,255,0.07)") : "transparent",
      color: on ? (col || "#e8e8e8") : "#444",
    }}>{label}</button>
  );
}

// ── X-axis toggle ────────────────────────────────────────────────────
function XToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
      {["rank", "date"].map(mode => (
        <button key={mode} onClick={() => onChange(mode)} style={{
          padding: "5px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 1.5,
          fontFamily: "'DM Mono', monospace", textTransform: "uppercase", border: "none",
          background: value === mode ? "rgba(232,164,90,0.2)" : "transparent",
          color: value === mode ? "#e8a45a" : "#555",
          borderRight: mode === "rank" ? "1px solid rgba(255,255,255,0.1)" : "none",
          transition: "all 0.12s"
        }}>{mode === "rank" ? "Rank" : "Date"}</button>
      ))}
    </div>
  );
}

const CONF_COLORS = ["#e8a45a","#5ab8e8","#b85ae8","#5ae878","#e85a5a","#e8d85a","#5ae8d8","#e85ab8","#a0e85a","#5a78e8"];

export default function Dashboard() {
  const [allRows, setAllRows]     = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [xMode, setXMode]         = useState("rank"); // "rank" | "date"

  const [selConfs, setSelConfs]       = useState([]);
  const [selYearClass, setSelYearClass] = useState([]);
  const [selSeasons, setSelSeasons]   = useState([]);
  const [selEvents, setSelEvents]     = useState([]);

  const fileRef = useRef();

  const loadFiles = useCallback((files) => {
    const readers = Array.from(files).filter(f => f.name.endsWith(".csv")).map(f =>
      new Promise(res => {
        const r = new FileReader();
        r.onload = e => res({ name: f.name, text: e.target.result });
        r.readAsText(f);
      })
    );
    Promise.all(readers).then(results => {
      const rows = results.flatMap(({ text }) => parseCSV(text));
      setAllRows(prev => {
        const combined = [...prev, ...rows];
        const confs   = [...new Set(combined.map(r => r.Conference).filter(Boolean))];
        const ycls    = [...new Set(combined.map(r => extractYearClass(r.Year)).filter(Boolean))];
        const seasons = [...new Set(combined.map(r => extractYear(r.Season)).filter(Boolean))];
        const events  = [...new Set(combined.map(r => r.Event).filter(Boolean))];
        setSelConfs(confs); setSelYearClass(ycls);
        setSelSeasons(seasons); setSelEvents(events);
        return combined;
      });
      setFileNames(prev => [...prev, ...results.map(r => r.name)]);
    });
  }, []);

  const onDrop = useCallback(e => {
    e.preventDefault(); setIsDragging(false);
    loadFiles(e.dataTransfer.files);
  }, [loadFiles]);

  const allConfs   = [...new Set(allRows.map(r => r.Conference).filter(Boolean))];
  const allYearCls = [...new Set(allRows.map(r => extractYearClass(r.Year)).filter(Boolean))].sort();
  const allSeasons = [...new Set(allRows.map(r => extractYear(r.Season)).filter(Boolean))].sort().reverse();
  const allEvents  = [...new Set(allRows.map(r => r.Event).filter(Boolean))];

  const confColorMap = {};
  allConfs.forEach((c, i) => confColorMap[c] = CONF_COLORS[i % CONF_COLORS.length]);

  function makeToggle(sel, setSel, all) {
    return val => {
      if (val === "__all__") { setSel(sel.length === all.length ? [] : [...all]); return; }
      setSel(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
    };
  }

  const filtered = allRows.filter(r =>
    selConfs.includes(r.Conference) &&
    selYearClass.includes(extractYearClass(r.Year)) &&
    selSeasons.includes(extractYear(r.Season)) &&
    selEvents.includes(r.Event)
  );

  const chartData = filtered.map(r => ({
    ...r,
    markVal:  parseMark(r.Mark),
    windVal:  parseFloat(r.Wind) || 0,
    dateVal:  parseDate(r["Meet Date"]),
    rank:     parseInt(r["#"]) || 0,
  })).filter(r => r.markVal !== null && (xMode === "rank" || r.dateVal !== null));

  // Sort by date if in date mode for cleaner rendering
  if (xMode === "date") chartData.sort((a, b) => a.dateVal - b.dateVal);

  const winds   = chartData.map(r => r.windVal);
  const minWind = Math.min(...winds, 0);
  const maxWind = Math.max(...winds, 0);
  const markMin = chartData.length ? Math.min(...chartData.map(r => r.markVal)) * 0.995 : 0;
  const markMax = chartData.length ? Math.max(...chartData.map(r => r.markVal)) * 1.005 : 10;

  const xKey    = xMode === "rank" ? "rank" : "dateVal";
  const xDomain = xMode === "date" && chartData.length
    ? [Math.min(...chartData.map(r=>r.dateVal)), Math.max(...chartData.map(r=>r.dateVal))]
    : ["auto","auto"];

  return (
    <div style={{
      background: "#07090e", minHeight: "100vh", color: "#e8e8e8",
      fontFamily: "'DM Mono', monospace",
      backgroundImage: "radial-gradient(ellipse at 15% 60%, rgba(20,40,70,0.35) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(60,15,80,0.2) 0%, transparent 50%)"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .drop-zone:hover { border-color: rgba(232,164,90,0.4) !important; background: rgba(232,164,90,0.03) !important; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "26px 32px 0", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(20px,3vw,34px)", fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
            Performance <span style={{ color: "#e8a45a" }}>Analytics</span>
          </div>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, textTransform: "uppercase", marginTop: 5 }}>
            TFRRS Track & Field · {allRows.length} records
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {fileNames.map((n, i) => (
            <span key={i} style={{ fontSize: 9, color: "#555", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 4 }}>{n}</span>
          ))}
          <button onClick={() => fileRef.current.click()} style={{
            background: "rgba(232,164,90,0.1)", border: "1px solid rgba(232,164,90,0.25)",
            color: "#e8a45a", padding: "6px 14px", borderRadius: 5, cursor: "pointer",
            fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: 2, textTransform: "uppercase"
          }}>+ Load CSV</button>
          <input ref={fileRef} type="file" accept=".csv" multiple style={{ display:"none" }} onChange={e => loadFiles(e.target.files)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 0, padding: "20px 32px 32px", minHeight: "calc(100vh - 80px)" }}>

        {/* Sidebar */}
        <div style={{ paddingRight: 22, borderRight: "1px solid rgba(255,255,255,0.05)", overflowY: "auto" }}>
          {allRows.length === 0 ? (
            <div
              className="drop-zone"
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${isDragging ? "rgba(232,164,90,0.5)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 10, padding: "44px 16px", textAlign: "center",
                cursor: "pointer", marginTop: 24, transition: "all 0.2s"
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 10, opacity: 0.3 }}>📂</div>
              <div style={{ fontSize: 10, color: "#555", lineHeight: 1.8 }}>Drop CSV files here<br />or click to browse</div>
            </div>
          ) : (
            <div style={{ paddingTop: 2 }}>
              {allConfs.length > 0    && <PillGroup label="Conference" options={allConfs} selected={selConfs} onToggle={makeToggle(selConfs, setSelConfs, allConfs)} colorMap={confColorMap} />}
              {allYearCls.length > 0  && <PillGroup label="Year Class" options={allYearCls} selected={selYearClass} onToggle={makeToggle(selYearClass, setSelYearClass, allYearCls)} />}
              {allSeasons.length > 0  && <PillGroup label="Season" options={allSeasons} selected={selSeasons} onToggle={makeToggle(selSeasons, setSelSeasons, allSeasons)} />}
              {allEvents.length > 0   && <PillGroup label="Event" options={allEvents} selected={selEvents} onToggle={makeToggle(selEvents, setSelEvents, allEvents)} />}

              {/* Wind legend — corrected: positive = tailwind = green */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 9, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>Wind (bubble color)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 9, color: "#e85a5a", whiteSpace: "nowrap" }}>← headwind</span>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: "linear-gradient(to right, rgb(255,40,40), rgb(220,220,220), rgb(40,255,80))" }} />
                  <span style={{ fontSize: 9, color: "#5ae878", whiteSpace: "nowrap" }}>tailwind →</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 8, color: "#444" }}>{minWind.toFixed(1)}</span>
                  <span style={{ fontSize: 8, color: "#444" }}>0</span>
                  <span style={{ fontSize: 8, color: "#444" }}>+{maxWind.toFixed(1)}</span>
                </div>
              </div>

              {/* Stats */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 9, letterSpacing: 2.5, color: "#444", textTransform: "uppercase", marginBottom: 9 }}>Filtered</div>
                {[
                  ["Athletes",    chartData.length],
                  ["Conferences", [...new Set(chartData.map(r=>r.Conference))].length],
                  ["Teams",       [...new Set(chartData.map(r=>r.Team))].length],
                  ["Best Mark",   chartData.length ? Math.max(...chartData.map(r=>r.markVal)).toFixed(2)+"m" : "—"],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:10, color:"#555" }}>{k}</span>
                    <span style={{ fontSize:10, color:"#ccc" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div style={{ paddingLeft: 26 }}>
          {chartData.length === 0 ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#333", fontSize:12 }}>
              {allRows.length === 0 ? "Load a CSV to begin" : "No data matches current filters"}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14, display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:10 }}>
                <div>
                  <div style={{ fontFamily:"'Syne', sans-serif", fontSize:16, fontWeight:700, color:"#fff" }}>
                    {[...new Set(chartData.map(r=>r.Event))].join(" · ")}
                  </div>
                  <div style={{ fontSize:9, color:"#444", letterSpacing:2, marginTop:3 }}>
                    {[...new Set(chartData.map(r=>r.Gender))].join("/")} · {[...new Set(chartData.map(r=>extractYear(r.Season)))].sort().reverse().join(", ")} · {chartData.length} performances
                  </div>
                </div>
                <XToggle value={xMode} onChange={setXMode} />
              </div>

              <ResponsiveContainer width="100%" height={500}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey={xKey}
                    type="number"
                    domain={xDomain}
                    scale={xMode === "date" ? "time" : "auto"}
                    tick={{ fill:"#444", fontSize:9, fontFamily:"'DM Mono', monospace" }}
                    tickFormatter={xMode === "date" ? (v) => {
                      const d = new Date(v);
                      return `${d.toLocaleString("en",{month:"short"})} ${d.getFullYear()}`;
                    } : undefined}
                    label={{ value: xMode === "rank" ? "Rank" : "Meet Date", position:"insideBottom", offset:-22, fill:"#444", fontSize:9, fontFamily:"'DM Mono', monospace" }}
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <YAxis
                    dataKey="markVal"
                    type="number"
                    domain={[markMin, markMax]}
                    tick={{ fill:"#444", fontSize:9, fontFamily:"'DM Mono', monospace" }}
                    tickFormatter={v => v.toFixed(2)+"m"}
                    label={{ value:"Mark (m)", angle:-90, position:"insideLeft", offset:12, fill:"#444", fontSize:9, fontFamily:"'DM Mono', monospace" }}
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <Tooltip content={<CustomTooltip xMode={xMode} />} cursor={{ fill:"rgba(255,255,255,0.02)" }} />
                  <Scatter data={chartData} name="Performances">
                    {chartData.map((d, i) => (
                      <Cell key={i}
                        fill={windToColor(d.windVal, minWind, maxWind)}
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth={0.5}
                        r={7}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>

              {/* Conf legend */}
              {[...new Set(chartData.map(r=>r.Conference))].length > 1 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:14, marginTop:4, paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                  {[...new Set(chartData.map(r=>r.Conference))].map(c => (
                    <div key={c} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:confColorMap[c]||"#888" }} />
                      <span style={{ fontSize:9, color:"#555" }}>{c}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
