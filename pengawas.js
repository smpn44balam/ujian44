/**
 * NEXORA EXAM - Dashboard Pengawas
 * File: pengawas.js (VERSI SEDERHANA — fase 14)
 *
 * DISEDERHANAKAN atas permintaan langsung: dashboard ini SEKARANG HANYA
 * membaca data dari Google Sheets lewat NEXORA_CONFIG.scriptUrl. Tidak ada
 * localStorage, tidak ada penggabungan data, tidak ada "sumber ganda" --
 * satu-satunya sumber kebenaran adalah sheet "ViolationLog" di Spreadsheet.
 * Ini sengaja dibuat sesederhana mungkin supaya tidak ada lagi kasus
 * "dashboard tidak sinkron dengan Spreadsheet" seperti sebelumnya.
 *
 * Kalau koneksi ke Spreadsheet gagal (offline / scriptUrl salah / Apps
 * Script sedang lambat), dashboard TIDAK mengarang data pengganti --
 * tabel tetap menampilkan data terakhir yang berhasil dimuat (supaya
 * tidak terlihat seolah "tidak ada pelanggaran" padahal cuma koneksi
 * yang lagi bermasalah sesaat), dan keterangan di atas tabel memberi
 * tahu bahwa koneksi sedang gagal.
 */
(() => {
  const rows = document.getElementById("rows");
  const sourceStatus = document.getElementById("sourceStatus");
  const lastUpdatedEl = document.getElementById("lastUpdated");

  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  async function fetchViolations() {
    const scriptUrl = window.NEXORA_CONFIG && (NEXORA_CONFIG.scriptUrl || NEXORA_CONFIG.monitoringUrl);
    if (!scriptUrl) return { violations: [], error: "scriptUrl belum diisi di config.js" };

    try {
      const controller = new AbortController();
      // 20 detik -- Apps Script (Execute as: Me) kadang butuh beberapa
      // detik untuk "bangun" kalau sedang idle, jadi timeout tidak boleh
      // terlalu ketat (lihat riwayat fase 13).
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      // Cache-busting param + cache:'no-store' -- cegah browser memakai
      // ulang response /exec yang sudah basi (lihat catatan di security.js
      // sendMonitoring untuk penjelasan lengkap kenapa ini wajib).
      const bustedUrl = scriptUrl + (scriptUrl.indexOf("?") === -1 ? "?" : "&") + "_ts=" + Date.now();
      const res = await fetch(bustedUrl, { method: "GET", cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return { violations: [], error: "http-" + res.status };
      const data = await res.json();
      if (!data || data.ok === false) return { violations: [], error: (data && data.error) || "unknown" };
      return { violations: Array.isArray(data.violations) ? data.violations : [], error: null };
    } catch (err) {
      const isAbort = err && (err.name === "AbortError" || /aborted/i.test(err.message || ""));
      const readable = isAbort ? "server tidak merespons dalam 20 detik (timeout)" : String((err && err.message) || err);
      return { violations: [], error: readable };
    }
  }

  async function load() {
    const result = await fetchViolations();

    if (sourceStatus) {
      sourceStatus.textContent = result.error
        ? "Gagal terhubung ke Spreadsheet (" + result.error + "). Menampilkan data terakhir yang berhasil dimuat."
        : "Terhubung ke Spreadsheet — data ini langsung dari Google Sheets.";
    }

    // Kalau polling kali ini gagal, JANGAN kosongkan tabel yang sudah
    // terisi -- biarkan data terakhir yang berhasil tetap tampil.
    if (result.error && rows.dataset.hasData === "1") return;

    const arr = result.violations.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    rows.dataset.hasData = arr.length ? "1" : "0";

    const uniqueStudents = new Set(arr.map(x => x.sessionId)).size;
    const stoppedStudents = new Set(
      arr.filter(x => (x.violationsAtThatTime || 0) >= NEXORA_CONFIG.maxViolations).map(x => x.sessionId)
    ).size;

    document.getElementById("total").textContent = arr.length;
    document.getElementById("flagged").textContent = uniqueStudents;
    document.getElementById("stopped").textContent = stoppedStudents;

    rows.innerHTML = arr.length ? arr.map(x => {
      const reachedLimit = (x.violationsAtThatTime || 0) >= NEXORA_CONFIG.maxViolations;
      const pillClass = reachedLimit ? "pg-pill-stop" : "pg-pill-warn";
      return `
      <tr>
        <td>${esc(x.waktu || (x.at ? new Date(x.at).toLocaleString("id-ID") : "-"))}</td>
        <td>${esc(x.name)}</td>
        <td>${esc(x.className)}</td>
        <td>${esc(x.details || x.violationType || "-")}</td>
        <td><span class="pg-pill ${pillClass}">${x.violationsAtThatTime || 0}/${NEXORA_CONFIG.maxViolations}</span> &middot; Total: ${x.totalViolationsAtThatTime || 0}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="5" class="pg-empty">Belum ada pelanggaran tercatat.</td></tr>`;

    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = "Diperbarui " + new Date().toLocaleTimeString("id-ID");
    }
  }

  document.getElementById("refreshBtn").onclick = load;

  load();
  setInterval(load, 15000);
})();
