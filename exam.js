(() => {
  const session = JSON.parse(
    sessionStorage.getItem("nexoraSession") || "null"
  );

  if (!session) {
    location.href = "index.html";
    return;
  }

  /*
   * =========================================================
   * NEXORA EXAM — EXAM ENGINE
   * SMP NEGERI 44 BANDAR LAMPUNG
   * =========================================================
   */

  if (
    session.status === "FINISHED" ||
    session.endedAt
  ) {
    location.href = "index.html";
    return;
  }

  /*
   * =========================================================
   * ELEMENT
   * =========================================================
   */

  const timerEl = document.getElementById("timer");
  const badge = document.getElementById("violationBadge");
  const frame = document.getElementById("formFrame");
  const loading = document.getElementById("loading");
  const startOverlay = document.getElementById("startOverlay");
  const finished = document.getElementById("finished");
  const finishReason = document.getElementById("finishReason");
  const violationModal = document.getElementById("violationModal");
  const violationText = document.getElementById("violationText");
  const closeViolation = document.getElementById("closeViolation");
  const beginExamBtn = document.getElementById("beginExamBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const examIdentity = document.getElementById("examIdentity");

  examIdentity.textContent = `${session.name} • ${session.className} • ${session.subjectName}`;

  frame.src = session.formUrl;

  frame.addEventListener("load", () => {
    loading.classList.add("hidden");
  });

  /*
   * =========================================================
   * JAM REAL-TIME (CLIENT-SIDE)
   * =========================================================
   */
  function updateRealtimeClock() {
    const now = new Date();
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;
    
    const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const hari = namaHari[now.getDay()];
    const tanggal = now.getDate();
    const bulan = namaBulan[now.getMonth()];
    const tahun = now.getFullYear();
    const dateString = `${hari}, ${tanggal} ${bulan} ${tahun}`;

    const clockEl = document.getElementById('realtimeClock');
    const dateEl = document.getElementById('realtimeDate');
    
    if (clockEl) clockEl.textContent = timeString;
    if (dateEl) dateEl.textContent = dateString;
  }

  updateRealtimeClock();
  setInterval(updateRealtimeClock, 1000);

  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  let endAt = 0;
  let heartbeat = null; // Dibiarkan null, interval sengaja dinonaktifkan
  let timerInterval = null;
  let penaltyInterval = null;
  let finishedOnce = false;
  let examStarted = false;
  let penaltyActive = false;
  let thirdViolationInterval = null;

  /*
   * =========================================================
   * PENALTY CONFIG
   * =========================================================
   */

  const FIRST_PENALTY_MS = 90 * 1000;
  const SECOND_PENALTY_MS = 5 * 60 * 1000;
  const THIRD_RELOGIN_WAIT_MS = 60 * 1000;

  /*
   * =========================================================
   * SESSION STORAGE
   * =========================================================
   */

  function save() {
    session.violations = NexoraSecurity.getCount();
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));
  }

  function savePenalty(penaltyUntil) {
    session.penaltyUntil = penaltyUntil;
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));
  }

  function clearPenalty() {
    delete session.penaltyUntil;
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));
  }

  /*
   * =========================================================
   * FORMAT WAKTU
   * =========================================================
   */

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatPenaltyTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0 && seconds > 0) {
      return `${minutes} menit ${seconds} detik`;
    }
    if (minutes > 0) return `${minutes} menit`;
    return `${seconds} detik`;
  }

  /*
   * =========================================================
   * BLOCK / UNBLOCK GOOGLE FORM
   * =========================================================
   */

  function blockForm() {
    penaltyActive = true;
    frame.style.pointerEvents = "none";
    frame.setAttribute("aria-disabled", "true");
  }

  function unblockForm() {
    penaltyActive = false;
    frame.style.pointerEvents = "auto";
    frame.removeAttribute("aria-disabled");
  }

  /*
   * =========================================================
   * TIMER UJIAN
   * =========================================================
   */

  function tick() {
    if (!examStarted || finishedOnce) return;

    const remaining = endAt - Date.now();
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.toggle("timer-danger", remaining <= 5 * 60 * 1000);

    if (remaining <= 0) {
      finish("Waktu ujian telah selesai.");
    }
  }

  /*
   * =========================================================
   * PENALTY COUNTDOWN
   * =========================================================
   */

  function getPenaltyRemaining() {
    if (!session.penaltyUntil) return 0;
    return Math.max(0, Number(session.penaltyUntil) - Date.now());
  }

  function updatePenaltyMessage(remainingMs) {
    const info = session.currentViolationInfo;
    const title = info?.title || "Peringatan Keamanan";
    const message = info?.message || "Aktivitas yang tidak diperbolehkan terdeteksi selama ujian.";
    const reminder = info?.reminder || "Tetap berada pada halaman ujian.";

    violationText.innerHTML = `
      <strong>${title}</strong>
      <br><br>
      ${message}
      <br><br>
      ${reminder}
      <br><br>
      <strong>
        Waktu penalti:
        ${formatPenaltyTime(remainingMs)}
      </strong>
      <br>
      Selama penalti berlangsung, lembar ujian tidak dapat digunakan.
    `;
  }

  function finishPenalty() {
    if (penaltyInterval) {
      clearInterval(penaltyInterval);
      penaltyInterval = null;
    }

    clearPenalty();
    session.currentViolationInfo = null;
    unblockForm();
    violationModal.classList.add("hidden");
    tick();
  }

  function startPenalty(penaltyMs) {
    if (finishedOnce) return;

    const penaltyUntil = Date.now() + penaltyMs;
    savePenalty(penaltyUntil);
    blockForm();
    violationModal.classList.remove("hidden");

    if (closeViolation) {
      closeViolation.textContent = "Menunggu Penalti...";
      closeViolation.disabled = true;
    }

    if (penaltyInterval) clearInterval(penaltyInterval);

    const update = () => {
      if (finishedOnce) return;
      const remaining = getPenaltyRemaining();
      if (remaining <= 0) {
        finishPenalty();
        return;
      }
      updatePenaltyMessage(remaining);
      tick();
    };

    update();
    penaltyInterval = setInterval(update, 500);
  }

  function restorePenalty() {
    if (restoreThirdReloginLock()) return;

    const remaining = getPenaltyRemaining();
    if (remaining <= 0) {
      if (session.penaltyUntil) clearPenalty();
      unblockForm();
      return;
    }

    blockForm();
    violationModal.classList.remove("hidden");

    if (closeViolation) {
      closeViolation.textContent = "Menunggu Penalti...";
      closeViolation.disabled = true;
    }

    if (penaltyInterval) clearInterval(penaltyInterval);

    const update = () => {
      if (finishedOnce) return;
      const left = getPenaltyRemaining();
      if (left <= 0) {
        finishPenalty();
        return;
      }
      updatePenaltyMessage(left);
      tick();
    };

    update();
    penaltyInterval = setInterval(update, 500);
  }

  /*
   * =========================================================
   * PELANGGARAN KE-3 — RELOGIN LOCK
   * =========================================================
   */

  function getThirdReloginRemaining() {
    if (!session.thirdReloginUntil) return 0;
    return Math.max(0, Number(session.thirdReloginUntil) - Date.now());
  }

  function updateThirdReloginMessage(remainingMs) {
    const info = session.currentViolationInfo;
    const title = info?.title || "Pelanggaran keamanan terdeteksi.";
    const message = info?.message || "Sistem mendeteksi aktivitas yang tidak diperbolehkan selama ujian.";

    violationText.innerHTML = `
      <strong>Pelanggaran ke-3 Terdeteksi</strong>
      <br><br>
      ${title}
      <br><br>
      ${message}
      <br><br>
      <strong>Ujian sementara dikunci.</strong>
      <br>
      Silakan tetap berada di tempat dan tunggu sampai proses ini selesai.
      <br><br>
      <strong>
        Sesi akan ditutup dalam:
        ${formatPenaltyTime(remainingMs)}
      </strong>
      <br><br>
      Setelah waktu tunggu selesai, kamu akan dikembalikan ke halaman login.
      Untuk masuk kembali ke ujian, kamu harus login lagi seperti sebelumnya.
    `;
  }

  function redirectToRelogin() {
    if (thirdViolationInterval) {
      clearInterval(thirdViolationInterval);
      thirdViolationInterval = null;
    }

    session.status = "RELOGIN_REQUIRED";
    session.reloginRequired = true;
    session.reloginAt = Date.now();
    delete session.thirdReloginUntil;
    session.currentViolationInfo = null;

    sessionStorage.setItem("nexoraSession", JSON.stringify(session));

    NexoraSecurity.disarm();
    if (timerInterval) clearInterval(timerInterval);
    if (penaltyInterval) clearInterval(penaltyInterval);

    frame.src = "about:blank";
    frame.classList.add("hidden");
    frame.style.pointerEvents = "none";

    try {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
    } catch {}

    NexoraSecurity.sendMonitoring("relogin_required", {
      reason: "Pelanggaran ke-3",
      violations: NexoraSecurity.getCount(),
      remainingMs: Math.max(0, endAt - Date.now())
    });

    window.location.replace("index.html");
  }

  function startThirdReloginLock() {
    if (finishedOnce) return;

    session.thirdReloginUntil = Date.now() + THIRD_RELOGIN_WAIT_MS;
    session.reloginRequired = false;
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));

    blockForm();
    violationModal.classList.remove("hidden");

    if (closeViolation) {
      closeViolation.textContent = "Menunggu 60 Detik...";
      closeViolation.disabled = true;
    }

    if (thirdViolationInterval) clearInterval(thirdViolationInterval);

    const update = () => {
      if (finishedOnce) return;
      const remaining = getThirdReloginRemaining();
      if (remaining <= 0) {
        updateThirdReloginMessage(0);
        redirectToRelogin();
        return;
      }
      updateThirdReloginMessage(remaining);
      tick();
    };

    update();
    thirdViolationInterval = setInterval(update, 500);
  }

  function restoreThirdReloginLock() {
    if (!session.thirdReloginUntil) return false;

    blockForm();
    violationModal.classList.remove("hidden");

    if (thirdViolationInterval) clearInterval(thirdViolationInterval);

    const update = () => {
      if (finishedOnce) return;
      const remaining = getThirdReloginRemaining();
      if (remaining <= 0) {
        updateThirdReloginMessage(0);
        redirectToRelogin();
        return;
      }
      updateThirdReloginMessage(remaining);
      tick();
    };

    update();
    thirdViolationInterval = setInterval(update, 500);

    return true;
  }

  /*
   * =========================================================
   * VIOLATION
   * =========================================================
   */

  function showViolation(v) {
    if (finishedOnce) return;

    badge.textContent = `⚠ ${v.count} / ${NEXORA_CONFIG.maxViolations}`;
    badge.classList.toggle("danger", v.count >= NEXORA_CONFIG.maxViolations);

    session.currentViolationInfo = v.studentInfo || NexoraSecurity.getStudentViolationInfo(v.type);
    sessionStorage.setItem("nexoraSession", JSON.stringify(session));

    if (v.count >= NEXORA_CONFIG.maxViolations) {
      startThirdReloginLock();
      return;
    }

    if (v.count === 1) {
      startPenalty(FIRST_PENALTY_MS);
      return;
    }

    if (v.count === 2) {
      startPenalty(SECOND_PENALTY_MS);
      return;
    }

    violationModal.classList.remove("hidden");
    updatePenaltyMessage(0);
  }

  closeViolation?.addEventListener("click", () => {
    if (penaltyActive) return;
    violationModal.classList.add("hidden");
  });

  fullscreenBtn?.addEventListener("click", () => {
    if (!finishedOnce && !penaltyActive) {
      NexoraSecurity.enterFullscreen();
    }
  });

  /*
   * =========================================================
   * START EXAM
   * =========================================================
   */

  async function startExam(isResume = false) {
    if (examStarted || finishedOnce) return;

    if (isResume && session.status === "ONGOING" && session.startedAt && session.durationMs) {
      examStarted = true;
      endAt = Number(session.startedAt) + Number(session.durationMs);
      startOverlay.classList.add("hidden");

      await NexoraSecurity.enterFullscreen();
      NexoraSecurity.arm();
      startHeartbeat();
      startTimer();
      restorePenalty();
      tick();
      return;
    }

    examStarted = true;
    session.startedAt = Date.now();
    session.durationMs = NEXORA_CONFIG.durationMinutes * 60 * 1000;
    endAt = session.startedAt + session.durationMs;
    session.status = "ONGOING";
    session.violations = NexoraSecurity.getCount();

    delete session.penaltyUntil;
    delete session.thirdReloginUntil;
    delete session.reloginRequired;
    delete session.reloginAt;
    delete session.currentViolationInfo;

    sessionStorage.setItem("nexoraSession", JSON.stringify(session));
    startOverlay.classList.add("hidden");

    NexoraSecurity.initializeAudio?.();
    await NexoraSecurity.enterFullscreen();
    NexoraSecurity.arm();

    // Data "start" tidak lagi dikirim berkat Gatekeeper di security.js
    NexoraSecurity.sendMonitoring("start", {
      formUrl: session.formUrl,
      startedAt: session.startedAt,
      durationMs: session.durationMs
    });

    startHeartbeat();
    startTimer();
    tick();
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tick, 500);
    tick();
  }

  /*
   * =========================================================
   * MATIKAN HEARTBEAT
   * =========================================================
   */
  function startHeartbeat() {
    // Fungsi ini dikosongkan. 
    // Sistem tidak akan lagi melempar request setiap 20/90 detik ke Google Apps Script.
    // Ini menghemat kuota server dan mencegah lag.
  }

  beginExamBtn?.addEventListener("click", async () => {
    await startExam(false);
  });

  NexoraSecurity.setCallback(showViolation);

  /*
   * =========================================================
   * FINISH
   * =========================================================
   */

  function finish(reason) {
    if (finishedOnce) return;
    finishedOnce = true;

    if (timerInterval) clearInterval(timerInterval);
    if (penaltyInterval) clearInterval(penaltyInterval);
    if (thirdViolationInterval) clearInterval(thirdViolationInterval);
    
    // Heartbeat variabel ada tetapi sengaja dihiraukan.

    NexoraSecurity.disarm();

    delete session.penaltyUntil;
    delete session.thirdReloginUntil;
    delete session.reloginRequired;
    delete session.reloginAt;
    session.currentViolationInfo = null;
    
    session.endedAt = Date.now();
    session.status = "FINISHED";
    session.endReason = reason;

    save();

    // Data "finish" tidak lagi dikirim berkat Gatekeeper di security.js
    NexoraSecurity.sendMonitoring("finish", {
      reason,
      violations: NexoraSecurity.getCount()
    });

    frame.src = "about:blank";
    frame.classList.add("hidden");
    frame.style.pointerEvents = "none";

    try {
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
    } catch {}

    violationModal?.classList.add("hidden");
    finished.classList.remove("hidden");
    finishReason.textContent = reason;
  }

  if (session.status === "ONGOING" && session.startedAt && session.durationMs) {
    startExam(true);
  } else {
    startOverlay.classList.remove("hidden");
  }

})();
