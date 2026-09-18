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
   *
   * FUNGSI UTAMA:
   * - Timer ujian 90 menit
   * - Resume sesi setelah refresh
   * - Penalty pelanggaran:
   *   #1 = 1 menit 30 detik
   *   #2 = 5 menit
   *   #3 = ujian dihentikan
   * - Penalty tetap berjalan setelah refresh
   * - Timer ujian tetap berjalan selama penalty
   * - Google Form diblokir selama penalty
   * =========================================================
   */

  /*
   * Jika sesi sudah selesai, jangan izinkan
   * halaman ujian digunakan kembali.
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

  const timerEl =
    document.getElementById("timer");

  const badge =
    document.getElementById("violationBadge");

  const frame =
    document.getElementById("formFrame");

  const loading =
    document.getElementById("loading");

  const startOverlay =
    document.getElementById("startOverlay");

  const finished =
    document.getElementById("finished");

  const finishReason =
    document.getElementById("finishReason");

  const violationModal =
    document.getElementById("violationModal");

  const violationText =
    document.getElementById("violationText");

  const closeViolation =
    document.getElementById("closeViolation");

  const beginExamBtn =
    document.getElementById("beginExamBtn");

  const fullscreenBtn =
    document.getElementById("fullscreenBtn");

  const examIdentity =
    document.getElementById("examIdentity");

  examIdentity.textContent =
    `${session.name} • ${session.className} • ${session.subjectName}`;

  /*
   * URL Google Form tetap menggunakan URL
   * yang sudah dipilih pada halaman sebelumnya.
   */
  frame.src = session.formUrl;

  frame.addEventListener(
    "load",
    () => {
      loading.classList.add("hidden");
    }
  );

  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  let endAt = 0;

  let heartbeat = null;

  let timerInterval = null;

  let penaltyInterval = null;

  let finishedOnce = false;

  let examStarted = false;

  let penaltyActive = false;

  /*
   * =========================================================
   * PENALTY CONFIG
   * =========================================================
   */

  const FIRST_PENALTY_MS =
    90 * 1000;

  const SECOND_PENALTY_MS =
    5 * 60 * 1000;

  /*
   * =========================================================
   * SESSION STORAGE
   * =========================================================
   */

  function save() {
    session.violations =
      NexoraSecurity.getCount();

    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );
  }

  function savePenalty(penaltyUntil) {
    session.penaltyUntil =
      penaltyUntil;

    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );
  }

  function clearPenalty() {
    delete session.penaltyUntil;

    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );
  }

  /*
   * =========================================================
   * FORMAT WAKTU UJIAN
   * =========================================================
   */

  function formatTime(ms) {
    const total =
      Math.max(
        0,
        Math.ceil(ms / 1000)
      );

    const h =
      Math.floor(total / 3600);

    const m =
      Math.floor(
        (total % 3600) / 60
      );

    const s =
      total % 60;

    if (h > 0) {
      return (
        `${String(h).padStart(2, "0")}:` +
        `${String(m).padStart(2, "0")}:` +
        `${String(s).padStart(2, "0")}`
      );
    }

    return (
      `${String(m).padStart(2, "0")}:` +
      `${String(s).padStart(2, "0")}`
    );
  }

  /*
   * =========================================================
   * FORMAT WAKTU PENALTI
   * =========================================================
   *
   * Contoh:
   * 90 detik -> "1 menit 30 detik"
   * 60 detik -> "1 menit"
   * 5 menit  -> "5 menit"
   */

  function formatPenaltyTime(ms) {
    const totalSeconds =
      Math.max(
        0,
        Math.ceil(ms / 1000)
      );

    const minutes =
      Math.floor(
        totalSeconds / 60
      );

    const seconds =
      totalSeconds % 60;

    if (
      minutes > 0 &&
      seconds > 0
    ) {
      return (
        `${minutes} menit ` +
        `${seconds} detik`
      );
    }

    if (minutes > 0) {
      return `${minutes} menit`;
    }

    return `${seconds} detik`;
  }

  /*
   * =========================================================
   * BLOCK / UNBLOCK GOOGLE FORM
   * =========================================================
   */

  function blockForm() {
    penaltyActive = true;

    frame.style.pointerEvents =
      "none";

    frame.setAttribute(
      "aria-disabled",
      "true"
    );
  }

  function unblockForm() {
    penaltyActive = false;

    frame.style.pointerEvents =
      "auto";

    frame.removeAttribute(
      "aria-disabled"
    );
  }

  /*
   * =========================================================
   * TIMER UJIAN
   * =========================================================
   */

  function tick() {
    if (
      !examStarted ||
      finishedOnce
    ) {
      return;
    }

    const remaining =
      endAt - Date.now();

    timerEl.textContent =
      formatTime(remaining);

    timerEl.classList.toggle(
      "timer-danger",
      remaining <=
        5 * 60 * 1000
    );

    if (remaining <= 0) {
      finish(
        "Waktu ujian telah selesai."
      );
    }
  }

  /*
   * =========================================================
   * PENALTY COUNTDOWN
   * =========================================================
   */

  function getPenaltyRemaining() {
    if (
      !session.penaltyUntil
    ) {
      return 0;
    }

    return Math.max(
      0,
      Number(session.penaltyUntil) -
        Date.now()
    );
  }

  function updatePenaltyMessage(
    remainingMs
  ) {
    const info =
      session.currentViolationInfo;

    const title =
      info?.title ||
      "Peringatan Keamanan";

    const message =
      info?.message ||
      "Aktivitas yang tidak diperbolehkan terdeteksi selama ujian.";

    const reminder =
      info?.reminder ||
      "Tetap berada pada halaman ujian.";

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
      clearInterval(
        penaltyInterval
      );

      penaltyInterval = null;
    }

    clearPenalty();

    session.currentViolationInfo =
      null;

    unblockForm();

    violationModal.classList.add(
      "hidden"
    );

    tick();
  }

  function startPenalty(
    penaltyMs
  ) {
    if (finishedOnce) {
      return;
    }

    const penaltyUntil =
      Date.now() + penaltyMs;

    savePenalty(
      penaltyUntil
    );

    blockForm();

    violationModal.classList.remove(
      "hidden"
    );

    /*
     * Selama penalty berjalan,
     * tombol "Saya Mengerti" tidak boleh
     * menutup modal.
     */
    if (closeViolation) {
      closeViolation.textContent =
        "Menunggu Penalti...";

      closeViolation.disabled =
        true;
    }

    if (penaltyInterval) {
      clearInterval(
        penaltyInterval
      );
    }

    const update = () => {
      if (finishedOnce) {
        return;
      }

      const remaining =
        getPenaltyRemaining();

      if (remaining <= 0) {
        finishPenalty();
        return;
      }

      updatePenaltyMessage(
        remaining
      );

      /*
       * Timer utama tetap berjalan
       * selama penalty.
       */
      tick();
    };

    update();

    penaltyInterval =
      setInterval(
        update,
        500
      );
  }

  /*
   * =========================================================
   * RESUME PENALTY SETELAH REFRESH
   * =========================================================
   */

  function restorePenalty() {
    const remaining =
      getPenaltyRemaining();

    if (remaining <= 0) {
      if (session.penaltyUntil) {
        clearPenalty();
      }

      unblockForm();

      return;
    }

    blockForm();

    violationModal.classList.remove(
      "hidden"
    );

    if (closeViolation) {
      closeViolation.textContent =
        "Menunggu Penalti...";

      closeViolation.disabled =
        true;
    }

    if (penaltyInterval) {
      clearInterval(
        penaltyInterval
      );
    }

    const update = () => {
      if (finishedOnce) {
        return;
      }

      const left =
        getPenaltyRemaining();

      if (left <= 0) {
        finishPenalty();
        return;
      }

      updatePenaltyMessage(
        left
      );

      tick();
    };

    update();

    penaltyInterval =
      setInterval(
        update,
        500
      );
  }

  /*
   * =========================================================
   * VIOLATION
   * =========================================================
   */

  function showViolation(v) {
    if (finishedOnce) {
      return;
    }

    /*
     * Pastikan counter pada badge
     * mengikuti security engine.
     */
    badge.textContent =
      `⚠ ${v.count} / ${NEXORA_CONFIG.maxViolations}`;

    badge.classList.toggle(
      "danger",
      v.count >=
        NEXORA_CONFIG.maxViolations
    );

    /*
     * Simpan informasi bahasa siswa
     * agar bisa dipulihkan jika refresh
     * terjadi ketika modal/penalty aktif.
     */
    session.currentViolationInfo =
      v.studentInfo ||
      NexoraSecurity.getStudentViolationInfo(
        v.type
      );

    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );

    /*
     * =====================================================
     * PELANGGARAN KE-3
     * =====================================================
     *
     * Tidak diberikan penalty.
     * Sesi langsung dihentikan.
     */

    if (
      v.count >=
      NEXORA_CONFIG.maxViolations
    ) {
      violationModal.classList.add(
        "hidden"
      );

      finish(
        "Batas 3 indikator keamanan tercapai. Sesi NEXORA dihentikan."
      );

      return;
    }

    /*
     * =====================================================
     * PELANGGARAN #1
     * =====================================================
     */

    if (v.count === 1) {
      startPenalty(
        FIRST_PENALTY_MS
      );

      return;
    }

    /*
     * =====================================================
     * PELANGGARAN #2
     * =====================================================
     */

    if (v.count === 2) {
      startPenalty(
        SECOND_PENALTY_MS
      );

      return;
    }

    /*
     * Fallback jika suatu saat
     * konfigurasi berubah.
     */
    violationModal.classList.remove(
      "hidden"
    );

    updatePenaltyMessage(0);
  }

  /*
   * =========================================================
   * CLOSE VIOLATION
   * =========================================================
   */

  closeViolation?.addEventListener(
    "click",
    () => {
      /*
       * Selama penalty aktif,
       * modal tidak boleh ditutup.
       */
      if (penaltyActive) {
        return;
      }

      violationModal.classList.add(
        "hidden"
      );
    }
  );

  /*
   * =========================================================
   * FULLSCREEN BUTTON
   * =========================================================
   */

  fullscreenBtn?.addEventListener(
    "click",
    () => {
      if (
        !finishedOnce &&
        !penaltyActive
      ) {
        NexoraSecurity.enterFullscreen();
      }
    }
  );

  /*
   * =========================================================
   * START EXAM
   * =========================================================
   */

  async function startExam(
    isResume = false
  ) {
    if (
      examStarted ||
      finishedOnce
    ) {
      return;
    }

    /*
     * =====================================================
     * RESUME SESI YANG SUDAH BERJALAN
     * =====================================================
     */

    if (
      isResume &&
      session.status === "ONGOING" &&
      session.startedAt &&
      session.durationMs
    ) {
      examStarted = true;

      endAt =
        Number(session.startedAt) +
        Number(session.durationMs);

      startOverlay.classList.add(
        "hidden"
      );

      /*
       * Browser bisa menolak fullscreen
       * setelah refresh karena tidak ada
       * user gesture. Kita tetap melanjutkan
       * sesi agar timer tidak reset.
       */
      await NexoraSecurity.enterFullscreen();

      NexoraSecurity.arm();

      startHeartbeat();

      startTimer();

      restorePenalty();

      tick();

      return;
    }

    /*
     * =====================================================
     * START BARU
     * =====================================================
     */

    examStarted = true;

    session.startedAt =
      Date.now();

    session.durationMs =
      NEXORA_CONFIG.durationMinutes *
      60 *
      1000;

    endAt =
      session.startedAt +
      session.durationMs;

    session.status =
      "ONGOING";

    session.violations =
      NexoraSecurity.getCount();

    delete session.penaltyUntil;

    delete session.currentViolationInfo;

    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );

    startOverlay.classList.add(
      "hidden"
    );

    await NexoraSecurity.enterFullscreen();

    NexoraSecurity.arm();

    NexoraSecurity.sendMonitoring(
      "start",
      {
        formUrl:
          session.formUrl,

        startedAt:
          session.startedAt,

        durationMs:
          session.durationMs
      }
    );

    startHeartbeat();

    startTimer();

    tick();
  }

  /*
   * =========================================================
   * START TIMER
   * =========================================================
   */

  function startTimer() {
    if (timerInterval) {
      clearInterval(
        timerInterval
      );
    }

    timerInterval =
      setInterval(
        tick,
        500
      );

    tick();
  }

  /*
   * =========================================================
   * HEARTBEAT
   * =========================================================
   */

  function startHeartbeat() {
    if (heartbeat) {
      clearInterval(
        heartbeat
      );
    }

    heartbeat =
      setInterval(
        () => {
          if (
            finishedOnce
          ) {
            return;
          }

          NexoraSecurity.sendMonitoring(
            "heartbeat",
            {
              remainingMs:
                Math.max(
                  0,
                  endAt -
                    Date.now()
                ),

              penaltyRemainingMs:
                getPenaltyRemaining(),

              violations:
                NexoraSecurity.getCount(),

              penaltyActive:
                penaltyActive
            }
          );
        },
        20000
      );
  }

  /*
   * =========================================================
   * BUTTON MULAI
   * =========================================================
   */

  beginExamBtn?.addEventListener(
    "click",
    async () => {
      await startExam(false);
    }
  );

  /*
   * =========================================================
   * SECURITY CALLBACK
   * =========================================================
   */

  NexoraSecurity.setCallback(
    showViolation
  );

  /*
   * =========================================================
   * FINISH
   * =========================================================
   */

  function finish(reason) {
    if (finishedOnce) {
      return;
    }

    finishedOnce = true;

    /*
     * 1. Hentikan timer.
     */
    if (timerInterval) {
      clearInterval(
        timerInterval
      );

      timerInterval = null;
    }

    /*
     * 2. Hentikan heartbeat.
     */
    if (heartbeat) {
      clearInterval(
        heartbeat
      );

      heartbeat = null;
    }

    /*
     * 3. Hentikan penalty timer.
     */
    if (penaltyInterval) {
      clearInterval(
        penaltyInterval
      );

      penaltyInterval = null;
    }

    /*
     * 4. Matikan security.
     */
    NexoraSecurity.disarm();

    /*
     * 5. Hapus penalty.
     */
    delete session.penaltyUntil;

    session.currentViolationInfo =
      null;

    /*
     * 6. Tandai sesi selesai.
     */
    session.endedAt =
      Date.now();

    session.status =
      "FINISHED";

    session.endReason =
      reason;

    save();

    /*
     * 7. Kirim finish ke server.
     */
    NexoraSecurity.sendMonitoring(
      "finish",
      {
        reason,

        violations:
          NexoraSecurity.getCount()
      }
    );

    /*
     * 8. Putus akses ke Google Form.
     */
    frame.src =
      "about:blank";

    frame.classList.add(
      "hidden"
    );

    frame.style.pointerEvents =
      "none";

    /*
     * 9. Tutup fullscreen.
     */
    try {
      const exitPromise =
        document.exitFullscreen?.();

      exitPromise?.catch?.(
        () => {}
      );
    } catch {}

    /*
     * 10. Tutup modal.
     */
    violationModal?.classList.add(
      "hidden"
    );

    /*
     * 11. Tampilkan layar selesai.
     */
    finished.classList.remove(
      "hidden"
    );

    finishReason.textContent =
      reason;
  }

  /*
   * =========================================================
   * INITIALIZATION
   * =========================================================
   *
   * Jika halaman baru:
   *   tampilkan tombol mulai.
   *
   * Jika refresh saat ONGOING:
   *   lanjutkan sesi lama.
   */

  if (
    session.status === "ONGOING" &&
    session.startedAt &&
    session.durationMs
  ) {
    startExam(true);
  } else {
    startOverlay.classList.remove(
      "hidden"
    );
  }

})();
