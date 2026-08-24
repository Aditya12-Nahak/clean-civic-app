/* ═══════════════════════════════════════════════════════════
   CLEAN CIVIC — app.js  (Final Production Build)
   Backend : http://localhost:8080
   Frontend: http://127.0.0.1:5500

   KEY FACTS FROM BACKEND:
   ─ POST /api/auth/login   → 200 OK on success, 500 on wrong creds (RuntimeException)
   ─ POST /api/auth/register→ 201 on success
   ─ JWT claims: sub=email, userId, role
   ─ /assign requires role=VOLUNTEER in DB (backend checks)
   ─ Points awarded on /verify: LOW=10, MEDIUM=20, HIGH=30, CRITICAL=50
   ─ Points go to the REPORTER (citizen who submitted the report)
   ─ No /leaderboard endpoint → derive from report data
   ═══════════════════════════════════════════════════════════ */

"use strict";

/* ── Constants ─────────────────────────────────────────────── */
const API_BASE         = "http://localhost:8080";
const INDIA_CENTER     = [20.5937, 78.9629];
const DONE_STATUSES    = new Set(["VERIFIED","RESOLVED"]);
const SEVERITY_POINTS  = { LOW: 10, MEDIUM: 20, HIGH: 30, CRITICAL: 50 };

/* ── Global state ───────────────────────────────────────────── */
let currentUser        = null;   // AuthResponse from backend
let volunteerMode      = false;  // UI-only toggle (same userId/token)
let map                = null;
let reportLayer        = null;   // Single L.layerGroup — never recreated
let tempMarker         = null;
let allReports         = [];
let modalLat           = null;
let modalLng           = null;
let activeStatusFilter = "all";
let activeSevFilter    = "all";
let activeAdminTab     = "pending";
let searchTimer        = null;

/* ═══════════════════════════════════════════════════════════
   SAFE API REQUEST
   ─ Never throws "Unexpected end of JSON"
   ─ Login/register 401/500 → "Invalid email or password"
   ─ Authenticated 401 → session expired (clear state)
   ─ All other errors → surface message from backend
   ═══════════════════════════════════════════════════════════ */
async function api(url, options = {}, isAuthEndpoint = false) {
  const headers = { ...(options.headers || {}) };

  // Attach JWT for every non-auth request
  if (!isAuthEndpoint && currentUser?.token) {
    headers["Authorization"] = `Bearer ${currentUser.token}`;
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkErr) {
    throw new Error("Unable to connect to the backend.");
  }

  // Read body safely
  const text = await response.text();
  let data = null;
  if (text && text.trim()) {
    try { data = JSON.parse(text); }
    catch { data = { message: text }; }
  }

  if (!response.ok) {
    // ── 401 handling
    if (response.status === 401) {
      if (isAuthEndpoint) {
        // Wrong credentials at login
        throw new Error("Invalid email or password. Please try again.");
      } else {
        // Real token expiry on a protected endpoint
        _clearSession();
        showToast("Your session has expired. Please login again.", "error");
        renderAuthState();
        throw new Error("__SESSION_EXPIRED__");
      }
    }

    // Spring Boot RuntimeException comes back as 500 with message in body
    // For auth endpoints treat any non-2xx as "bad credentials"
    if (isAuthEndpoint) {
      const msg = data?.message || data?.error || "Invalid email or password.";
      throw new Error(msg);
    }

    if (response.status === 403) throw new Error("You do not have permission for this action.");
    if (response.status === 404) throw new Error(data?.message || "Resource not found.");
    throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
  }

  return data;
}

function _clearSession() {
  currentUser   = null;
  volunteerMode = false;
  allReports    = [];
  localStorage.removeItem("cleanCivicUser");
}

