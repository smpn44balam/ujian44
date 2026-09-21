window.NexoraSecurity = (() => {
  /*
   * =========================================================
   * NEXORA SECURITY ENGINE
   * SMP NEGERI 44 BANDAR LAMPUNG
   * =========================================================
   */

  let violationCount = readStoredViolationCount();
  let lastViolationAt = 0;
  let onViolationCallback = null;
  let armed = false;
  let formFocusGraceUntil = 0;

  /*
   * =========================================================
   * AUDIO
   * =========================================================
   */

  let audioContext = null;

  function initializeAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;

      if (!audioContext) {
        audioContext = new AudioContext();
      }

      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }

      return true;
    } catch (error) {
      console.warn("NEXORA Audio initialization failed:", error);
      return false;
    }
  }

  function playViolationBeep() {
    try {
      if (!audioContext) return;

      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

      const start = audioContext.currentTime;
      const end = start + 2;

      gain.gain.setValueAtTime(0.22, start);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      oscillator.stop(end);
    } catch (error) {
      console.warn("NEXORA violation beep failed:", error);
    }
  }

  /*
   * =========================================================
   * SESSION
   * =========================================================
   */

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem("nexoraSession") || "null");
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    try {
      sessionStorage.setItem("nexoraSession", JSON.stringify(session));
    } catch {}
  }

  /*
   * =========================================================
   * VIOLATION COUNT
   * =========================================================
   */

  function readStoredViolationCount() {
    const session = getSession();
    if (!session) return 0;

    const count = Number(session.violations);
    if (Number.isFinite(count) && count >= 0) {
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
    onViolationCallback = typeof fn === "function" ? fn : null;
  }

  /*
   * =========================================================
   * STUDENT-FACING VIOLATION MESSAGE
   * =========================================================
   */

  function getStudentViolationInfo(type) {
    if (type === "FULLSCREEN_EXIT") {
      return {
        category: "Keluar dari Mode Layar Penuh",
        title: "Kamu terdeteksi keluar dari mode layar penuh.",
        message: "Silakan kembali ke mode layar penuh (Fullscreen) untuk melanjutkan ujian.",
        reminder: "Dilarang membuka Google, tab lain, atau aplikasi lain selama ujian berlangsung."
      };
    }

    if (type === "WINDOW_BLUR" || type === "VISIBILITY_HIDDEN") {
      return {
        category: "Meninggalkan Halaman Ujian",
        title: "Kamu terdeteksi meninggalkan halaman ujian.",
        message: "Jangan membuka Google, tab lain, aplikasi lain, atau berpindah dari halaman ujian selama ujian berlangsung.",
        reminder: "Silakan kembali ke halaman ujian untuk melanjutkan."
      };
    }

    if (type === "DEVTOOLS_SHORTCUT") {
      return {
        category: "Fitur yang Tidak Diizinkan",
        title: "Kamu terdeteksi mencoba membuka fitur yang tidak diperbolehkan selama ujian.",
        message: "Jangan membuka Developer Tools atau fitur pengembang browser selama ujian berlangsung.",
        reminder: "Tetap berada pada halaman ujian dan gunakan browser hanya untuk mengerjakan soal."
      };
    }

    return {
      category: "Aktivitas Tidak Diizinkan",
      title: "Sistem mendeteksi aktivitas yang tidak diperbolehkan selama ujian.",
      message: "Tetap berada pada halaman ujian dan jangan membuka hal lain selama pengerjaan.",
      reminder: "Silakan kembali fokus mengerjakan ujian."
    };
  }

  /*
   * =========================================================
   * SEND MONITORING (GATEKEEPER - PENGHEMATAN QUOTA)
   * =========================================================
   */

  function sendMonitoring(type, payload = {}) {
    /*
     * GERBANG PENJAGA: 
     * Memblokir status "start", "finish", "heartbeat", dan "unload".
     * Hanya mengizinkan "violation" dan "relogin_required".
     */
    if (type !== "violation" && type !== "relogin_required") {
      return; 
    }

    try {
      const session = getSession();
      if (!session) return;

      if (window.NEXORA_CONFIG && typeof window.NEXORA_CONFIG.sendMonitoring === "function") {
        try {
          window.NEXORA_CONFIG.sendMonitoring(type, payload);
          return;
        } catch {}
      }

      if (typeof window.sendMonitoring === "function") {
        try {
          window.sendMonitoring(type, payload);
          return;
        } catch {}
      }

      const endpoint = window.NEXORA_CONFIG?.monitoringUrl;
      if (!endpoint) return;

      const body = {
        type,
        payload,
        sessionId: session.sessionId || session.id || "",
        name: session.name || "",
        className: session.className || "",
        subjectName: session.subjectName || "",
        violations: Number(session.violations || 0),
        timestamp: Date.now()
      };

      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
          navigator.sendBeacon(endpoint, blob);
        } else {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            keepalive: true
          }).catch(() => {});
        }
      } catch (e) {}
    } catch {}
  }

  /*
   * =========================================================
   * RECORD VIOLATION
   * =========================================================
   */

  function record(type, detail = "") {
    if (!armed) return;

    const now = Date.now();
    const cooldown = Number(window.NEXORA_CONFIG?.warningCooldownMs) || 1500;

    if (now - lastViolationAt < cooldown) {
      return;
    }

    lastViolationAt = now;
    violationCount += 1;

    playViolationBeep();

    const session = getSession();

    if (session) {
      session.violations = violationCount;
      session.lastSecurityEvent = { type, detail, at: now };
      
      saveSession(session);
      appendLocalLog(session, type, detail);
      
      sendMonitoring("violation", {
        event: type,
        detail,
        violations: violationCount
      });
    }

    if (onViolationCallback) {
      onViolationCallback({
        type,
        detail,
        count: violationCount,
        studentInfo: getStudentViolationInfo(type)
      });
    }

    const maxViolations = Number(window.NEXORA_CONFIG?.maxViolations) || 3;
    if (violationCount >= maxViolations) {
      armed = false;
    }
  }

  /*
   * =========================================================
   * LOCAL LOG
   * =========================================================
   */

  function appendLocalLog(session, type, detail) {
    try {
      const key = "nexoraSecurityLogs";
      const raw = localStorage.getItem(key);
      let logs = [];

      try {
        logs = raw ? JSON.parse(raw) : [];
      } catch {
        logs = [];
      }

      if (!Array.isArray(logs)) logs = [];

      logs.push({
        sessionId: session.sessionId || session.id || "",
        name: session.name || "",
        className: session.className || "",
        subjectName: session.subjectName || "",
        type,
        detail,
        violations: violationCount,
        at: Date.now()
      });

      if (logs.length > 500) {
        logs = logs.slice(-500);
      }

      localStorage.setItem(key, JSON.stringify(logs));
    } catch {}
  }

  /*
   * =========================================================
   * FULLSCREEN
   * =========================================================
   */

  async function enterFullscreen() {
    try {
      const element = document.documentElement;

      if (document.fullscreenElement || document.webkitFullscreenElement) {
        return true;
      }

      if (element.requestFullscreen) {
        await element.requestFullscreen();
        return true;
      }

      if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
        return true;
      }
    } catch (error) {
      console.warn("NEXORA fullscreen request failed:", error);
    }
    return false;
  }

  /*
   * =========================================================
   * FORM FOCUS GRACE
   * =========================================================
   */

  function armFormFocusGrace() {
    formFocusGraceUntil = Date.now() + 2000;
  }

  function isFormFocusGraceActive() {
    return Date.now() < formFocusGraceUntil;
  }

  function isFormFrameActive() {
    const frame = document.getElementById("formFrame");
    if (!frame) return false;
    return document.activeElement === frame || frame.contains(document.activeElement);
  }

  /*
   * =========================================================
   * ARM
   * =========================================================
   */

  function arm() {
    if (armed) return;

    violationCount = readStoredViolationCount();

    const maxViolations = Number(window.NEXORA_CONFIG?.maxViolations) || 3;
    if (violationCount >= maxViolations) {
      armed = false;
      return;
    }

    armed = true;

    const formFrame = document.getElementById("formFrame");

    if (formFrame) {
      const formEvents = ["pointerdown", "mousedown", "touchstart", "click"];
      formEvents.forEach((eventName) => {
        formFrame.addEventListener(eventName, armFormFocusGrace, { passive: true });
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (!armed) return;
      if (document.visibilityState === "hidden") {
        if (isFormFocusGraceActive()) return;
        record("VISIBILITY_HIDDEN", "Halaman ujian menjadi tidak terlihat.");
      }
    });

    document.addEventListener("fullscreenchange", () => {
      if (!armed) return;
      const isFullscreen = Boolean(document.fullscreenElement);
      if (!isFullscreen) {
        record("FULLSCREEN_EXIT", "Mode fullscreen keluar.");
      }
    });

    document.addEventListener("webkitfullscreenchange", () => {
      if (!armed) return;
      const isFullscreen = Boolean(document.webkitFullscreenElement);
      if (!isFullscreen) {
        record("FULLSCREEN_EXIT", "Mode fullscreen keluar.");
      }
    });

    window.addEventListener("blur", () => {
      if (!armed) return;
      if (isFormFocusGraceActive() || isFormFrameActive()) return;
      record("WINDOW_BLUR", "Jendela / halaman ujian kehilangan fokus.");
    });

    document.addEventListener("keydown", (event) => {
      if (!armed) return;
      const key = String(event.key || "").toLowerCase();

      if (event.key === "F12") {
        event.preventDefault();
        record("DEVTOOLS_SHORTCUT", "Shortcut F12 terdeteksi.");
        return;
      }
      if (event.ctrlKey && event.shiftKey && key === "i") {
        event.preventDefault();
        record("DEVTOOLS_SHORTCUT", "Shortcut Ctrl+Shift+I terdeteksi.");
        return;
      }
      if (event.ctrlKey && event.shiftKey && key === "j") {
        event.preventDefault();
        record("DEVTOOLS_SHORTCUT", "Shortcut Ctrl+Shift+J terdeteksi.");
        return;
      }
      if (event.ctrlKey && event.shiftKey && key === "c") {
        event.preventDefault();
        record("DEVTOOLS_SHORTCUT", "Shortcut Ctrl+Shift+C terdeteksi.");
        return;
      }
    });

    document.addEventListener("contextmenu", (event) => {
      if (!armed) return;
      event.preventDefault();
    });

    window.addEventListener("beforeunload", () => {
      const currentSession = getSession();
      if (!currentSession) return;

      sendMonitoring("unload", {
        violations: violationCount,
        status: currentSession.status || "",
        reason: currentSession.reloginRequired ? "RELOGIN_REQUIRED" : "PAGE_UNLOAD"
      });
    });
  }

  function disarm() {
    armed = false;
  }

  function getCount() {
    return violationCount;
  }

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
