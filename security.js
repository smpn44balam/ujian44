window.NexoraSecurity = (() => {
  /*
   * =========================================================
   * NEXORA EXAM — SECURITY ENGINE
   * SMP NEGERI 44 BANDAR LAMPUNG
   * =========================================================
   *
   * Catatan:
   * - Kode teknis pelanggaran tetap disimpan untuk pengawas.
   * - Bahasa yang ditampilkan kepada siswa dibuat sederhana.
   * - WINDOW_BLUR dan VISIBILITY_HIDDEN tetap dicatat terpisah
   *   di monitoring, tetapi ditampilkan kepada siswa sebagai
   *   satu jenis kejadian: "Meninggalkan halaman ujian".
   * - Jumlah pelanggaran dipulihkan dari sessionStorage agar
   *   refresh halaman tidak mengembalikan jumlah menjadi 0.
   * =========================================================
   */

  let violationCount = readStoredViolationCount();
  let lastViolationAt = 0;
  let onViolationCallback = null;
  let armed = false;

  /*
   * Toleransi ketika siswa sedang masuk/interaksi
   * dengan Google Form di dalam iframe.
   *
   * BAGIAN INI DIPERTAHANKAN agar bug WINDOW_BLUR
   * saat siswa mengklik/interaksi dengan Google Form
   * tidak muncul kembali.
   */
  let formFocusGraceUntil = 0;

  /*
   * =========================================================
   * SESSION
   * =========================================================
   */

  function getSession() {
    try {
      return JSON.parse(
        sessionStorage.getItem("nexoraSession") || "null"
      );
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );
  }

  function readStoredViolationCount() {
    const session = getSession();

    if (!session) {
      return 0;
    }

    const count = Number(session.violations);

    if (!Number.isFinite(count) || count < 0) {
      return 0;
    }

    return count;
  }

  /*
   * =========================================================
   * CALLBACK
   * =========================================================
   */

  function setCallback(fn) {
    onViolationCallback = fn;
  }

  /*
   * =========================================================
   * STUDENT-FACING VIOLATION INFORMATION
   * =========================================================
   *
   * Kode teknis tetap digunakan untuk monitoring.
   * Fungsi ini hanya menentukan bahasa yang mudah dipahami
   * siswa SMP.
   * =========================================================
   */

  function getStudentViolationInfo(type) {
    /*
     * 1. KELUAR DARI FULLSCREEN
     */
    if (type === "FULLSCREEN_EXIT") {
      return {
        category: "Keluar dari Mode Layar Penuh",
        title:
          "Kamu terdeteksi keluar dari mode layar penuh.",
        message:
          "Silakan kembali ke mode layar penuh (Fullscreen) untuk melanjutkan ujian.",
        reminder:
          "Dilarang membuka Google, tab lain, atau aplikasi lain selama ujian berlangsung."
      };
    }

    /*
     * 2. WINDOW BLUR + VISIBILITY HIDDEN
     *
     * Bagi siswa keduanya dianggap satu kejadian:
     * meninggalkan halaman ujian.
     */
    if (
      type === "WINDOW_BLUR" ||
      type === "VISIBILITY_HIDDEN"
    ) {
      return {
        category: "Meninggalkan Halaman Ujian",
        title:
          "Kamu terdeteksi meninggalkan halaman ujian.",
        message:
          "Jangan membuka Google, tab lain, aplikasi lain, atau berpindah dari halaman ujian selama ujian berlangsung.",
        reminder:
          "Silakan kembali ke halaman ujian untuk melanjutkan."
      };
    }

    /*
     * 3. DEVELOPER TOOLS
     */
    if (type === "DEVTOOLS_SHORTCUT") {
      return {
        category: "Fitur yang Tidak Diizinkan",
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
     *
     * Jika suatu hari ada indikator baru yang belum
     * memiliki bahasa khusus.
     */
    return {
      category: "Aktivitas Tidak Diizinkan",
      title:
        "Sistem mendeteksi aktivitas yang tidak diperbolehkan selama ujian.",
      message:
        "Tetap berada pada halaman ujian dan jangan membuka hal lain selama pengerjaan.",
      reminder:
        "Silakan kembali fokus mengerjakan ujian."
    };
  }

  /*
   * =========================================================
   * RECORD VIOLATION
   * =========================================================
   */

  function record(type, detail = "") {
    if (!armed) {
      return;
    }

    const now = Date.now();

    /*
     * Hindari satu tindakan yang menghasilkan beberapa
     * event dalam waktu sangat berdekatan.
     */
    if (
      now - lastViolationAt <
      NEXORA_CONFIG.warningCooldownMs
    ) {
      return;
    }

    lastViolationAt = now;
    violationCount += 1;

    const session = getSession();

    if (session) {
      /*
       * Simpan jumlah pelanggaran ke session.
       * Ini penting agar refresh tidak mengembalikan
       * counter menjadi 0.
       */
      session.violations = violationCount;

      /*
       * Simpan KODE TEKNIS ASLI untuk pengawas.
       */
      session.lastSecurityEvent = {
        type,
        detail,
        at: now
      };

      saveSession(session);

      /*
       * Local monitoring tetap menggunakan kode asli.
       */
      appendLocalLog(
        session,
        type,
        detail
      );

      /*
       * Server monitoring tetap menerima event teknis.
       */
      sendMonitoring(
        "violation",
        {
          event: type,
          detail,
          violations: violationCount
        }
      );
    }

    /*
     * Kirim informasi lengkap ke exam.js.
     */
    if (onViolationCallback) {
      onViolationCallback({
        type,
        detail,
        count: violationCount,
        studentInfo:
          getStudentViolationInfo(type)
      });
    }

    /*
     * Setelah mencapai batas maksimum,
     * sistem keamanan tidak lagi mencatat
     * indikator tambahan.
     */
    if (
      violationCount >=
      NEXORA_CONFIG.maxViolations
    ) {
      armed = false;
    }
  }

  /*
   * =========================================================
   * LOCAL MONITORING LOG
   * =========================================================
   */

  function appendLocalLog(
    session,
    type,
    detail
  ) {
    const key = "nexoraMonitoring";

    let list = [];

    try {
      list = JSON.parse(
        localStorage.getItem(key) || "[]"
      );
    } catch {
      list = [];
    }

    list.push({
      sessionId:
        session.sessionId,

      at: Date.now(),

      name:
        session.name,

      className:
        session.className,

      subjectName:
        session.subjectName,

      violations:
        session.violations || 0,

      /*
       * Tetap simpan kode teknis asli.
       */
      event:
        type,

      detail
    });

    localStorage.setItem(
      key,
      JSON.stringify(
        list.slice(-500)
      )
    );
  }

  /*
   * =========================================================
   * SERVER MONITORING
   * =========================================================
   */

  async function sendMonitoring(
    action,
    data = {}
  ) {
    const endpoint =
      NEXORA_CONFIG.monitoringEndpoint;

    if (!endpoint) {
      return;
    }

    const session =
      getSession();

    if (!session) {
      return;
    }

    const payload =
      JSON.stringify({
        action,
        session,
        data,
        sentAt: Date.now()
      });

    try {
      navigator.sendBeacon?.(
        endpoint,
        new Blob(
          [payload],
          {
            type:
              "text/plain;charset=utf-8"
          }
        )
      );
    } catch {
      try {
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "text/plain;charset=utf-8"
            },

            body: payload,
            keepalive: true
          }
        );
      } catch {}
    }
  }

  /*
   * =========================================================
   * FULLSCREEN
   * =========================================================
   */

  async function enterFullscreen() {
    try {
      if (
        !document.fullscreenElement
      ) {
        await document.documentElement.requestFullscreen();
      }

      return true;
    } catch {
      return false;
    }
  }

  /*
   * =========================================================
   * ARM SECURITY
   * =========================================================
   */

  function arm() {
    if (armed) {
      return;
    }

    /*
     * Pastikan jumlah pelanggaran selalu mengikuti
     * data terakhir yang tersimpan.
     */
    violationCount =
      readStoredViolationCount();

    armed = true;

    /*
     * =====================================================
     * GOOGLE FORM / IFRAME FOCUS PROTECTION
     * =====================================================
     *
     * BAGIAN INI DIPERTAHANKAN.
     *
     * Google Form berada di dalam iframe.
     *
     * Ketika siswa pertama kali mengklik Google Form,
     * browser dapat menganggap halaman utama kehilangan
     * fokus sehingga event "blur" muncul.
     *
     * Karena itu diberikan toleransi singkat ketika siswa
     * sedang berinteraksi dengan iframe Google Form.
     */

    const formFrame =
      document.getElementById(
        "formFrame"
      );

    if (formFrame) {
      const allowFormFocus = () => {
        formFocusGraceUntil =
          Date.now() + 2000;
      };

      formFrame.addEventListener(
        "pointerdown",
        allowFormFocus,
        true
      );

      formFrame.addEventListener(
        "mousedown",
        allowFormFocus,
        true
      );

      formFrame.addEventListener(
        "touchstart",
        allowFormFocus,
        true
      );

      formFrame.addEventListener(
        "click",
        allowFormFocus,
        true
      );
    }

    /*
     * =====================================================
     * VISIBILITY CHANGE
     * =====================================================
     */

    document.addEventListener(
      "visibilitychange",
      () => {
        if (!armed) {
          return;
        }

        if (
          document.visibilityState ===
          "hidden"
        ) {
          /*
           * Kode teknis tetap VISIBILITY_HIDDEN.
           * Nanti siswa akan melihat:
           * "Meninggalkan Halaman Ujian".
           */
          record(
            "VISIBILITY_HIDDEN",
            "Halaman menjadi tidak terlihat."
          );
        }
      }
    );

    /*
     * =====================================================
     * FULLSCREEN
     * =====================================================
     */

    document.addEventListener(
      "fullscreenchange",
      () => {
        if (!armed) {
          return;
        }

        if (
          !document.fullscreenElement
        ) {
          record(
            "FULLSCREEN_EXIT",
            "Mode fullscreen keluar."
          );
        }
      }
    );

    /*
     * =====================================================
     * WINDOW BLUR
     * =====================================================
     */

    window.addEventListener(
      "blur",
      () => {
        if (!armed) {
          return;
        }

        /*
         * Jika blur terjadi sesaat setelah siswa
         * mengklik Google Form, abaikan.
         */
        if (
          Date.now() <
          formFocusGraceUntil
        ) {
          return;
        }

        /*
         * Jika browser masih menganggap iframe sebagai
         * elemen aktif, berarti fokus masih berada pada
         * Google Form.
         */
        const activeElement =
          document.activeElement;

        if (
          activeElement &&
          activeElement.tagName ===
            "IFRAME"
        ) {
          return;
        }

        /*
         * Kode teknis tetap WINDOW_BLUR.
         * Bagi siswa ini akan diterjemahkan menjadi:
         * "Meninggalkan Halaman Ujian".
         */
        record(
          "WINDOW_BLUR",
          "Jendela kehilangan fokus."
        );
      }
    );

    /*
     * =====================================================
     * BLOK CONTEXT MENU
     * =====================================================
     *
     * Klik kanan tetap diblokir.
     * Klik kanan BUKAN indikator pelanggaran.
     */

    document.addEventListener(
      "contextmenu",
      e => {
        if (!armed) {
          return;
        }

        e.preventDefault();
      }
    );

    /*
     * =====================================================
     * BLOK DEVTOOLS SHORTCUT
     * =====================================================
     */

    document.addEventListener(
      "keydown",
      e => {
        if (!armed) {
          return;
        }

        if (
          e.key === "F12" ||
          (
            e.ctrlKey &&
            e.shiftKey &&
            [
              "I",
              "J",
              "C"
            ].includes(
              e.key.toUpperCase()
            )
          )
        ) {
          e.preventDefault();

          record(
            "DEVTOOLS_SHORTCUT",
            "Shortcut pengembang ditekan."
          );
        }
      }
    );

    /*
     * =====================================================
     * BEFORE UNLOAD
     * =====================================================
     */

    window.addEventListener(
      "beforeunload",
      e => {
        if (!armed) {
          return;
        }

        sendMonitoring(
          "unload",
          {
            event:
              "BEFORE_UNLOAD"
          }
        );

        e.preventDefault();
        e.returnValue = "";
      }
    );
  }

  /*
   * =========================================================
   * DISARM
   * =========================================================
   */

  function disarm() {
    armed = false;
  }

  /*
   * =========================================================
   * GET COUNT
   * =========================================================
   */

  function getCount() {
    return violationCount;
  }

  /*
   * =========================================================
   * PUBLIC API
   * =========================================================
   */

  return {
    setCallback,
    record,
    arm,
    disarm,
    enterFullscreen,
    getCount,
    getStudentViolationInfo,
    sendMonitoring
  };
})();
