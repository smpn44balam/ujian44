(() => {
  /*
   * =========================================================
   * NEXORA EXAM — EXAM ENGINE
   * SMP NEGERI 44 BANDAR LAMPUNG
   * =========================================================
   *
   * ATURAN PELANGGARAN:
   *
   * Pelanggaran 1  → 1 menit 30 detik
   * Pelanggaran 2  → 5 menit
   * Pelanggaran 3  → Ujian dihentikan
   *
   * CATATAN:
   * - Timer hukuman disimpan di sessionStorage.
   * - Refresh tidak menghapus hukuman.
   * - Timer ujian tetap berjalan selama hukuman.
   * - Sesi ONGOING dipulihkan setelah refresh.
   * =========================================================
   */

  const session = JSON.parse(
    sessionStorage.getItem("nexoraSession") || "null"
  );

  if (!session) {
    location.href = "index.html";
    return;
  }

  /*
   * Jika sesi sudah selesai, jangan izinkan halaman
   * ujian digunakan kembali.
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

  /*
   * =========================================================
   * IDENTITAS PESERTA
   * =========================================================
   */

  document.getElementById(
    "examIdentity"
  ).textContent =
    `${session.name} • ${session.className} • ${session.subjectName}`;

  /*
   * Google Form tetap dimuat sejak awal.
   * Hukuman akan memblokir interaksi menggunakan
   * pointer-events + modal.
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
   * Durasi hukuman.
   */
  const PENALTY_FIRST =
    90 * 1000; // 1 menit 30 detik

  const PENALTY_SECOND =
    5 * 60 * 1000; // 5 menit

  /*
   * =========================================================
   * SESSION SAVE
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

  /*
   * =========================================================
   * VIOLATION COUNT
   * =========================================================
   *
   * Ambil jumlah dari security engine.
   * Jika security engine belum memulihkan count,
   * gunakan count yang sudah tersimpan dalam session.
   * =========================================================
   */

  function getViolationCount() {
    const securityCount =
      Number(
        NexoraSecurity.getCount()
      ) || 0;

    const sessionCount =
      Number(
        session.violations
      ) || 0;

    return Math.max(
      securityCount,
      sessionCount
    );
  }

  /*
   * =========================================================
   * TIME FORMAT
   * =========================================================
   */

  function formatTime(ms) {
    const total =
      Math.max(
        0,
        Math.ceil(ms / 1000)
      );

    const h =
      Math.floor(
        total / 3600
      );

    const m =
      Math.floor(
        (total % 3600) / 60
      );

    const s =
      total % 60;

    return h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /*
   * =========================================================
   * HUMAN PENALTY TIME
   * =========================================================
   *
   * Contoh:
   * 90 detik → "1 menit 30 detik"
   * 300 detik → "5 menit"
   * =========================================================
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
      return `${minutes} menit ${seconds} detik`;
    }

    if (
      minutes > 0
    ) {
      return `${minutes} menit`;
    }

    return `${seconds} detik`;
  }

  /*
   * =========================================================
   * STUDENT-FACING VIOLATION TEXT
   * =========================================================
   *
   * Kode teknis tidak ditampilkan kepada siswa.
   *
   * WINDOW_BLUR dan VISIBILITY_HIDDEN
   * digabung menjadi:
   *
   * "Meninggalkan Halaman Ujian"
   * =========================================================
   */

  function getStudentViolationInfo(type) {
    /*
     * FULLSCREEN
     */
    if (
      type === "FULLSCREEN_EXIT"
    ) {
      return {
        category:
          "Keluar dari Mode Layar Penuh",

        title:
          "Kamu terdeteksi keluar dari mode layar penuh.",

        message:
          "Silakan kembali ke mode layar penuh (Fullscreen) untuk melanjutkan ujian.",

        reminder:
          "Dilarang membuka Google, tab lain, atau aplikasi lain selama ujian berlangsung."
      };
    }

    /*
     * WINDOW BLUR + VISIBILITY HIDDEN
     */
    if (
      type === "WINDOW_BLUR" ||
      type === "VISIBILITY_HIDDEN"
    ) {
      return {
        category:
          "Meninggalkan Halaman Ujian",

        title:
          "Kamu terdeteksi meninggalkan halaman ujian.",

        message:
          "Jangan membuka Google, tab lain, aplikasi lain, atau berpindah dari halaman ujian selama ujian berlangsung.",

        reminder:
          "Silakan kembali ke halaman ujian untuk melanjutkan."
      };
    }

    /*
     * DEVTOOLS
     */
    if (
      type === "DEVTOOLS_SHORTCUT"
    ) {
      return {
        category:
          "Fitur yang Tidak Diizinkan",

        title:
          "Kamu terdeteksi mencoba membuka fitur yang tidak diperbolehkan selama ujian.",

        message:
          "Jangan membuka Developer Tools atau fitur pengembang browser selama ujian berlangsung.",

        reminder:
          "Tetap berada pada halaman ujian dan gunakan browser hanya untuk mengerjakan soal."
      };
    }

    /*
     * FALLBACK
     */
    return {
      category:
        "Aktivitas Tidak Diizinkan",

      title:
        "Kamu terdeteksi melakukan aktivitas yang tidak diperbolehkan selama ujian.",

      message:
        "Tetap berada pada halaman ujian dan jangan membuka hal lain selama pengerjaan.",

      reminder:
        "Silakan kembali fokus mengerjakan ujian."
    };
  }

  /*
   * =========================================================
   * TIMER UJIAN
   * =========================================================
   *
   * Timer ujian TETAP BERJALAN selama hukuman.
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

    if (
      remaining <= 0
    ) {
      finish(
        "Waktu ujian telah selesai."
      );
    }
  }

  /*
   * =========================================================
   * PENALTY STORAGE
   * =========================================================
   */

  function savePenalty(
    until,
    duration,
    violationNumber
  ) {
    session.penaltyUntil =
      until;

    session.penaltyDurationMs =
      duration;

    session.penaltyViolation =
      violationNumber;

    session.penaltyStartedAt =
      Date.now();

    save();
  }

  function clearPenalty() {
    delete session.penaltyUntil;
    delete session.penaltyDurationMs;
    delete session.penaltyViolation;
    delete session.penaltyStartedAt;

    save();
  }

  function getPenaltyRemaining() {
    const until =
      Number(
        session.penaltyUntil
      ) || 0;

    return Math.max(
      0,
      until - Date.now()
    );
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
      "aria-hidden",
      "true"
    );
  }

  function unblockForm() {
    penaltyActive = false;

    frame.style.pointerEvents =
      "";

    frame.removeAttribute(
      "aria-hidden"
    );
  }

  /*
   * =========================================================
   * UPDATE PENALTY MODAL
   * =========================================================
   */

  function updatePenaltyModal(
    remaining,
    violationNumber,
    info
  ) {
    const readable =
      formatPenaltyTime(
        remaining
      );

    const total =
      NEXORA_CONFIG.maxViolations;

    violationText.innerHTML = `
      <div class="violation-content">

        <div class="violation-label">
          PELANGGARAN ${violationNumber} DARI ${total}
        </div>

        <h3>
          ${info.category}
        </h3>

        <p>
          ${info.title}
        </p>

        <p>
          ${info.message}
        </p>

        <p>
          ${info.reminder}
        </p>

        <div class="penalty-box">
          <span class="penalty-label">
            AKSES SOAL DITANGGUHKAN
          </span>

          <strong
            id="penaltyCountdown"
          >
            ${readable}
          </strong>
        </div>

      </div>
    `;

    /*
     * Selama hukuman tombol tidak boleh
     * menutup modal.
     */
    closeViolation.disabled =
      true;

    closeViolation.textContent =
      "Tunggu sampai waktu selesai";
  }

  /*
   * =========================================================
   * START PENALTY
   * =========================================================
   */

  function startPenalty(
    violationNumber,
    type
  ) {
    if (
      finishedOnce
    ) {
      return;
    }

    /*
     * Pelanggaran ketiga tidak mendapatkan
     * hukuman waktu.
     *
     * Ujian langsung dihentikan.
     */
    if (
      violationNumber >=
      NEXORA_CONFIG.maxViolations
    ) {
      finish(
        "Kamu telah mencapai batas pelanggaran keamanan yang diperbolehkan. Sesi ujian dihentikan."
      );

      return;
    }

    /*
     * Tentukan hukuman.
     */
    const duration =
      violationNumber === 1
        ? PENALTY_FIRST
        : PENALTY_SECOND;

    const until =
      Date.now() +
      duration;

    /*
     * Simpan sebelum modal ditampilkan.
     *
     * Ini yang membuat refresh tidak
     * menghilangkan hukuman.
     */
    savePenalty(
      until,
      duration,
      violationNumber
    );

    blockForm();

    const info =
      getStudentViolationInfo(
        type
      );

    violationModal.classList.remove(
      "hidden"
    );

    updatePenaltyModal(
      duration,
      violationNumber,
      info
    );

    /*
     * Hentikan interval hukuman sebelumnya
     * jika ada.
     */
    if (
      penaltyInterval
    ) {
      clearInterval(
        penaltyInterval
      );
    }

    /*
     * Countdown hukuman.
     */
    penaltyInterval =
      setInterval(
        () => {
          if (
            finishedOnce
          ) {
            clearInterval(
              penaltyInterval
            );

            penaltyInterval =
              null;

            return;
          }

          const remaining =
            getPenaltyRemaining();

          const countdown =
            document.getElementById(
              "penaltyCountdown"
            );

          if (countdown) {
            countdown.textContent =
              formatPenaltyTime(
                remaining
              );
          }

          /*
           * Hukuman selesai.
           */
          if (
            remaining <= 0
          ) {
            clearInterval(
              penaltyInterval
            );

            penaltyInterval =
              null;

            finishPenalty();
          }
        },
        500
      );
  }

  /*
   * =========================================================
   * FINISH PENALTY
   * =========================================================
   */

  function finishPenalty() {
    if (
      finishedOnce
    ) {
      return;
    }

    clearPenalty();

    unblockForm();

    closeViolation.disabled =
      false;

    closeViolation.textContent =
      "Kembali ke Ujian";

    /*
     * Ubah isi modal menjadi pemberitahuan
     * bahwa hukuman sudah selesai.
     */
    violationText.innerHTML = `
      <div class="violation-content">

        <div class="violation-label">
          WAKTU PENANGGUHAN SELESAI
        </div>

        <h3>
          Kamu dapat melanjutkan ujian.
        </h3>

        <p>
          Waktu penangguhan telah selesai.
        </p>

        <p>
          Tetap berada pada halaman ujian
          dan jangan membuka Google, tab lain,
          atau aplikasi lain selama ujian berlangsung.
        </p>

      </div>
    `;

    /*
     * Modal tetap terbuka sampai siswa
     * menekan tombol kembali.
     */
  }

  /*
   * =========================================================
   * SHOW VIOLATION
   * =========================================================
   */

  function showViolation(v) {
    if (
      finishedOnce
    ) {
      return;
    }

    const count =
      Number(v.count) ||
      getViolationCount();

    /*
     * Simpan count di session.
     */
    session.violations =
      count;

    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );

    /*
     * Badge.
     */
    badge.textContent =
      `⚠ ${count} / ${NEXORA_CONFIG.maxViolations}`;

    badge.classList.toggle(
      "danger",
      count >=
        NEXORA_CONFIG.maxViolations
    );

    /*
     * Jika sudah mencapai batas,
     * ujian langsung dihentikan.
     */
    if (
      count >=
      NEXORA_CONFIG.maxViolations
    ) {
      finish(
        "Kamu telah mencapai batas pelanggaran keamanan yang diperbolehkan. Sesi ujian dihentikan."
      );

      return;
    }

    /*
     * Pelanggaran #1 atau #2
     * mendapatkan penalty.
     */
    startPenalty(
      count,
      v.type
    );
  }

  /*
   * =========================================================
   * CLOSE VIOLATION
   * =========================================================
   */

  closeViolation.addEventListener(
    "click",
    () => {
      if (
        finishedOnce
      ) {
        return;
      }

      /*
       * Jangan izinkan modal ditutup
       * selama hukuman masih berjalan.
       */
      if (
        penaltyActive
      ) {
        return;
      }

      /*
       * Setelah hukuman selesai,
       * siswa baru boleh kembali.
       */
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

  document
    .getElementById(
      "fullscreenBtn"
    )
    .addEventListener(
      "click",
      () => {
        if (
          !finishedOnce
        ) {
          NexoraSecurity.enterFullscreen();
        }
      }
    );

  /*
   * =========================================================
   * START / RESUME EXAM
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
     * RESUME SESSION
     * =====================================================
     *
     * Jika siswa refresh halaman ketika ujian masih
     * ONGOING, jangan membuat sesi baru.
     */
    if (
      isResume &&
      session.status === "ONGOING" &&
      session.startedAt &&
      session.durationMs
    ) {
      examStarted = true;

      endAt =
        Number(
          session.startedAt
        ) +
        Number(
          session.durationMs
        );

      startOverlay.classList.add(
        "hidden"
      );

      await NexoraSecurity.enterFullscreen();

      NexoraSecurity.arm();

      /*
       * Jika masih dalam masa hukuman,
       * pulihkan hukuman tersebut.
       */
      const remaining =
        getPenaltyRemaining();

      if (
        remaining > 0
      ) {
        restorePenalty();
      } else {
        /*
         * Kalau penalty sudah lewat ketika
         * halaman sedang direfresh, hapus
         * data penalty lama.
         */
        if (
          session.penaltyUntil
        ) {
          clearPenalty();
        }

        unblockForm();

        violationModal.classList.add(
          "hidden"
        );
      }

      startIntervals();

      NexoraSecurity.sendMonitoring(
        "resume",
        {
          startedAt:
            session.startedAt,

          durationMs:
            session.durationMs,

          remainingMs:
            Math.max(
              0,
              endAt -
                Date.now()
            ),

          violations:
            getViolationCount(),

          penaltyRemainingMs:
            Math.max(
              0,
              getPenaltyRemaining()
            )
        }
      );

      tick();

      return;
    }

    /*
     * =====================================================
     * NEW EXAM
     * =====================================================
     */

    examStarted = true;

    session.startedAt =
      Date.now();

    session.durationMs =
      NEXORA_CONFIG.durationMinutes *
      60 *
      1000;

    session.status =
      "ONGOING";

    delete session.penaltyUntil;
    delete session.penaltyDurationMs;
    delete session.penaltyViolation;
    delete session.penaltyStartedAt;

    endAt =
      session.startedAt +
      session.durationMs;

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

    startIntervals();

    tick();
  }

  /*
   * =========================================================
   * START INTERVALS
   * =========================================================
   */

  function startIntervals() {
    /*
     * Hindari interval ganda.
     */
    if (
      heartbeat
    ) {
      clearInterval(
        heartbeat
      );
    }

    if (
      timerInterval
    ) {
      clearInterval(
        timerInterval
      );
    }

    /*
     * HEARTBEAT
     */
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

              violations:
                getViolationCount(),

              penaltyRemainingMs:
                Math.max(
                  0,
                  getPenaltyRemaining()
                )
            }
          );
        },
        20000
      );

    /*
     * TIMER UJIAN
     */
    timerInterval =
      setInterval(
        tick,
        500
      );
  }

  /*
   * =========================================================
   * RESTORE PENALTY AFTER REFRESH
   * =========================================================
   */

  function restorePenalty() {
    const remaining =
      getPenaltyRemaining();

    const violationNumber =
      Number(
        session.penaltyViolation
      ) || getViolationCount();

    /*
     * Tidak boleh memulihkan hukuman
     * untuk pelanggaran ketiga.
     */
    if (
      violationNumber >=
      NEXORA_CONFIG.maxViolations
    ) {
      finish(
        "Kamu telah mencapai batas pelanggaran keamanan yang diperbolehkan. Sesi ujian dihentikan."
      );

      return;
    }

    /*
     * Tentukan jenis pesan.
     *
     * Jenis teknis terakhir tetap disimpan
     * dalam lastSecurityEvent.
     */
    const event =
      session.lastSecurityEvent;

    const type =
      event?.type ||
      "WINDOW_BLUR";

    const info =
      getStudentViolationInfo(
        type
      );

    blockForm();

    violationModal.classList.remove(
      "hidden"
    );

    updatePenaltyModal(
      remaining,
      violationNumber,
      info
    );

    if (
      penaltyInterval
    ) {
      clearInterval(
        penaltyInterval
      );
    }

    penaltyInterval =
      setInterval(
        () => {
          if (
            finishedOnce
          ) {
            clearInterval(
              penaltyInterval
            );

            penaltyInterval =
              null;

            return;
          }

          const current =
            getPenaltyRemaining();

          const countdown =
            document.getElementById(
              "penaltyCountdown"
            );

          if (countdown) {
            countdown.textContent =
              formatPenaltyTime(
                current
              );
          }

          if (
            current <= 0
          ) {
            clearInterval(
              penaltyInterval
            );

            penaltyInterval =
              null;

            finishPenalty();
          }
        },
        500
      );
  }

  /*
   * =========================================================
   * START BUTTON
   * =========================================================
   */

  beginExamBtn.addEventListener(
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
   * FINISH EXAM
   * =========================================================
   */

  function finish(reason) {
    if (
      finishedOnce
    ) {
      return;
    }

    finishedOnce = true;

    /*
     * =====================================================
     * 1. HENTIKAN TIMER
     * =====================================================
     */

    if (
      timerInterval
    ) {
      clearInterval(
        timerInterval
      );

      timerInterval = null;
    }

    /*
     * =====================================================
     * 2. HENTIKAN HEARTBEAT
     * =====================================================
     */

    if (
      heartbeat
    ) {
      clearInterval(
        heartbeat
      );

      heartbeat = null;
    }

    /*
     * =====================================================
     * 3. HENTIKAN TIMER HUKUMAN
     * =====================================================
     */

    if (
      penaltyInterval
    ) {
      clearInterval(
        penaltyInterval
      );

      penaltyInterval = null;
    }

    /*
     * =====================================================
     * 4. MATIKAN SECURITY
     * =====================================================
     */

    NexoraSecurity.disarm();

    /*
     * =====================================================
     * 5. TANDAI SESI SELESAI
     * =====================================================
     */

    session.endedAt =
      Date.now();

    session.status =
      "FINISHED";

    session.endReason =
      reason;

    save();

    /*
     * =====================================================
     * 6. KIRIM FINISH KE SERVER
     * =====================================================
     */

    NexoraSecurity.sendMonitoring(
      "finish",
      {
        reason,

        violations:
          getViolationCount()
      }
    );

    /*
     * =====================================================
     * 7. PUTUS AKSES GOOGLE FORM
     * =====================================================
     */

    frame.src =
      "about:blank";

    frame.classList.add(
      "hidden"
    );

    frame.style.pointerEvents =
      "none";

    /*
     * =====================================================
     * 8. TUTUP FULLSCREEN
     * =====================================================
     */

    document.exitFullscreen?.()
      .catch?.(() => {});

    /*
     * =====================================================
     * 9. TUTUP MODAL PELANGGARAN
     * =====================================================
     */

    violationModal?.classList.add(
      "hidden"
    );

    /*
     * =====================================================
     * 10. TAMPILKAN LAYAR SELESAI
     * =====================================================
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
   */

  /*
   * Badge awal mengikuti data session.
   */
  const initialViolations =
    getViolationCount();

  badge.textContent =
    `⚠ ${initialViolations} / ${NEXORA_CONFIG.maxViolations}`;

  badge.classList.toggle(
    "danger",
    initialViolations >=
      NEXORA_CONFIG.maxViolations
  );

  /*
   * =========================================================
   * PULIHKAN SESI SETELAH REFRESH
   * =========================================================
   */

  if (
    session.status === "ONGOING" &&
    session.startedAt &&
    session.durationMs
  ) {
    /*
     * Jika waktu ujian sebenarnya sudah habis
     * ketika browser direfresh, langsung selesaikan.
     */
    const restoredEndAt =
      Number(
        session.startedAt
      ) +
      Number(
        session.durationMs
      );

    if (
      restoredEndAt <=
      Date.now()
    ) {
      finish(
        "Waktu ujian telah selesai."
      );

      return;
    }

    /*
     * Pulihkan sesi.
     */
    startExam(true);
  } else {
    /*
     * Sesi baru:
     * tampilkan layar Mulai Ujian.
     */
    startOverlay.classList.remove(
      "hidden"
    );
  }
})();
