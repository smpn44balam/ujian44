/**
 * Pengendali halaman siswa.html (Pemeriksaan Data & Sistem).
 * PERBAIKAN: sebelumnya file ini membaca key "nexoraCandidate" dan menulis
 * ke key "nexoraSession" (tanpa underscore) — key yang TIDAK PERNAH dibaca
 * oleh exam.js (yang membaca "nexora_session"). Akibatnya progres di sini
 * "hilang" dan timer/relogin jadi tidak sinkron. Sekarang semua memakai
 * satu key yang sama: "nexora_session".
 */
(() => {
  let candidate = null;
  try {
    const raw = sessionStorage.getItem("nexora_session") || localStorage.getItem("nexora_session");
    candidate = JSON.parse(raw || "null");
  } catch (e) {
    candidate = null;
  }

  if (!candidate || !candidate.formUrl) {
    location.href = "index.html";
    return;
  }

  document.getElementById("name").textContent = candidate.name || candidate.nama || "-";
  document.getElementById("className").textContent = candidate.className || candidate.kelas || "-";
  document.getElementById("level").textContent = candidate.level || "-";
  document.getElementById("subject").textContent = candidate.subjectName || candidate.mapel || "-";

  document.getElementById("backBtn").addEventListener("click", () => {
    location.href = "index.html";
  });

  document.getElementById("startBtn").addEventListener("click", () => {
    // Jangan set startedAt di sini. Timer harus baru mulai berjalan saat
    // siswa benar-benar menekan "Mulai & Masuk Fullscreen" di ujian.html,
    // karena permintaan Fullscreen API wajib dipicu langsung oleh gesture
    // klik di halaman itu (browser akan menolak jika dipanggil dari halaman
    // sebelumnya / lewat navigasi). exam.js yang akan mengisi startedAt.
    candidate.status = "ONGOING";
    const jsonString = JSON.stringify(candidate);
    sessionStorage.setItem("nexora_session", jsonString);
    localStorage.setItem("nexora_session", jsonString);
    location.href = "ujian.html";
  });
})();
