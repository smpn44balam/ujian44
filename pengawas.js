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
      // Fase 12: dinaikkan dari 8 detik -> 20 detik. Apps Script (Execute
      // as: Me) sering butuh beberapa detik untuk "bangun" kalau sedang
      // idle, dan makin banyak baris di sheet Sessions/ViolationLog makin
      // lama juga waktu doGet membaca semuanya. 8 detik terlalu ketat dan
      // bisa memicu abort padahal server sebenarnya cuma lambat, bukan mati.
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      // Cache-busting param + cache:'no-store' -- cegah browser menampilkan
      // data polling yang sudah basi (lihat catatan di security.js sendMonitoring
      // untuk penjelasan lengkap kenapa request ke URL /exec Apps Script ini
      // rawan ke-cache oleh browser).
      const bustedUrl = scriptUrl + (scriptUrl.indexOf('?') === -1 ? '?' : '&') + '_ts=' + Date.now();
      const res = await fetch(bustedUrl, { method: 'GET', cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return { sessions: [], error: 'http-' + res.status };
      const data = await res.json();
      if (!data || data.ok === false) return { sessions: [], error: data && data.error || 'unknown' };
      return { sessions: Array.isArray(data.sessions) ? data.sessions : [], error: null };
    } catch (err) {
      // Kemungkinan besar CORS diblokir, offline, scriptUrl salah, atau
      // Apps Script tidak merespons dalam batas waktu (lihat komentar di
      // atas soal timeout 20 detik).
      const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''));
      const readable = isAbort ? 'server tidak merespons dalam 20 detik (timeout)' : String(err && err.message || err);
      return { sessions: [], error: readable };
    }
  }

  const lastUpdatedEl = document.getElementById("lastUpdated");

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
    sourceStatus.textContent = "Sumber: Google Sheets (pusat, lintas-device) — data langsung dari Spreadsheet.";
  }

  async function load() {
    const remoteResult = await readRemoteSessions();
    lastRemoteError = remoteResult.error;
    renderStatus(remoteResult);

    // Fase 13 -- PERBAIKAN PENTING: sebelumnya data lokal browser ini SELALU
    // digabung (mergeSessions) dengan data Google Sheets, apa pun hasilnya.
    // Ini menyebabkan dashboard "tidak sinkron dengan Spreadsheet" kalau
    // browser yang sama pernah dipakai untuk testing sebelumnya -- entri
    // localStorage yang basi (dari sesi lama, kadang dari sebelum ganti ke
    // deployment Apps Script yang baru) ikut tercampur dan menimpa angka
    // yang sebenarnya sudah benar di Spreadsheet, karena mergeSessions
    // memilih berdasarkan `at` paling baru -- bukan berdasarkan mana yang
    // BENAR. Sekarang: kalau Google Sheets berhasil diambil (tidak error),
    // dashboard HANYA memakai data itu, apa adanya -- supaya yang tampil di
    // sini dijamin identik dengan isi sheet "Sessions" di Spreadsheet. Data
    // lokal browser baru dipakai sebagai cadangan darurat kalau Sheets-nya
    // benar-benar gagal diakses (offline / scriptUrl salah / config belum
    // diisi) -- lihat cabang else di bawah.
    const arr = (remoteResult.error ? readLocalSessions() : remoteResult.sessions.slice())
      .sort((a, b) => (b.at || 0) - (a.at || 0));

    document.getElementById("total").textContent = arr.length;
    document.getElementById("flagged").textContent = arr.filter(x => (x.violations || 0) > 0).length;
    document.getElementById("stopped").textContent = arr.filter(x => (x.violations || 0) >= NEXORA_CONFIG.maxViolations).length;

    rows.innerHTML = arr.length ? arr.map(x => {
      const stopped = (x.violations || 0) >= NEXORA_CONFIG.maxViolations;
      const flagged = (x.violations || 0) > 0;
      const statusClass = stopped ? "pg-status-stopped" : flagged ? "pg-status-review" : "pg-status-normal";
      const statusText = stopped ? "DIHENTIKAN" : flagged ? "PERLU DIPERIKSA" : "NORMAL";
      return `
      <tr>
        <td>${x.at ? new Date(x.at).toLocaleString("id-ID") : "-"}</td>
        <td>${esc(x.name)}</td><td>${esc(x.className)}</td><td>${esc(x.subjectName)}</td>
        <td><span class="pg-pill ${flagged ? "pg-pill-warn" : ""}">${x.violations || 0}/${NEXORA_CONFIG.maxViolations}</span> &middot; Total: ${x.totalViolations || 0}</td>
        <td><span class="pg-status ${statusClass}">${statusText}</span></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="pg-empty">Belum ada data peserta ujian.</td></tr>`;

    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = "Diperbarui " + new Date().toLocaleTimeString("id-ID");
    }
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