/* ═══════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════ */
function showToast(msg, type = "info", ms = 4000) {
  const icons = { success:"✅", error:"❌", info:"ℹ️", warn:"⚠️" };
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||"ℹ️"}</span><span class="toast-msg">${esc(msg)}</span>`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => {
    el.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ═══════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════ */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function setLoading(btnId, on) {
  const b = document.getElementById(btnId);
  if (!b) return;
  b.disabled = on;
  b.querySelector(".btn-text")?.classList.toggle("hidden", on);
  b.querySelector(".btn-spinner")?.classList.toggle("hidden", !on);
}

function setText(sel, val) {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
}

function statusLabel(s) {
  return { PENDING:"Pending", ASSIGNED:"Assigned", IN_PROGRESS:"Cleanup in Progress",
           CLEANUP_SUBMITTED:"Awaiting Verification", VERIFIED:"Verified ✓",
           RESOLVED:"Resolved ✓", REJECTED:"Rejected" }[s] || s;
}

/* ═══════════════════════════════════════════════════════════
   STORED SESSION
   ═══════════════════════════════════════════════════════════ */
function loadStoredUser() {
  try {
    const s = localStorage.getItem("cleanCivicUser");
    if (!s) return;
    const p = JSON.parse(s);
    // Validate all required fields exist before restoring
    if (p && p.token && p.userId && p.name && p.email && p.role) {
      currentUser = p;
    } else {
      localStorage.removeItem("cleanCivicUser");
    }
  } catch {
    localStorage.removeItem("cleanCivicUser");
  }
}

/* ═══════════════════════════════════════════════════════════
   AUTH — LOGIN
   ═══════════════════════════════════════════════════════════ */
function switchAuthTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("loginForm") .classList.toggle("hidden",  !isLogin);
  document.getElementById("signupForm").classList.toggle("hidden",   isLogin);
  document.getElementById("tabLogin")  .classList.toggle("active",   isLogin);
  document.getElementById("tabSignup") .classList.toggle("active",  !isLogin);
  document.getElementById("loginError") .classList.add("hidden");
  document.getElementById("signupError").classList.add("hidden");
}

async function doLogin() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl    = document.getElementById("loginError");
  errEl.classList.add("hidden");

  if (!email || !password) {
    errEl.textContent = "Please enter your email and password.";
    errEl.classList.remove("hidden");
    return;
  }

  setLoading("doLoginBtn", true);
  try {
    // isAuthEndpoint=true → backend errors treated as "wrong credentials"
    const data = await api(
      `${API_BASE}/api/auth/login`,
      { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email, password }) },
      true   // ← AUTH ENDPOINT FLAG — never calls handleUnauthorized
    );

    if (!data?.token || !data?.userId) {
      throw new Error("Server response is missing required fields. Check the backend.");
    }

    // ── Store session
    currentUser = {
      token:  data.token,
      userId: data.userId,
      name:   data.name,
      email:  data.email,
      role:   data.role
    };
    localStorage.setItem("cleanCivicUser", JSON.stringify(currentUser));

    // Clear password from DOM immediately
    document.getElementById("loginPassword").value = "";

    renderAuthState();
    showToast(`Welcome back, ${currentUser.name}! 👋`, "success");

    // Load data in background — errors here must NOT clear the session
    loadAppData();

  } catch (err) {
    if (err.message !== "__SESSION_EXPIRED__") {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  } finally {
    setLoading("doLoginBtn", false);
  }
}

/* ── SIGNUP ───────────────────────────────────────────────── */
async function doSignup() {
  const name     = document.getElementById("signupName").value.trim();
  const email    = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const errEl    = document.getElementById("signupError");
  errEl.classList.add("hidden");

  if (!name || !email || !password) {
    errEl.textContent = "Name, email and password are all required.";
    errEl.classList.remove("hidden");
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = "Please enter a valid email address.";
    errEl.classList.remove("hidden");
    return;
  }

  setLoading("doSignupBtn", true);
  try {
    const data = await api(
      `${API_BASE}/api/auth/register`,
      { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name, email, password }) },
      true
    );

    if (!data?.token || !data?.userId) {
      throw new Error("Registration failed — no token returned.");
    }

    currentUser = { token:data.token, userId:data.userId, name:data.name, email:data.email, role:data.role };
    localStorage.setItem("cleanCivicUser", JSON.stringify(currentUser));
    document.getElementById("signupPassword").value = "";

    renderAuthState();
    showToast(`Account created! Welcome, ${currentUser.name} 🎉`, "success");
    loadAppData();

  } catch (err) {
    if (err.message !== "__SESSION_EXPIRED__") {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  } finally {
    setLoading("doSignupBtn", false);
  }
}

/* ── LOGOUT ──────────────────────────────────────────────── */
function doLogout() {
  _clearSession();
  renderAuthState();
  showToast("You have been signed out.", "info");
}

/* ═══════════════════════════════════════════════════════════
   VOLUNTEER MODE  (same userId / token / JWT — UI toggle only)

   The backend's /assign requires the target user to have role=VOLUNTEER in the DB.
   A CITIZEN pressing "Serve" will get the backend error "Selected user is not a volunteer".
   This is surfaced clearly in the toast. We never fake the role in localStorage.

   To get full volunteer capability, the admin must update your role in the DB to VOLUNTEER.
   Once done, log out and log back in — the new JWT will contain role=VOLUNTEER.
   ═══════════════════════════════════════════════════════════ */
function toggleVolunteerMode() {
  volunteerMode = !volunteerMode;
  updateNavForMode();
  renderDashboard();
  showToast(
    volunteerMode
      ? "🧹 Volunteer Mode — you can now serve available cleanup reports."
      : "👤 Back to Citizen Mode.",
    "info"
  );
}

function updateNavForMode() {
  const btn   = document.getElementById("volunteerModeBtn");
  const chip  = document.getElementById("roleChipDisplay");
  const dash  = document.getElementById("navDashboard");
  if (!currentUser) return;

  const isAdmin = currentUser.role === "ADMIN";

  if (isAdmin) {
    if (chip)  { chip.textContent = "ADMIN"; chip.className = "role-chip ADMIN"; }
    if (dash)  dash.textContent = "⚡ Admin Panel";
    if (btn)   btn.classList.add("hidden");
    return;
  }

  const canToggle = (currentUser.role === "CITIZEN" || currentUser.role === "VOLUNTEER");
  if (btn)  btn.classList.toggle("hidden", !canToggle);

  if (volunteerMode) {
    if (chip) { chip.textContent = "VOLUNTEER MODE"; chip.className = "role-chip VOLUNTEER"; }
    if (btn)  btn.textContent = "👤 Citizen Mode";
    if (dash) dash.textContent = "🧹 Volunteer Tasks";
  } else {
    if (chip) { chip.textContent = currentUser.role; chip.className = `role-chip ${currentUser.role}`; }
    if (btn)  btn.textContent = "🤝 Serve as Volunteer";
    if (dash) dash.textContent = "⚡ My Reports";
  }
}

/* ═══════════════════════════════════════════════════════════
   AUTH STATE RENDER
   ═══════════════════════════════════════════════════════════ */
function renderAuthState() {
  const overlay = document.getElementById("authOverlay");
  const shell   = document.getElementById("appShell");

  if (!currentUser) {
    overlay.classList.remove("hidden");
    shell.classList.add("hidden");
    return;
  }

  overlay.classList.add("hidden");
  shell.classList.remove("hidden");

  document.getElementById("userAvatar").textContent      = (currentUser.name || "?")[0].toUpperCase();
  document.getElementById("userNameDisplay").textContent  = currentUser.name || "User";

  updateNavForMode();

  if (!map) initMap();
  switchTab("map");
}

/* ═══════════════════════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════════════════════ */
function switchTab(name) {
  ["map","reports","dashboard","leaderboard"].forEach(t => {
    const id = `tab${t.charAt(0).toUpperCase()+t.slice(1)}`;
    document.getElementById(id)?.classList.toggle("hidden", t !== name);
    document.getElementById(id)?.classList.toggle("active", t === name);
    document.querySelector(`.nav-tab[data-tab="${t}"]`)?.classList.toggle("active", t === name);
  });

  if      (name === "reports")     { initSearchListener(); applyFilters(); }
  else if (name === "dashboard")   renderDashboard();
  else if (name === "leaderboard") renderLeaderboard();
  else if (name === "map")         setTimeout(() => map?.invalidateSize(), 60);
}

/* ═══════════════════════════════════════════════════════════
   MAP — init once, LayerGroup for markers
   ═══════════════════════════════════════════════════════════ */
function initMap() {
  if (map) return;

  map = L.map("map", { center: INDIA_CENTER, zoom: 5 });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  reportLayer = L.layerGroup().addTo(map);

  // Map click (empty area) → open create report
  map.on("click", e => {
    if (!currentUser) { showToast("Please login to report garbage.", "info"); return; }
    openCreateReportModal(e.latlng.lat, e.latlng.lng);
  });

  renderMapMarkers();
}

function renderMapMarkers() {
  if (!map || !reportLayer) return;
  reportLayer.clearLayers();  // just clear & re-add — no map recreation

  allReports.forEach(r => {
    if (r.latitude == null || r.longitude == null) return;
    const col  = { HIGH:{f:"#ef4444",s:"#dc2626"}, MEDIUM:{f:"#f59e0b",s:"#d97706"}, LOW:{f:"#22c55e",s:"#16a34a"}, CRITICAL:{f:"#a855f7",s:"#9333ea"} }[r.severity] || {f:"#64748b",s:"#475569"};
    const done = DONE_STATUSES.has(r.status);

    const m = L.circleMarker([r.latitude, r.longitude], {
      radius: done ? 8 : 10,
      fillColor: col.f, color: col.s,
      weight: done ? 3 : 2,
      fillOpacity: done ? 0.55 : 0.9,
      dashArray: done ? "4 3" : null
    });

    m.on("click", e => { L.DomEvent.stopPropagation(e); openReportDetail(r.id); });
    m.bindTooltip(`${esc(r.title)}${done?" ✓":""}`, { direction:"top", offset:[0,-8] });
    reportLayer.addLayer(m);
  });
}

/* ═══════════════════════════════════════════════════════════
   DATA LOADING
   Errors here MUST NOT clear the session.
   ═══════════════════════════════════════════════════════════ */
async function loadAppData() {
  await refreshReports();
}

async function refreshReports() {
  if (!currentUser?.token) return;
  try {
    const data = await api(`${API_BASE}/api/reports`);
    allReports = Array.isArray(data) ? data : [];
    renderMapMarkers();
    updateStatsBar();
    applyFilters();

    // Re-render open tab
    const active = document.querySelector(".tab-section.active")?.id;
    if (active === "tabDashboard")   renderDashboard();
    if (active === "tabLeaderboard") renderLeaderboard();
  } catch (e) {
    // Only log — do NOT show "session expired" unless it's a real 401
    if (e.message !== "__SESSION_EXPIRED__") {
      console.warn("refreshReports:", e.message);
    }
  }
}

/* ── Stats bar ─────────────────────────────────────────────── */
function updateStatsBar() {
  const c = {PENDING:0,ASSIGNED:0,IN_PROGRESS:0,CLEANUP_SUBMITTED:0,VERIFIED:0,RESOLVED:0,REJECTED:0};
  allReports.forEach(r => { if (r.status in c) c[r.status]++; });
  setText("#statTotal .stat-num",      allReports.length);
  setText("#statPending .stat-num",    c.PENDING);
  setText("#statAssigned .stat-num",   c.ASSIGNED);
  setText("#statInProgress .stat-num", c.IN_PROGRESS);
  setText("#statSubmitted .stat-num",  c.CLEANUP_SUBMITTED);
  setText("#statResolved .stat-num",   c.VERIFIED + c.RESOLVED);
}

/* ═══════════════════════════════════════════════════════════
   SEARCH + FILTER  (client-side, from allReports)
   ═══════════════════════════════════════════════════════════ */
function initSearchListener() {
  const inp = document.getElementById("reportSearch");
  if (!inp || inp.dataset.wired) return;
  inp.dataset.wired = "1";
  inp.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 180);
  });
}

function applyFilters() {
  const q  = (document.getElementById("reportSearch")?.value || "").toLowerCase().trim();
  const sf = activeStatusFilter;
  const vf = activeSevFilter;

  const result = allReports.filter(r => {
    if (sf !== "all" && r.status   !== sf) return false;
    if (vf !== "all" && r.severity !== vf) return false;
    if (q) {
      const hay = [r.title, r.address, r.reporterName, r.description]
        .map(s => (s||"").toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderReportCards(result, "reportsGrid", {
    showAdminActions:     currentUser?.role === "ADMIN",
    showVolunteerActions: volunteerMode || currentUser?.role === "VOLUNTEER",
    emptyMessage: "No reports match your search or filter."
  });
}

function filterReports(f) {
  activeStatusFilter = f;
  document.querySelectorAll("#reportFilterChips .chip").forEach(c =>
    c.classList.toggle("active", c.dataset.filter === f));
  applyFilters();
}

function filterSeverity(s) {
  activeSevFilter = s;
  document.querySelectorAll("#severityFilterChips .chip").forEach(c =>
    c.classList.toggle("active", c.dataset.sev === s));
  applyFilters();
}

/* ── Reports tab ─────────────────────────────────────────── */
function renderReportsTab() { applyFilters(); }

/* ── Card builder ─────────────────────────────────────────── */
function renderReportCards(reports, gridId, opts = {}) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!reports?.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌿</div>
        <div class="empty-state-title">No reports here</div>
        <div class="empty-state-sub">${esc(opts.emptyMessage||"Nothing to show.")}</div>
      </div>`;
    return;
  }
  grid.innerHTML = reports.map((r,i) => buildCard(r, opts, i)).join("");
}

