window.NexoraSecurity = (() => {
  /*
   * =========================================================
   * NEXORA SECURITY ENGINE
   * SMP NEGERI 44 BANDAR LAMPUNG
   * =========================================================
   *
   * Fungsi:
   * - Deteksi keluar fullscreen
   * - Deteksi meninggalkan halaman
   * - Deteksi visibility hidden
   * - Deteksi shortcut Developer Tools
   * - Pencatatan pelanggaran
   * - Penyimpanan jumlah pelanggaran
   * - Monitoring heartbeat / security event
   * - Warning audio setiap pelanggaran
   *
   * CATATAN:
   * Heartbeat TIDAK memanggil record().
   * Oleh karena itu heartbeat TIDAK menghasilkan beep.
   * =========================================================
   */

  let violationCount =
    readStoredViolationCount();

  let lastViolationAt = 0;

  let onViolationCallback =
    null;

  let armed = false;

  /*
   * Digunakan untuk mencegah false positive
   * ketika siswa berinteraksi dengan Google Form.
   */
  let formFocusGraceUntil = 0;

  /*
   * =========================================================
   * AUDIO
   * =========================================================
   */

  let audioContext = null;

  /*
   * Membuat / mengaktifkan AudioContext.
   *
   * Fungsi ini dipanggil dari tombol "Mulai Ujian"
   * sehingga browser memiliki user gesture yang sah
   * untuk mengizinkan Web Audio.
   */
  function initializeAudio() {
    try {
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContext) {
        return false;
      }

      if (!audioContext) {
        audioContext =
          new AudioContext();
      }

      if (
        audioContext.state ===
        "suspended"
      ) {
        audioContext.resume().catch(
          () => {}
        );
      }

      return true;
    } catch (error) {
      console.warn(
        "NEXORA Audio initialization failed:",
        error
      );

      return false;
    }
  }

  /*
   * Bunyi peringatan pelanggaran.
   *
   * Durasi sekitar 2 detik.
   *
   * Web Audio hanya mengatur volume internal
   * suara yang dibuat oleh halaman.
   * Website TIDAK dapat mengunci / memaksa
   * volume hardware HP atau laptop.
   */
  function playViolationBeep() {
    try {
      if (!audioContext) {
        return;
      }

      if (
        audioContext.state ===
        "suspended"
      ) {
        audioContext.resume().catch(
          () => {}
        );
      }

      const oscillator =
        audioContext.createOscillator();

      const gain =
        audioContext.createGain();

      oscillator.type = "sine";

      oscillator.frequency.setValueAtTime(
        880,
        audioContext.currentTime
      );

      const start =
        audioContext.currentTime;

      const end =
        start + 2;

      /*
       * Volume internal suara.
       */
      gain.gain.setValueAtTime(
        0.22,
        start
      );

      /*
       * Hubungkan:
       * oscillator → gain → speaker
       */
      oscillator.connect(gain);

      gain.connect(
        audioContext.destination
      );

      oscillator.start(start);

      /*
       * Fade out agar tidak terputus kasar.
       */
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        end
      );

      oscillator.stop(end);
    } catch (error) {
      console.warn(
        "NEXORA violation beep failed:",
        error
      );
    }
  }

  /*
   * =========================================================
   * SESSION
   * =========================================================
   */

  function getSession() {
    try {
      return JSON.parse(
        sessionStorage.getItem(
          "nexoraSession"
        ) || "null"
      );
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    try {
      sessionStorage.setItem(
        "nexoraSession",
        JSON.stringify(session)
      );
    } catch {}
  }

  /*
   * =========================================================
   * VIOLATION COUNT
   * =========================================================
   */

  function readStoredViolationCount() {
    const session =
      getSession();

    if (!session) {
      return 0;
    }

    const count =
      Number(session.violations);

    if (
      Number.isFinite(count) &&
      count >= 0
    ) {
      return count;
    }

    return 0;
  }

  /*
   * =========================================================
   * CALLBACK
   * =========================================================
   */

  function setCallback(fn) {
    onViolationCallback =
      typeof fn === "function"
        ? fn
        : null;
  }

  /*
   * =========================================================
   * STUDENT-FACING VIOLATION MESSAGE
   * =========================================================
   */

  function getStudentViolationInfo(
    type
  ) {
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

    return {
      category:
        "Aktivitas Tidak Diizinkan",

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
   * SEND MONITORING
   * =========================================================
   */

  function sendMonitoring(
    type,
    payload = {}
  ) {
    try {
      const session =
        getSession();

      if (!session) {
        return;
      }

      /*
       * Jika fungsi backend tersedia melalui
       * konfigurasi NEXORA, gunakan fungsi tersebut.
       */
      if (
        window.NEXORA_CONFIG &&
        typeof
          window.NEXORA_CONFIG.sendMonitoring ===
          "function"
      ) {
        try {
          window.NEXORA_CONFIG.sendMonitoring(
            type,
            payload
          );

          return;
        } catch {}
      }

      /*
       * Fallback:
       * jika proyek memiliki fungsi global
       * sendMonitoring, gunakan fungsi tersebut.
       */
      if (
        typeof window.sendMonitoring ===
        "function"
      ) {
        try {
          window.sendMonitoring(
            type,
            payload
          );

          return;
        } catch {}
      }

      /*
       * Jika backend menggunakan URL monitoring
       * dari konfigurasi, kirim melalui fetch.
       */
      const endpoint =
        window.NEXORA_CONFIG?.monitoringUrl;

      if (!endpoint) {
        return;
      }

      const body = {
        type,
        payload,
        sessionId:
          session.sessionId ||
          session.id ||
          "",
        name:
          session.name || "",
        className:
          session.className || "",
        subjectName:
          session.subjectName || "",
        violations:
          Number(
            session.violations || 0
          ),
        timestamp:
          Date.now()
      };

      /*
       * keepalive membantu request tetap dikirim
       * ketika halaman akan ditutup / berpindah.
       */
      fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(body),
          keepalive: true
        }
      ).catch(() => {});
    } catch {}
  }

  /*
   * =========================================================
   * RECORD VIOLATION
   * =========================================================
   */

  function record(
    type,
    detail = ""
  ) {
    /*
     * Jangan mencatat apa pun jika security
     * sedang tidak aktif.
     */
    if (!armed) {
      return;
    }

    const now =
      Date.now();

    /*
     * Cooldown mencegah satu tindakan menghasilkan
     * beberapa pelanggaran dalam waktu sangat dekat.
     */
    const cooldown =
      Number(
        window.NEXORA_CONFIG
          ?.warningCooldownMs
      ) || 1500;

    if (
      now - lastViolationAt <
      cooldown
    ) {
      return;
    }

    lastViolationAt =
      now;

    violationCount += 1;

    /*
     * =====================================================
     * BEEP
     * =====================================================
     *
     * Beep hanya dipanggil di sini.
     *
     * Heartbeat tidak masuk ke fungsi record(),
     * sehingga heartbeat tidak akan membunyikan beep.
     */
    playViolationBeep();

    const session =
      getSession();

    if (session) {
      /*
       * Simpan counter secara permanen
       * selama sesi browser berlangsung.
       */
      session.violations =
        violationCount;

      /*
       * Simpan event terakhir.
       */
      session.lastSecurityEvent = {
        type,
        detail,
        at: now
      };

      saveSession(session);

      /*
       * Simpan log lokal.
       */
      appendLocalLog(
        session,
        type,
        detail
      );

      /*
       * Kirim monitoring.
       */
      sendMonitoring(
        "violation",
        {
          event: type,
          detail,
          violations:
            violationCount
        }
      );
    }

    /*
     * Kirim data ke exam.js.
     */
    if (onViolationCallback) {
      onViolationCallback({
        type,
        detail,
        count:
          violationCount,

        studentInfo:
          getStudentViolationInfo(
            type
          )
      });
    }

    /*
     * Setelah pelanggaran maksimum tercapai,
     * security tidak lagi membuat violation berikutnya
     * pada halaman sesi tersebut.
     *
     * exam.js akan menangani alur pelanggaran ke-3:
     * 60 detik → logout → login ulang.
     */
    const maxViolations =
      Number(
        window.NEXORA_CONFIG
          ?.maxViolations
      ) || 3;

    if (
      violationCount >=
      maxViolations
    ) {
      armed = false;
    }
  }

  /*
   * =========================================================
   * LOCAL LOG
   * =========================================================
   */

  function appendLocalLog(
    session,
    type,
    detail
  ) {
    try {
      const key =
        "nexoraSecurityLogs";

      const raw =
        localStorage.getItem(key);

      let logs = [];

      try {
        logs =
          raw
            ? JSON.parse(raw)
            : [];
      } catch {
        logs = [];
      }

      if (!Array.isArray(logs)) {
        logs = [];
      }

      logs.push({
        sessionId:
          session.sessionId ||
          session.id ||
          "",

        name:
          session.name || "",

        className:
          session.className || "",

        subjectName:
          session.subjectName || "",

        type,

        detail,

        violations:
          violationCount,

        at:
          Date.now()
      });

      /*
       * Jangan biarkan localStorage membesar tanpa batas.
       */
      if (logs.length > 500) {
        logs =
          logs.slice(
            -500
          );
      }

      localStorage.setItem(
        key,
        JSON.stringify(logs)
      );
    } catch {}
  }

  /*
   * =========================================================
   * FULLSCREEN
   * =========================================================
   */

  async function enterFullscreen() {
    try {
      const element =
        document.documentElement;

      if (
        document.fullscreenElement ||
        document.webkitFullscreenElement
      ) {
        return true;
      }

      if (
        element.requestFullscreen
      ) {
        await element.requestFullscreen();

        return true;
      }

      if (
        element.webkitRequestFullscreen
      ) {
        element.webkitRequestFullscreen();

        return true;
      }
    } catch (error) {
      console.warn(
        "NEXORA fullscreen request failed:",
        error
      );
    }

    return false;
  }

  /*
   * =========================================================
   * FORM FOCUS GRACE
   * =========================================================
   *
   * Google Form berada dalam iframe.
   *
   * Ketika siswa menyentuh / mengklik iframe,
   * browser dapat mengubah activeElement atau
   * memicu blur pada window.
   *
   * Jangan menganggap hal tersebut sebagai
   * pelanggaran.
   * =========================================================
   */

  function armFormFocusGrace() {
    formFocusGraceUntil =
      Date.now() + 2000;
  }

  function isFormFocusGraceActive() {
    return (
      Date.now() <
      formFocusGraceUntil
    );
  }

  function isFormFrameActive() {
    const frame =
      document.getElementById(
        "formFrame"
      );

    if (!frame) {
      return false;
    }

    return (
      document.activeElement ===
        frame ||
      frame.contains(
        document.activeElement
      )
    );
  }

  /*
   * =========================================================
   * ARM
   * =========================================================
   */

  function arm() {
    if (armed) {
      return;
    }

    /*
     * Baca ulang counter dari sessionStorage.
     *
     * Ini penting ketika siswa login kembali
     * setelah pelanggaran ke-3.
     */
    violationCount =
      readStoredViolationCount();

    /*
     * Jika counter sudah mencapai batas maksimum,
     * jangan mengaktifkan listener violation lagi.
     *
     * exam.js tetap dapat menjalankan timer / sesi,
     * tetapi counter tidak kembali ke 0.
     */
    const maxViolations =
      Number(
        window.NEXORA_CONFIG
          ?.maxViolations
      ) || 3;

    if (
      violationCount >=
      maxViolations
    ) {
      armed = false;

      return;
    }

    armed = true;

    const formFrame =
      document.getElementById(
        "formFrame"
      );

    /*
     * =====================================================
     * GOOGLE FORM FOCUS GRACE
     * =====================================================
     */

    if (formFrame) {
      const formEvents = [
        "pointerdown",
        "mousedown",
        "touchstart",
        "click"
      ];

      formEvents.forEach(
        (eventName) => {
          formFrame.addEventListener(
            eventName,
            armFormFocusGrace,
            {
              passive: true
            }
          );
        }
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
           * Jika siswa memang sedang berinteraksi
           * dengan Google Form, jangan langsung
           * membuat false positive.
           */
          if (
            isFormFocusGraceActive()
          ) {
            return;
          }

          record(
            "VISIBILITY_HIDDEN",
            "Halaman ujian menjadi tidak terlihat."
          );
        }
      }
    );

    /*
     * =====================================================
     * FULLSCREEN CHANGE
     * =====================================================
     */

    document.addEventListener(
      "fullscreenchange",
      () => {
        if (!armed) {
          return;
        }

        const isFullscreen =
          Boolean(
            document.fullscreenElement
          );

        if (!isFullscreen) {
          record(
            "FULLSCREEN_EXIT",
            "Mode fullscreen keluar."
          );
        }
      }
    );

    /*
     * Dukungan browser WebKit.
     */
    document.addEventListener(
      "webkitfullscreenchange",
      () => {
        if (!armed) {
          return;
        }

        const isFullscreen =
          Boolean(
            document.webkitFullscreenElement
          );

        if (!isFullscreen) {
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
         * Google Form iframe sebelumnya menjadi
         * sumber false positive.
         *
         * Jangan catat jika:
         * - sedang dalam grace period
         * - activeElement adalah iframe form
         */
        if (
          isFormFocusGraceActive() ||
          isFormFrameActive()
        ) {
          return;
        }

        record(
          "WINDOW_BLUR",
          "Jendela / halaman ujian kehilangan fokus."
        );
      }
    );

    /*
     * =====================================================
     * DEVTOOLS / SHORTCUT
     * =====================================================
     */

    document.addEventListener(
      "keydown",
      (event) => {
        if (!armed) {
          return;
        }

        const key =
          String(
            event.key || ""
          ).toLowerCase();

        /*
         * F12
         */
        if (
          event.key ===
          "F12"
        ) {
          event.preventDefault();

          record(
            "DEVTOOLS_SHORTCUT",
            "Shortcut F12 terdeteksi."
          );

          return;
        }

        /*
         * Ctrl + Shift + I
         */
        if (
          event.ctrlKey &&
          event.shiftKey &&
          key === "i"
        ) {
          event.preventDefault();

          record(
            "DEVTOOLS_SHORTCUT",
            "Shortcut Ctrl+Shift+I terdeteksi."
          );

          return;
        }

        /*
         * Ctrl + Shift + J
         */
        if (
          event.ctrlKey &&
          event.shiftKey &&
          key === "j"
        ) {
          event.preventDefault();

          record(
            "DEVTOOLS_SHORTCUT",
            "Shortcut Ctrl+Shift+J terdeteksi."
          );

          return;
        }

        /*
         * Ctrl + Shift + C
         */
        if (
          event.ctrlKey &&
          event.shiftKey &&
          key === "c"
        ) {
          event.preventDefault();

          record(
            "DEVTOOLS_SHORTCUT",
            "Shortcut Ctrl+Shift+C terdeteksi."
          );

          return;
        }
      }
    );

    /*
     * =====================================================
     * CONTEXT MENU
     * =====================================================
     *
     * Klik kanan diblokir, tetapi TIDAK dianggap
     * sebagai pelanggaran.
     *
     * Ini sengaja supaya siswa tidak langsung
     * mendapat violation hanya karena klik kanan.
     */
    document.addEventListener(
      "contextmenu",
      (event) => {
        if (!armed) {
          return;
        }

        event.preventDefault();
      }
    );

    /*
     * =====================================================
     * BEFORE UNLOAD
     * =====================================================
     *
     * Ini hanya monitoring.
     *
     * TIDAK dihitung sebagai violation.
     */
    window.addEventListener(
      "beforeunload",
      () => {
        const currentSession =
          getSession();

        if (!currentSession) {
          return;
        }

        sendMonitoring(
          "unload",
          {
            violations:
              violationCount,

            status:
              currentSession.status ||
              "",

            reason:
              currentSession.reloginRequired
                ? "RELOGIN_REQUIRED"
                : "PAGE_UNLOAD"
          }
        );
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

    sendMonitoring,

    initializeAudio
  };
})();
