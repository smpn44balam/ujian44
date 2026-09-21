/**
 * NEXORA EXAM - Dashboard Pengawas
 * File: pengawas.js (VERSI DIPERBAIKI — polling Google Sheets)
 *
 * PERBAIKAN DI FILE INI:
 * 1. Field yang dibaca sekarang cocok dengan payload security.js/exam.js
 *    (x.name, x.violations — sebelumnya sempat tidak sinkron).
 * 2. Sekarang JUGA mengambil data dari Google Apps Script (Code.gs) lewat
 *    NEXORA_CONFIG.scriptUrl, supaya pengawas bisa memantau dari
 *    HP/laptop lain, bukan cuma device yang sama dengan siswa (batasan
 *    localStorage sebelumnya). Data lokal & data Sheets digabung: kalau
 *    sessionId sama, dipakai yang catatan waktunya (`at`) paling baru.
 * 3. Kalau scriptUrl belum diisi, atau fetch gagal (mis. CORS/offline),
 *    dashboard tetap jalan dengan data lokal saja dan status di layar
 *    memberi tahu sumber data yang sedang dipakai.
 * 4. Auto-refresh tiap 15 detik, selain tombol "Segarkan" manual.
 */
(() => {
  const rows = document.getElementById("rows");
  const sourceStatus = document.getElementById("sourceStatus");
  let lastRemoteError = null;

  function readLocalSessions() {
    try {
      return JSON.parse(localStorage.getItem("nexoraMonitoring") || "[]");
    } catch (e) {
      return [];
    }
  }

  async function readRemoteSessions() {
    const scriptUrl = window.NEXORA_CONFIG && (NEXORA_CONFIG.scriptUrl || NEXORA_CONFIG.monitoringUrl);
    if (!scriptUrl) return { sessions: [], error: 'not-configured' };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(scriptUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return { sessions: [], error: 'http-' + res.status };
      const data = await res.json();
      if (!data || data.ok === false) return { sessions: [], error: data && data.error || 'unknown' };
      return { sessions: Array.isArray(data.sessions) ? data.sessions : [], error: null };
    } catch (err) {
      // Kemungkinan besar CORS diblokir, offline, atau scriptUrl salah.
      return { sessions: [], error: String(err && err.message || err) };
    }
  }

  function mergeSessions(localList, remoteList) {
    const merged = {};
    // Lokal dulu supaya urutan penggabungan (Object.assign) benar: data
    // dengan `at` lebih besar yang menang untuk sessionId yang sama.
    [...localList, ...remoteList].forEach(x => {
      const id = x.sessionId;
      if (!id) return;
      const prev = merged[id];
      if (!prev || (x.at || 0) >= (prev.at || 0)) {
        merged[id] = { ...prev, ...x, violations: Math.max(prev?.violations || 0, x.violations || 0) };
      } else {
        merged[id] = { ...x, ...prev, violations: Math.max(prev?.violations || 0, x.violations || 0) };
      }
    });
    return Object.values(merged);
  }

  function renderStatus(remoteResult) {
    if (!sourceStatus) return;
    const scriptUrl = window.NEXORA_CONFIG && (NEXORA_CONFIG.scriptUrl || NEXORA_CONFIG.monitoringUrl);
    if (!scriptUrl) {
      sourceStatus.textContent = "Sumber: data lokal browser ini saja (scriptUrl belum diisi di config.js).";
      return;
    }
    if (remoteResult.error) {
      sourceStatus.textContent = "Sumber: data lokal saja — gagal mengambil data pusat (" + remoteResult.error + "). Cek scriptUrl / koneksi.";
      return;
    }
    sourceStatus.textContent = "Sumber: Google Sheets (pusat, lintas-device) + data lokal browser ini.";
  }

  async function load() {
    const localList = readLocalSessions();
    const remoteResult = await readRemoteSessions();
    lastRemoteError = remoteResult.error;
    renderStatus(remoteResult);

    const arr = mergeSessions(localList, remoteResult.sessions)
      .sort((a, b) => (b.at || 0) - (a.at || 0));

    document.getElementById("total").textContent = arr.length;
    document.getElementById("flagged").textContent = arr.filter(x => (x.violations || 0) > 0).length;
    document.getElementById("stopped").textContent = arr.filter(x => (x.violations || 0) >= NEXORA_CONFIG.maxViolations).length;
    rows.innerHTML = arr.length ? arr.map(x => `
      <tr>
        <td>${x.at ? new Date(x.at).toLocaleString("id-ID") : "-"}</td>
        <td>${esc(x.name)}</td><td>${esc(x.className)}</td><td>${esc(x.subjectName)}</td>
        <td><span class="pill ${x.violations ? "warn":""}">${x.violations||0}</span></td>
        <td>${x.violations >= NEXORA_CONFIG.maxViolations ? "DIHENTIKAN" : x.violations ? "PERLU DIPERIKSA" : "NORMAL"}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">Belum ada data.</td></tr>`;
  }

  function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

  document.getElementById("refreshBtn").onclick = load;
  document.getElementById("clearBtn").onclick = () => {
    if (confirm("Hapus seluruh data monitoring lokal pada browser ini? (Data di Google Sheets, jika ada, TIDAK ikut terhapus.)")) {
      localStorage.removeItem("nexoraMonitoring"); load();
    }
  };

  load();
  setInterval(load, 15000);
})();