function buildCard(r, opts, i=0) {
  const done    = DONE_STATUSES.has(r.status);
  const tick    = done ? `<span class="completion-tick">✓</span>` : "";
  const delay   = i * 0.04;

  const bImg = r.beforeImageUrl
    ? `<img class="card-img" src="${esc(r.beforeImageUrl)}" alt="Before" loading="lazy" />`
    : `<div class="card-img-placeholder"><div class="card-img-placeholder-icon">📷</div><span>No image</span></div>`;

  const aImg = r.afterImageUrl
    ? `<img class="card-img" src="${esc(r.afterImageUrl)}" alt="After" loading="lazy" />`
    : `<div class="card-img-placeholder"><div class="card-img-placeholder-icon">⏳</div><span>Not completed</span></div>`;

  // ── Action buttons in card footer
  let actions = "";

  if (opts.showVolunteerActions) {
    if (r.status === "PENDING") {
      actions = `<button class="btn-serve" onclick="event.stopPropagation();serveReport(${r.id})">🤝 Serve</button>`;
    } else if (r.status === "ASSIGNED") {
      actions = `<button class="btn-amber" onclick="event.stopPropagation();startCleanup(${r.id})">▶ Start Cleanup</button>`;
    } else if (r.status === "IN_PROGRESS") {
      actions = `<button class="btn-primary sm" onclick="event.stopPropagation();openAfterImageModal(${r.id})">📸 Upload After</button>`;
    } else if (done) {
      actions = `<span class="done-tag">✓ Completed</span>`;
    }
  }

  if (opts.showAdminActions) {
    if (r.status === "PENDING") {
      actions = `
        <div class="assign-row" onclick="event.stopPropagation()">
          <input id="vol-${r.id}" type="number" class="field" placeholder="Volunteer ID" min="1" style="width:120px" />
          <button class="btn-primary sm" onclick="event.stopPropagation();assignVolunteer(${r.id})">Assign</button>
        </div>`;
    } else if (r.status === "CLEANUP_SUBMITTED") {
      actions = `<button class="btn-primary sm" onclick="event.stopPropagation();verifyReport(${r.id})">✅ Verify</button>`;
    }
  }

  return `
    <div class="report-card" style="animation-delay:${delay}s" onclick="openReportDetail(${r.id})">
      <div class="card-images">
        <div class="card-img-block"><span class="card-img-label">Before</span>${bImg}</div>
        <div class="card-img-block"><span class="card-img-label">After</span>${aImg}</div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(r.title)}${tick}</div>
        <div class="card-meta">
          <span class="badge-severity sev-${r.severity}">${esc(r.severity)}</span>
          <span class="badge-status st-${r.status}">${esc(statusLabel(r.status))}</span>
        </div>
        <div class="card-address"><span class="card-address-icon">📍</span>${esc(r.address||"Location on map")}</div>
        ${r.reporterName ? `<div style="font-size:11px;color:var(--text-500);margin-top:4px">👤 ${esc(r.reporterName)}</div>` : ""}
      </div>
      <div class="card-footer" onclick="event.stopPropagation()">
        <span class="card-id">#${r.id}</span>
        ${actions}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
function renderDashboard() {
  const isAdmin   = currentUser?.role === "ADMIN";
  const isVolMode = volunteerMode || currentUser?.role === "VOLUNTEER";

  document.getElementById("citizenDashboard").classList.add("hidden");
  document.getElementById("volunteerDashboard").classList.add("hidden");
  document.getElementById("adminDashboard").classList.add("hidden");

  if (isAdmin) {
    document.getElementById("adminDashboard").classList.remove("hidden");
    renderAdminDashboard();
  } else if (isVolMode) {
    document.getElementById("volunteerDashboard").classList.remove("hidden");
    renderVolunteerTasks();
  } else {
    document.getElementById("citizenDashboard").classList.remove("hidden");
    renderMyReports();
  }
}

/* ── Citizen — my reports ────────────────────────────────── */
async function renderMyReports() {
  const grid = document.getElementById("myReportsGrid");
  grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading your reports…</p></div>`;
  try {
    const data = await api(`${API_BASE}/api/reports/my`);
    const mine = Array.isArray(data) ? data : [];
    renderReportCards(mine, "myReportsGrid", {
      emptyMessage: "You haven't reported any garbage yet. Click the map to get started!"
    });
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__")
      grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error loading</div><div class="empty-state-sub">${esc(e.message)}</div></div>`;
  }
}

/* ── Volunteer — tasks ───────────────────────────────────── */
function renderVolunteerTasks() {
  // Show all actionable reports for volunteer: PENDING (to serve), ASSIGNED, IN_PROGRESS, submitted
  const tasks = allReports.filter(r =>
    ["PENDING","ASSIGNED","IN_PROGRESS","CLEANUP_SUBMITTED"].includes(r.status)
  );
  renderReportCards(tasks, "volunteerTasksGrid", {
    showVolunteerActions: true,
    emptyMessage: "No cleanup tasks available right now."
  });
}

/* ── Admin dashboard ─────────────────────────────────────── */
function renderAdminDashboard() {
  const c = { total:allReports.length, PENDING:0, ASSIGNED:0, IN_PROGRESS:0,
              CLEANUP_SUBMITTED:0, VERIFIED:0, RESOLVED:0, REJECTED:0 };
  allReports.forEach(r => { if (r.status in c) c[r.status]++; });

  document.getElementById("adminStats").innerHTML = `
    <div class="admin-stat-card a-total">   <div class="admin-stat-num">${c.total}</div>          <div class="admin-stat-label">Total</div></div>
    <div class="admin-stat-card a-pending"> <div class="admin-stat-num">${c.PENDING}</div>         <div class="admin-stat-label">Pending</div></div>
    <div class="admin-stat-card a-assigned"><div class="admin-stat-num">${c.ASSIGNED}</div>        <div class="admin-stat-label">Assigned</div></div>
    <div class="admin-stat-card a-progress"><div class="admin-stat-num">${c.IN_PROGRESS}</div>     <div class="admin-stat-label">In Progress</div></div>
    <div class="admin-stat-card a-await">  <div class="admin-stat-num">${c.CLEANUP_SUBMITTED}</div><div class="admin-stat-label">Awaiting</div></div>
    <div class="admin-stat-card a-resolved"><div class="admin-stat-num">${c.RESOLVED+c.VERIFIED}</div><div class="admin-stat-label">Resolved</div></div>
    <div class="admin-stat-card a-rejected"><div class="admin-stat-num">${c.REJECTED}</div>        <div class="admin-stat-label">Rejected</div></div>`;

  switchAdminTab(activeAdminTab);
}

function switchAdminTab(tab) {
  activeAdminTab = tab;
  document.querySelectorAll(".admin-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.adminTab === tab));
  ["pending","submitted","all"].forEach(s => {
    document.getElementById(`admin${s.charAt(0).toUpperCase()+s.slice(1)}Section`)
      ?.classList.toggle("hidden", s !== tab);
  });

  const cfg = {
    pending:   { grid:"adminPendingGrid",   r: allReports.filter(r => r.status==="PENDING"),          msg:"No pending reports." },
    submitted: { grid:"adminSubmittedGrid", r: allReports.filter(r => r.status==="CLEANUP_SUBMITTED"),msg:"No cleanups awaiting verification." },
    all:       { grid:"adminAllGrid",       r: allReports,                                            msg:"No reports found." }
  }[tab];
  if (cfg) renderReportCards(cfg.r, cfg.grid, { showAdminActions:true, emptyMessage:cfg.msg });
}

/* ═══════════════════════════════════════════════════════════
   LEADERBOARD
   Points come from backend verify logic: LOW=10, MED=20, HIGH=30, CRIT=50
   Awarded to REPORTER (citizen). No /leaderboard endpoint yet, so we
   derive from allReports — this will auto-update once reports refresh.
   ═══════════════════════════════════════════════════════════ */
async function renderLeaderboard() {
  const grid = document.getElementById("leaderboardGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading leaderboard…</p></div>`;

  try {
    const data = await api(`${API_BASE}/api/users/leaderboard`);
    const entries = Array.isArray(data) ? data : [];

    if (!entries.length) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-title">No verified reports yet</div><div class="empty-state-sub">Once admin verifies a cleanup, points appear here automatically.</div></div>`;
      return;
    }

    const medals = ["🥇","🥈","🥉"];
    const highlightId = currentUser?.userId;

    grid.innerHTML = entries.map((u, i) => {
      const isMe = (u.id === highlightId);
      return `
        <div class="lb-row ${i < 3 ? "lb-top" : ""} ${isMe ? "lb-me" : ""}">
          <span class="lb-rank">${medals[i] || `#${i+1}`}</span>
          <span class="lb-name">${esc(u.name)}${isMe ? " <span class='lb-you'>(You)</span>" : ""} <span class="role-chip ${u.role}" style="margin-left: 8px; font-size: 8px">${u.role}</span></span>
          <span class="lb-score">${u.points || 0} <small>pts</small></span>
        </div>`;
    }).join("");

    const note = document.getElementById("lbNote");
    if (note) note.innerHTML = `<span>Points are awarded by admin verification. Backend calculates: LOW=10 · MEDIUM=20 · HIGH=30 · CRITICAL=50 per cleanup.</span>`;
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") {
      grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error loading</div><div class="empty-state-sub">${esc(e.message)}</div></div>`;
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   REPORT DETAIL MODAL
   ═══════════════════════════════════════════════════════════ */
async function openReportDetail(reportId) {
  // Use cached report, or fetch from backend
  let r = allReports.find(x => x.id === reportId);
  if (!r) {
    try { r = await api(`${API_BASE}/api/reports/${reportId}`); }
    catch (e) { if (e.message !== "__SESSION_EXPIRED__") showToast(e.message, "error"); return; }
  }
  showReportDetailModal(r);
}

function showReportDetailModal(r) {
  const done = DONE_STATUSES.has(r.status);
  document.getElementById("detailTitle").textContent = `#${r.id} — ${r.title}${done?" ✓":""}`;

  const bImg = r.beforeImageUrl
    ? `<img class="detail-img" src="${esc(r.beforeImageUrl)}" alt="Before cleanup" />`
    : `<div class="detail-no-img"><div class="detail-no-img-icon">📷</div><span>No before image</span></div>`;

  const aImg = r.afterImageUrl
    ? `<img class="detail-img" src="${esc(r.afterImageUrl)}" alt="After cleanup" />`
    : `<div class="detail-no-img"><div class="detail-no-img-icon">⏳</div><span>Cleanup not completed yet</span></div>`;

  document.getElementById("detailBody").innerHTML = `
    <div class="detail-meta-row">
      <div class="detail-section">
        <div class="detail-label">Status</div>
        <span class="badge-status st-${r.status}">${esc(statusLabel(r.status))}</span>
      </div>
      <div class="detail-section">
        <div class="detail-label">Severity</div>
        <span class="badge-severity sev-${r.severity}">${esc(r.severity)}</span>
      </div>
      <div class="detail-section">
        <div class="detail-label">Category</div>
        <div class="detail-value">${esc(r.category)}</div>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-section">
      <div class="detail-label">📍 Location</div>
      <div class="detail-value">${esc(r.address||"Not provided")}</div>
      <div class="detail-value muted" style="font-size:12px;font-family:monospace">${r.latitude?.toFixed(6)}, ${r.longitude?.toFixed(6)}</div>
    </div>
    ${r.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-value muted">${esc(r.description)}</div></div>` : ""}
    <div class="detail-section">
      <div class="detail-label">👤 Reported by</div>
      <div class="detail-value">${esc(r.reporterName||"Unknown")}</div>
    </div>
    ${done ? `<div class="detail-section"><div class="detail-label">🏆 Points Awarded</div><div class="detail-value" style="color:var(--accent-primary)">${SEVERITY_POINTS[r.severity]||0} pts to reporter</div></div>` : ""}
    <div class="detail-divider"></div>
    <div class="detail-section">
      <div class="detail-label">Before &amp; After</div>
      <div class="detail-images">
        <div class="detail-img-block"><div class="detail-img-label">📸 Before Cleanup</div>${bImg}</div>
        <div class="detail-img-block"><div class="detail-img-label">✅ After Cleanup</div>${aImg}</div>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-meta-row">
      <div class="detail-section"><div class="detail-label">Reported</div><div class="detail-value muted" style="font-size:12px">${r.createdAt ? new Date(r.createdAt).toLocaleString():"-"}</div></div>
      <div class="detail-section"><div class="detail-label">Updated</div><div class="detail-value muted" style="font-size:12px">${r.updatedAt ? new Date(r.updatedAt).toLocaleString():"-"}</div></div>
    </div>
    <div>
      <a href="https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}"
         target="_blank" rel="noopener" class="link-btn" style="font-size:13px">🗺️ Open in Google Maps</a>
    </div>`;

  buildDetailFooter(r);
  document.getElementById("reportDetailModal").classList.remove("hidden");
}

function buildDetailFooter(r) {
  const footer    = document.getElementById("detailFooter");
  const isAdmin   = currentUser?.role === "ADMIN";
  const isVolMode = volunteerMode || currentUser?.role === "VOLUNTEER";
  const done      = DONE_STATUSES.has(r.status);
  let actions     = "";

  if (isAdmin) {
    if (r.status === "PENDING") {
      actions = `
        <input id="detailVolId" type="number" class="field" placeholder="Volunteer User ID"
          style="width:140px;padding:8px 12px;font-size:13px" min="1" />
        <button class="btn-primary sm" onclick="assignVolunteerFromDetail(${r.id})">Assign Volunteer</button>`;
    } else if (r.status === "CLEANUP_SUBMITTED") {
      actions = `<button class="btn-primary" onclick="verifyReport(${r.id});closeReportDetailModal()">✅ Verify & Award Points</button>`;
    }
  } else if (isVolMode) {
    if (r.status === "PENDING") {
      actions = `<button class="btn-serve" onclick="serveReport(${r.id});closeReportDetailModal()">🤝 Serve this Report</button>`;
    } else if (r.status === "ASSIGNED") {
      actions = `<button class="btn-amber" onclick="startCleanup(${r.id});closeReportDetailModal()">▶ Start Cleanup</button>`;
    } else if (r.status === "IN_PROGRESS") {
      actions = `<button class="btn-primary" onclick="openAfterImageModal(${r.id});closeReportDetailModal()">📸 Upload After Image</button>`;
    } else if (r.status === "CLEANUP_SUBMITTED") {
      actions = `<span class="done-tag">✅ Waiting for admin verification</span>`;
    } else if (done) {
      actions = `<span class="done-tag">✓ Cleanup Verified & Complete</span>`;
    }
  }

  footer.innerHTML = `<button class="btn-ghost" onclick="closeReportDetailModal()">Close</button>${actions}`;
}

function closeReportDetailModal() {
  document.getElementById("reportDetailModal").classList.add("hidden");
}

async function assignVolunteerFromDetail(reportId) {
  const v = Number(document.getElementById("detailVolId")?.value);
  if (!v) { showToast("Please enter a volunteer user ID.", "error"); return; }
  await assignVolunteerById(reportId, v);
  closeReportDetailModal();
}

/* ═══════════════════════════════════════════════════════════
   CREATE REPORT MODAL
   ═══════════════════════════════════════════════════════════ */
function openCreateReportModal(lat, lng) {
  if (!currentUser) { showToast("Please login to report garbage.", "info"); return; }

  // Reset form
  ["createReportError","beforeImageError"].forEach(id =>
    document.getElementById(id)?.classList.add("hidden"));
  document.getElementById("beforePreview")?.classList.add("hidden");
  document.getElementById("beforeUploadPlaceholder")?.classList.remove("hidden");
  document.getElementById("rBeforeImage").value = "";
  document.getElementById("rTitle").value = "";
  document.getElementById("rDescription").value = "";
  document.getElementById("rCategory").value = "PLASTIC";
  document.getElementById("rSeverity").value = "HIGH";
  updateSeverityStyle(document.getElementById("rSeverity"));

  modalLat = lat;
  modalLng = lng;

  if (lat != null && lng != null) {
    if (tempMarker) { map?.removeLayer(tempMarker); tempMarker = null; }
    if (map) {
      tempMarker = L.circleMarker([lat, lng], {
        radius:12, fillColor:"#22c55e", color:"#16a34a", weight:2, fillOpacity:0.7
      }).addTo(map);
      map.setView([lat, lng], 15);
    }
    document.getElementById("modalCoords").textContent  = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    document.getElementById("modalAddress").textContent = "Getting address…";
    reverseGeocode(lat, lng, a => { document.getElementById("modalAddress").textContent = a; });
  } else {
    document.getElementById("modalAddress").textContent = "Click map or use current location";
    document.getElementById("modalCoords").textContent  = "";
  }

  document.getElementById("createReportModal").classList.remove("hidden");
}

function closeCreateReportModal() {
  document.getElementById("createReportModal").classList.add("hidden");
  if (tempMarker) { map?.removeLayer(tempMarker); tempMarker = null; }
}

/* ── Use current location ─────────────────────────────────── */
function useCurrentLocation() {
  if (!navigator.geolocation) { showToast("Geolocation not supported by your browser.", "error"); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      if (map) map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      openCreateReportModal(pos.coords.latitude, pos.coords.longitude);
    },
    e => showToast("Could not get location: " + e.message, "error"),
    { enableHighAccuracy:true, timeout:10000 }
  );
}

function useCurrentLocationForModal() {
  if (!navigator.geolocation) { showToast("Geolocation not supported.", "error"); return; }
  document.getElementById("modalAddress").textContent = "Detecting your location…";
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      modalLat = lat; modalLng = lng;
      if (map) {
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
        tempMarker = L.circleMarker([lat,lng],{radius:12,fillColor:"#22c55e",color:"#16a34a",weight:2,fillOpacity:0.7}).addTo(map);
        map.setView([lat,lng],15);
      }
      document.getElementById("modalCoords").textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      reverseGeocode(lat, lng, a => { document.getElementById("modalAddress").textContent = a; });
    },
    e => showToast("Could not get location: " + e.message, "error"),
    { enableHighAccuracy:true, timeout:10000 }
  );
}

/* ── Reverse geocode (Nominatim) ─────────────────────────── */
async function reverseGeocode(lat, lng, cb) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
      { headers:{"Accept-Language":"en"} }
    );
    const d = await r.json();
    cb(d.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  } catch { cb(`${lat.toFixed(6)}, ${lng.toFixed(6)}`); }
}

function updateSeverityStyle(sel) {
  sel.className = `field severity-select severity-${sel.value}`;
}

/* ── Image upload listeners ──────────────────────────────── */
function initImageListeners() {
  [["rBeforeImage","beforePreview","beforeUploadPlaceholder","beforeImageError"],
   ["rAfterImage", "afterPreview", "afterUploadPlaceholder", "afterImageError"]].forEach(([inp,prev,ph,err]) => {
    const el = document.getElementById(inp);
    if (!el || el.dataset.wired) return;
    el.dataset.wired = "1";
    el.addEventListener("change", e => {
      const f  = e.target.files[0];
      const eEl = document.getElementById(err);
      eEl?.classList.add("hidden");
      if (!f) return;
      if (!validateImg(f, eEl)) { el.value=""; return; }
      const rd = new FileReader();
      rd.onload = ev => {
        const pv = document.getElementById(prev);
        if (pv) { pv.src = ev.target.result; pv.classList.remove("hidden"); }
        document.getElementById(ph)?.classList.add("hidden");
      };
      rd.readAsDataURL(f);
    });
  });
}

function validateImg(file, errEl) {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
    if (errEl) { errEl.textContent="Only JPG, PNG, WEBP allowed."; errEl.classList.remove("hidden"); }
    return false;
  }
  if (file.size > 5*1024*1024) {
    if (errEl) { errEl.textContent="Image must be under 5 MB."; errEl.classList.remove("hidden"); }
    return false;
  }
  return true;
}

/* ── Upload → Cloudinary via backend ─────────────────────── */
async function uploadImg(file) {
  const form = new FormData();
  form.append("file", file);
  // DO NOT set Content-Type — browser sets multipart boundary automatically
  const data = await api(`${API_BASE}/api/images/upload`, {
    method:"POST",
    headers:{ Authorization:`Bearer ${currentUser.token}` },
    body:form
  });
  const url = data?.imageUrl || data?.url || data?.secure_url || (typeof data==="string"?data:null);
  if (!url) throw new Error("Image upload returned no URL.");
  return url;
}

/* ── Submit new report ────────────────────────────────────── */
async function submitReport() {
  const errEl = document.getElementById("createReportError");
  errEl.classList.add("hidden");

  const title    = document.getElementById("rTitle").value.trim();
  const desc     = document.getElementById("rDescription").value.trim();
  const category = document.getElementById("rCategory").value;
  const severity = document.getElementById("rSeverity").value;
  const file     = document.getElementById("rBeforeImage").files[0];
  let   address  = document.getElementById("modalAddress").textContent;

  if (!title)              { errEl.textContent="Please enter a title.";            errEl.classList.remove("hidden"); return; }
  if (modalLat==null)      { errEl.textContent="Please select a location on map."; errEl.classList.remove("hidden"); return; }
  if (!file)               { errEl.textContent="Please upload a before-cleanup image."; errEl.classList.remove("hidden"); return; }

  const junk = ["Getting address…","Detecting your location…","Click map or use current location","Detecting location…"];
  if (junk.includes(address)) address = `${modalLat.toFixed(6)}, ${modalLng.toFixed(6)}`;

  setLoading("submitReportBtn", true);
  try {
    const beforeImageUrl = await uploadImg(file);
    const data = await api(`${API_BASE}/api/reports`, {
      method:"POST",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${currentUser.token}`},
      body: JSON.stringify({ title, description:desc, category, severity,
                             latitude:modalLat, longitude:modalLng, address, beforeImageUrl })
    });
    closeCreateReportModal();
    showToast(`🎉 Report #${data.id} submitted! Status: PENDING.`, "success");
    await refreshReports();
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") { errEl.textContent=e.message; errEl.classList.remove("hidden"); }
  } finally {
    setLoading("submitReportBtn", false);
  }
}

