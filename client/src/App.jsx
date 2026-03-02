import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

// ── Tag editor: comma-separated list of removable tags ────────────────────
function TagEditor({ values, onChange, color = "" }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {values.map((v, i) => (
          <span key={i} className={`tag ${color}`} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            {v}
            <span onClick={() => onChange(values.filter((_, j) => j !== i))}
              style={{ opacity: 0.6, fontWeight: 700, fontSize: 12, lineHeight: 1 }}>×</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" style={{ flex: 1 }} placeholder="Type and press Enter or Add"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button className="btn-ghost" onClick={add} style={{ whiteSpace: "nowrap" }}>Add</button>
      </div>
    </div>
  );
}

// ── Edit Record Modal ──────────────────────────────────────────────────────
function EditRecordModal({ record, onClose, onSave }) {
  const [form, setForm] = useState({
    visit_date: record.visit_date || "",
    clinic: record.clinic || "",
    vet: record.vet || "",
    total_cost: record.total_cost || "",
    notes: record.notes || "",
    reminder_date: record.reminder_date || "",
    services: record.services || [],
    medications: record.medications || [],
  });
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card fade-in" style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Edit Record</div>
          <button className="btn-ghost" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Visit date */}
          <div>
            <label style={labelStyle}>Visit Date</label>
            <input className="input" type="date" value={form.visit_date}
              onChange={e => set("visit_date", e.target.value)} />
          </div>

          {/* Clinic + Vet */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Clinic</label>
              <input className="input" placeholder="Clinic name" value={form.clinic}
                onChange={e => set("clinic", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Veterinarian</label>
              <input className="input" placeholder="Vet name" value={form.vet}
                onChange={e => set("vet", e.target.value)} />
            </div>
          </div>

          {/* Total cost */}
          <div>
            <label style={labelStyle}>Total Cost</label>
            <input className="input" placeholder="$0.00" value={form.total_cost}
              onChange={e => set("total_cost", e.target.value)} />
          </div>

          {/* Services */}
          <div>
            <label style={labelStyle}>Services</label>
            <TagEditor values={form.services} onChange={v => set("services", v)} />
          </div>

          {/* Medications */}
          <div>
            <label style={labelStyle}>Medications</label>
            <TagEditor values={form.medications} onChange={v => set("medications", v)} color="tag-blue" />
          </div>

          {/* Reminder date */}
          <div>
            <label style={labelStyle}>Reminder Date</label>
            <input className="input" type="date" value={form.reminder_date}
              onChange={e => set("reminder_date", e.target.value)} />
            <div style={{ fontSize: 11, color: "#5a5550", fontFamily: "DM Mono, monospace", marginTop: 4 }}>
              Leave blank to remove reminder
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea className="input" rows={3} placeholder="Diagnoses, findings, instructions…"
              value={form.notes} onChange={e => set("notes", e.target.value)}
              style={{ resize: "vertical", fontFamily: "inherit" }} />
          </div>

        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontFamily: "DM Mono, monospace",
  color: "#5a5550",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 6,
};

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [pets, setPets]           = useState([]);
  const [records, setRecords]     = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState("dashboard");
  const [selectedPet, setSelectedPet]   = useState(null);
  const [scanning, setScanning]         = useState(false);
  const [scanResult, setScanResult]     = useState(null);
  const [scanError, setScanError]       = useState(null);
  const [dragOver, setDragOver]         = useState(false);
  const [addPetOpen, setAddPetOpen]     = useState(false);
  const [editRecord, setEditRecord]     = useState(null);
  const [newPet, setNewPet]     = useState({ name: "", type: "dog", breed: "", birthdate: "" });
  const [notification, setNotification] = useState(null);
  const [saving, setSaving]     = useState(false);
  const fileRef = useRef();

  const refresh = async () => {
    try {
      const [p, r, rem] = await Promise.all([
        api("/api/pets"), api("/api/records"), api("/api/reminders"),
      ]);
      setPets(p); setRecords(r); setReminders(rem);
    } catch (e) {
      notify("Failed to load data: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setScanning(true); setScanResult(null); setScanError(null); setView("scan");
    try {
      const form = new FormData();
      form.append("file", file);
      setScanResult(await api("/api/scan", { method: "POST", body: form }));
    } catch (e) { setScanError(e.message); }
    finally { setScanning(false); }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  const confirmScan = async () => {
    if (!scanResult || saving) return;
    setSaving(true);
    try {
      const r = scanResult;
      let pet = pets.find(p => p.name.toLowerCase() === (r.petName || "").toLowerCase());
      if (!pet && r.petName) {
        pet = await api("/api/pets", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: r.petName, type: r.petType || "dog" }),
        });
      }
      const record = await api("/api/records", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pet_id: pet?.id || null, pet_name: r.petName, visit_date: r.visitDate,
          clinic: r.clinic, vet: r.vet, services: r.services || [],
          medications: r.medications || [], total_cost: r.totalCost,
          notes: r.notes, source_file: r.sourceFile,
        }),
      });
      await refresh();
      setScanResult(null); setView("dashboard");
      notify(`✓ Record saved${record.reminder_date ? ` · Reminder set for ${formatDate(record.reminder_date)}` : ""}`);
    } catch (e) { notify("Failed to save: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  // ── Save edited record ───────────────────────────────────────────────────
  const saveEditedRecord = async (form) => {
    try {
      await api(`/api/records/${editRecord.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await refresh();
      notify("✓ Record updated");
    } catch (e) {
      notify("Failed to update: " + e.message, "error");
      throw e;
    }
  };

  const addPet = async () => {
    if (!newPet.name.trim()) return;
    try {
      await api("/api/pets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPet),
      });
      await refresh();
      setNewPet({ name: "", type: "dog", breed: "", birthdate: "" });
      setAddPetOpen(false);
      notify("Pet added!");
    } catch (e) { notify("Failed to add pet: " + e.message, "error"); }
  };

  const dismissReminder = async (id) => {
    try {
      await api(`/api/reminders/${id}/dismiss`, { method: "PATCH" });
      setReminders(r => r.filter(x => x.id !== id));
    } catch (e) { notify("Failed to dismiss: " + e.message, "error"); }
  };

  const petRecords = (petId) => records.filter(r => r.pet_id === petId);
  const upcomingCount = reminders.filter(r => daysUntil(r.due_date) <= 60).length;

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e8e4dc",
      fontFamily: "'Crimson Pro', Georgia, serif", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0f1117; } ::-webkit-scrollbar-thumb { background: #3a3530; border-radius: 2px; }
        .nav-btn { background: none; border: none; color: #8a8278; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.1em; cursor: pointer; padding: 6px 12px; border-radius: 4px; transition: all 0.2s; text-transform: uppercase; }
        .nav-btn:hover { color: #e8c97e; background: rgba(232,201,126,0.08); } .nav-btn.active { color: #e8c97e; }
        .card { background: #181c24; border: 1px solid #2a2620; border-radius: 12px; padding: 20px; }
        .btn-primary { background: #e8c97e; color: #0f1117; border: none; padding: 10px 22px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; letter-spacing: 0.05em; transition: all 0.2s; }
        .btn-primary:hover:not(:disabled) { background: #f0d898; transform: translateY(-1px); } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-ghost { background: none; border: 1px solid #2a2620; color: #8a8278; padding: 8px 18px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; letter-spacing: 0.05em; transition: all 0.2s; }
        .btn-ghost:hover { border-color: #e8c97e; color: #e8c97e; }
        .btn-edit { background: none; border: 1px solid #2a2620; color: #6a6560; padding: 4px 10px; border-radius: 6px; font-family: 'DM Mono', monospace; font-size: 10px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.05em; }
        .btn-edit:hover { border-color: #e8c97e; color: #e8c97e; }
        .tag { display: inline-block; background: rgba(232,201,126,0.1); border: 1px solid rgba(232,201,126,0.2); color: #e8c97e; padding: 3px 10px; border-radius: 20px; font-family: 'DM Mono', monospace; font-size: 10px; }
        .tag-blue { background: rgba(100,160,220,0.1); border-color: rgba(100,160,220,0.2); color: #7ab0e0; }
        .tag-red  { background: rgba(220,100,100,0.1); border-color: rgba(220,100,100,0.2); color: #e07a7a; }
        .input { background: #0f1117; border: 1px solid #2a2620; color: #e8e4dc; padding: 9px 14px; border-radius: 8px; font-family: 'Crimson Pro', serif; font-size: 15px; width: 100%; outline: none; transition: border 0.2s; }
        .input:focus { border-color: #e8c97e; } .input::placeholder { color: #4a4540; } select.input option { background: #181c24; }
        .pet-card { background: #181c24; border: 1px solid #2a2620; border-radius: 12px; padding: 18px; cursor: pointer; transition: all 0.2s; }
        .pet-card:hover { border-color: #e8c97e; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .record-row { border-bottom: 1px solid #1e2230; padding: 16px 0; }
        .record-row:last-child { border-bottom: none; }
        .pulse { animation: pulse 2s infinite; } @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        .fade-in { animation: fadeIn 0.3s ease; } @keyframes fadeIn { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none} }
        .drop-zone { border: 2px dashed #3a3530; border-radius: 16px; padding: 48px; text-align: center; transition: all 0.2s; cursor: pointer; }
        .drop-zone:hover, .drop-zone.over { border-color: #e8c97e; background: rgba(232,201,126,0.04); }
        .notif { position: fixed; bottom: 24px; right: 24px; background: #1e2a1e; border: 1px solid #3a5a3a; color: #8fd48f; padding: 12px 20px; border-radius: 10px; font-family: 'DM Mono', monospace; font-size: 12px; z-index: 999; animation: fadeIn 0.3s ease; max-width: 360px; }
        .notif.error { background: #2a1e1e; border-color: #5a3a3a; color: #e07a7a; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,201,126,0.04) 0%, transparent 70%)" }} />
      </div>

      {notification && <div className={`notif ${notification.type === "error" ? "error" : ""}`}>{notification.msg}</div>}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2230", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setView("dashboard")}>
          <span style={{ fontSize: 22 }}>🐾</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>PawChart</div>
            <div style={{ fontSize: 11, color: "#5a5550", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em" }}>VET RECORDS & REMINDERS</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {[["dashboard","Dashboard"],["reminders",`Reminders${upcomingCount ? ` (${upcomingCount})` : ""}`]].map(([v, label]) => (
            <button key={v} className={`nav-btn ${view === v ? "active" : ""}`} onClick={() => setView(v)}>{label}</button>
          ))}
        </nav>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", position: "relative", zIndex: 1 }}>

        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#5a5550" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }} className="pulse">🐾</div>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, letterSpacing: "0.1em" }}>LOADING…</div>
          </div>
        )}

        {/* DASHBOARD */}
        {!loading && view === "dashboard" && (
          <div className="fade-in">
            <div className={`drop-zone ${dragOver ? "over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
              onClick={() => fileRef.current.click()}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 18, color: "#c8c4bc", marginBottom: 6 }}>Drop a vet receipt here to scan</div>
              <div style={{ fontSize: 13, color: "#5a5550", fontFamily: "DM Mono, monospace" }}>Photos & PDFs · AI extracts all details automatically</div>
            </div>

            <div style={{ marginTop: 36 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontFamily: "DM Mono, monospace", color: "#5a5550", letterSpacing: "0.1em", textTransform: "uppercase" }}>Your Pets</div>
                <button className="btn-ghost" onClick={() => setAddPetOpen(true)}>+ Add Pet</button>
              </div>
              {pets.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#4a4540", fontStyle: "italic" }}>No pets yet — scan a receipt to auto-add, or add one manually.</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                {pets.map(pet => {
                  const pr = petRecords(pet.id);
                  const nextReminder = reminders.filter(r => r.pet_id === pet.id).sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
                  const d = nextReminder ? daysUntil(nextReminder.due_date) : null;
                  return (
                    <div key={pet.id} className="pet-card" onClick={() => { setSelectedPet(pet); setView("pet"); }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>{pet.type === "cat" ? "🐱" : "🐶"}</div>
                      <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 2 }}>{pet.name}</div>
                      <div style={{ fontSize: 13, color: "#6a6560", marginBottom: 12, fontStyle: "italic" }}>{pet.breed || pet.type}</div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#5a5550" }}>{pr.length} visit{pr.length !== 1 ? "s" : ""}</div>
                      {d !== null && (
                        <div style={{ marginTop: 8 }}>
                          <span className={`tag ${d <= 0 ? "tag-red" : d <= 14 ? "tag-red" : d <= 30 ? "" : "tag-blue"}`}>
                            {d <= 0 ? "Overdue!" : `Due in ${d}d`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {records.length > 0 && (
              <div style={{ marginTop: 36 }}>
                <div style={{ fontSize: 13, fontFamily: "DM Mono, monospace", color: "#5a5550", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Recent Visits</div>
                <div className="card">
                  {records.slice(0, 5).map(r => (
                    <div key={r.id} className="record-row">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 3 }}>{r.pet_name || "Unknown"}</div>
                          <div style={{ fontSize: 13, color: "#8a8278", marginBottom: 8 }}>{r.clinic || "Unknown clinic"} · {formatDate(r.visit_date)}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(r.services || []).slice(0, 3).map((s, i) => <span key={i} className="tag">{s}</span>)}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          {r.total_cost && <div style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: "#8a8278" }}>{r.total_cost}</div>}
                          {r.reminder_date && (
                            <span className={`tag ${daysUntil(r.reminder_date) <= 14 ? "tag-red" : "tag-blue"}`}>🔔 {formatDate(r.reminder_date)}</span>
                          )}
                          <button className="btn-edit" onClick={() => setEditRecord(r)}>Edit</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PET DETAIL */}
        {!loading && view === "pet" && selectedPet && (
          <div className="fade-in">
            <button className="btn-ghost" style={{ marginBottom: 24 }} onClick={() => setView("dashboard")}>← Back</button>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <div style={{ fontSize: 48 }}>{selectedPet.type === "cat" ? "🐱" : "🐶"}</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{selectedPet.name}</div>
                <div style={{ color: "#6a6560", fontStyle: "italic" }}>
                  {selectedPet.breed || selectedPet.type}{selectedPet.birthdate ? ` · Born ${formatDate(selectedPet.birthdate)}` : ""}
                </div>
              </div>
            </div>
            {petRecords(selectedPet.id).length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#4a4540", fontStyle: "italic" }}>No records yet.</div>
            ) : (
              <div className="card">
                {petRecords(selectedPet.id).map(r => (
                  <div key={r.id} className="record-row">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 6 }}>
                          <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#8a8278" }}>{formatDate(r.visit_date)}</div>
                          {r.clinic && <div style={{ fontSize: 14, color: "#c8c4bc" }}>{r.clinic}</div>}
                          {r.vet && <div style={{ fontSize: 13, color: "#6a6560", fontStyle: "italic" }}>Dr. {r.vet}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          {(r.services || []).map((s, i) => <span key={i} className="tag">{s}</span>)}
                          {(r.medications || []).map((m, i) => <span key={i} className="tag tag-blue">{m}</span>)}
                        </div>
                        {r.notes && <div style={{ fontSize: 13, color: "#7a7570", fontStyle: "italic" }}>{r.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right", paddingLeft: 16, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        {r.total_cost && <div style={{ fontFamily: "DM Mono, monospace", fontSize: 14, color: "#e8c97e" }}>{r.total_cost}</div>}
                        {r.reminder_date && (
                          <span className={`tag ${daysUntil(r.reminder_date) <= 0 ? "tag-red" : daysUntil(r.reminder_date) <= 30 ? "" : "tag-blue"}`}>
                            🔔 {formatDate(r.reminder_date)}
                          </span>
                        )}
                        <button className="btn-edit" onClick={() => setEditRecord(r)}>Edit</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCAN */}
        {view === "scan" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Scanning Receipt</div>
            </div>
            {scanning && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }} className="pulse">🔍</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#5a5550", letterSpacing: "0.1em" }}>AI IS READING YOUR DOCUMENT…</div>
              </div>
            )}
            {scanError && (
              <div style={{ background: "rgba(220,100,100,0.08)", border: "1px solid rgba(220,100,100,0.2)", borderRadius: 12, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                <div style={{ color: "#e07a7a", marginBottom: 16 }}>{scanError}</div>
                <button className="btn-ghost" onClick={() => setView("dashboard")}>← Try Again</button>
              </div>
            )}
            {scanResult && !scanning && (
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#8fd48f" }}>✓ Receipt read — review & confirm</div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    {[["Pet", scanResult.petName],["Type", scanResult.petType],["Date", formatDate(scanResult.visitDate)],
                      ["Clinic", scanResult.clinic],["Vet", scanResult.vet],["Total", scanResult.totalCost]]
                      .filter(([, v]) => v).map(([label, val]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "#5a5550", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 16, color: "#c8c4bc" }}>{val}</div>
                        </div>
                      ))}
                  </div>
                  {scanResult.services?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={labelStyle}>Services</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{scanResult.services.map((s, i) => <span key={i} className="tag">{s}</span>)}</div>
                    </div>
                  )}
                  {scanResult.medications?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={labelStyle}>Medications</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{scanResult.medications.map((m, i) => <span key={i} className="tag tag-blue">{m}</span>)}</div>
                    </div>
                  )}
                  {scanResult.notes && <div style={{ paddingTop: 12, borderTop: "1px solid #2a2620", fontSize: 14, color: "#7a7570", fontStyle: "italic" }}>{scanResult.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn-primary" onClick={confirmScan} disabled={saving}>{saving ? "Saving…" : "Save Record"}</button>
                  <button className="btn-ghost" onClick={() => { setScanResult(null); setView("dashboard"); }}>Discard</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* REMINDERS */}
        {!loading && view === "reminders" && (
          <div className="fade-in">
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Upcoming Reminders</div>
            {reminders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#4a4540", fontStyle: "italic" }}>No active reminders. Scan vet receipts to generate them automatically.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {reminders.map(r => {
                  const d = daysUntil(r.due_date);
                  return (
                    <div key={r.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 3 }}>
                          {r.pet_display_name || r.pet_name} {r.pet_type === "cat" ? "🐱" : "🐶"}
                        </div>
                        <div style={{ fontSize: 14, color: "#8a8278", marginBottom: 4 }}>{r.label}</div>
                        <div style={{ fontSize: 12, fontFamily: "DM Mono, monospace", color: "#5a5550" }}>Due {formatDate(r.due_date)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className={`tag ${d <= 0 ? "tag-red" : d <= 14 ? "tag-red" : d <= 30 ? "" : "tag-blue"}`}>
                          {d <= 0 ? "Overdue!" : d === 1 ? "Tomorrow!" : `${d} days`}
                        </span>
                        <button className="btn-ghost" style={{ fontSize: 10, padding: "5px 12px" }} onClick={() => dismissReminder(r.id)}>Dismiss</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Pet Modal */}
      {addPetOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setAddPetOpen(false); }}>
          <div className="card fade-in" style={{ width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Add a Pet</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="input" placeholder="Pet's name" value={newPet.name} onChange={e => setNewPet(p => ({ ...p, name: e.target.value }))} />
              <select className="input" value={newPet.type} onChange={e => setNewPet(p => ({ ...p, type: e.target.value }))}>
                <option value="dog">Dog</option><option value="cat">Cat</option><option value="other">Other</option>
              </select>
              <input className="input" placeholder="Breed (optional)" value={newPet.breed} onChange={e => setNewPet(p => ({ ...p, breed: e.target.value }))} />
              <label style={labelStyle}>Birthdate (optional)</label>
              <input className="input" type="date" value={newPet.birthdate} onChange={e => setNewPet(p => ({ ...p, birthdate: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn-primary" onClick={addPet}>Add Pet</button>
              <button className="btn-ghost" onClick={() => setAddPetOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editRecord && (
        <EditRecordModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSave={saveEditedRecord}
        />
      )}
    </div>
  );
}