/* ═══════════════════════════════════════════════════════════
   VOLUNTEER ACTIONS
   ═══════════════════════════════════════════════════════════ */

/**
 * SERVE — calls PATCH /api/reports/{id}/assign?volunteerId={currentUser.userId}
 * Backend will reject if the user's role != VOLUNTEER in the database.
 * The error message from backend is shown clearly in a toast.
 */
async function serveReport(reportId) {
  if (!currentUser) return;
  try {
    await api(`${API_BASE}/api/reports/${reportId}/assign?volunteerId=${currentUser.userId}`,
      { method:"PATCH" });
    showToast("✅ You are assigned to this cleanup!", "success");
    await refreshReports();
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") showToast(e.message, "error");
  }
}

async function startCleanup(reportId) {
  if (!currentUser) return;
  try {
    await api(`${API_BASE}/api/reports/${reportId}/start`, { method:"PATCH" });
    showToast("🟡 Cleanup started — status is now IN_PROGRESS.", "success");
    await refreshReports();
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") showToast(e.message, "error");
  }
}

/* ── After image modal ────────────────────────────────────── */
function openAfterImageModal(reportId) {
  document.getElementById("afterImageReportId").value = reportId;
  document.getElementById("afterPreview").classList.add("hidden");
  document.getElementById("afterUploadPlaceholder").classList.remove("hidden");
  document.getElementById("rAfterImage").value = "";
  document.getElementById("afterImageError").classList.add("hidden");
  document.getElementById("afterImageModal").classList.remove("hidden");
}
function closeAfterImageModal() {
  document.getElementById("afterImageModal").classList.add("hidden");
}

async function submitAfterImage() {
  const reportId = Number(document.getElementById("afterImageReportId").value);
  const file     = document.getElementById("rAfterImage").files[0];
  const errEl    = document.getElementById("afterImageError");
  errEl.classList.add("hidden");

  if (!file) { errEl.textContent="Please select the after-cleanup image."; errEl.classList.remove("hidden"); return; }

  setLoading("submitAfterBtn", true);
  try {
    const afterImageUrl = await uploadImg(file);
    await api(`${API_BASE}/api/reports/${reportId}/after-image`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${currentUser.token}`},
      body: JSON.stringify({ afterImageUrl })
    });
    closeAfterImageModal();
    showToast("✅ After image submitted! Waiting for admin to verify.", "success");
    await refreshReports();
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") { errEl.textContent=e.message; errEl.classList.remove("hidden"); }
  } finally {
    setLoading("submitAfterBtn", false);
  }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN ACTIONS
   ═══════════════════════════════════════════════════════════ */
async function assignVolunteer(reportId) {
  const v = Number(document.getElementById(`vol-${reportId}`)?.value);
  if (!v) { showToast("Please enter a volunteer user ID.", "error"); return; }
  await assignVolunteerById(reportId, v);
}

async function assignVolunteerById(reportId, volunteerId) {
  try {
    await api(`${API_BASE}/api/reports/${reportId}/assign?volunteerId=${volunteerId}`,
      { method:"PATCH" });
    showToast(`✅ Report #${reportId} assigned to volunteer #${volunteerId}.`, "success");
    await refreshReports();
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") showToast(e.message, "error");
  }
}

/**
 * VERIFY — PATCH /api/reports/{id}/verify
 * Backend awards points to the REPORTER based on severity.
 * LOW=10, MEDIUM=20, HIGH=30, CRITICAL=50
 */
async function verifyReport(reportId) {
  const report = allReports.find(r => r.id === reportId);
  try {
    const result = await api(`${API_BASE}/api/reports/${reportId}/verify`, { method:"PATCH" });
    const pts    = SEVERITY_POINTS[report?.severity] || 0;
    showToast(`🌿 Report #${reportId} verified! ${pts} points awarded to ${report?.reporterName||"reporter"}.`, "success");
    await refreshReports();
  } catch (e) {
    if (e.message !== "__SESSION_EXPIRED__") showToast(e.message, "error");
  }
}

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════════ */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeCreateReportModal();
    closeReportDetailModal();
    closeAfterImageModal();
  }
  if (e.key === "Enter" && !document.getElementById("authOverlay").classList.contains("hidden")) {
    document.getElementById("tabLogin").classList.contains("active") ? doLogin() : doSignup();
  }
});

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
async function init() {
  loadStoredUser();     // Restore from localStorage
  renderAuthState();    // Show app or auth overlay
  initImageListeners(); // Attach once

  if (currentUser) {
    // Load data — errors here must NOT log the user out
    loadAppData();
  }
}

window.addEventListener("load", init);

/* ── Expose globals for HTML onclick attributes ──────────── */
Object.assign(window, {
  // Auth
  switchAuthTab, doLogin, doSignup, doLogout,
  // Navigation
  switchTab, switchAdminTab, toggleVolunteerMode,
  // Filters
  filterReports, filterSeverity,
  // Modals
  openCreateReportModal, closeCreateReportModal,
  openReportDetail, closeReportDetailModal,
  openAfterImageModal, closeAfterImageModal,
  assignVolunteerFromDetail,
  // Actions
  submitReport, submitAfterImage,
  serveReport, startCleanup,
  assignVolunteer, assignVolunteerById,
  verifyReport,
  // Location
  useCurrentLocation, useCurrentLocationForModal,
  // UI helpers
  updateSeverityStyle
});
