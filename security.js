window.NexoraSecurity = (() => {
  let violationCount = 0;
  let lastViolationAt = 0;
  let onViolationCallback = null;
  let armed = false;

  // Toleransi ketika siswa sedang masuk/interaksi
  // dengan Google Form di dalam iframe.
  let formFocusGraceUntil = 0;

  function setCallback(fn) {
    onViolationCallback = fn;
  }

  function record(type, detail = "") {
    if (!armed) return;

    const now = Date.now();

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
      session.violations = violationCount;

      session.lastSecurityEvent = {
        type,
        detail,
        at: now
      };

      saveSession(session);
      appendLocalLog(
        session,
        type,
        detail
      );

      sendMonitoring(
        "violation",
        {
          event: type,
          detail,
          violations: violationCount
        }
      );
    }

    if (onViolationCallback) {
      onViolationCallback({
        type,
        detail,
        count: violationCount
      });
    }

    // Setelah mencapai batas maksimum,
    // sistem keamanan tidak lagi mencatat
    // indikator tambahan.
    if (
      violationCount >=
      NEXORA_CONFIG.maxViolations
    ) {
      armed = false;
    }
  }

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
    sessionStorage.setItem(
      "nexoraSession",
      JSON.stringify(session)
    );
  }

  function appendLocalLog(
    session,
    type,
    detail
  ) {
    const key =
      "nexoraMonitoring";

    const list = JSON.parse(
      localStorage.getItem(key) ||
        "[]"
    );

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

  async function sendMonitoring(
    action,
    data = {}
  ) {
    const endpoint =
      NEXORA_CONFIG.monitoringEndpoint;

    if (!endpoint) return;

    const session =
      getSession();

    if (!session) return;

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

  function arm() {
    if (armed) return;

    armed = true;

    /*
     * =====================================================
     * GOOGLE FORM / IFRAME FOCUS PROTECTION
     * =====================================================
     *
     * Google Form berada di dalam iframe.
     *
     * Ketika siswa pertama kali mengklik Google Form,
     * browser dapat menganggap halaman utama kehilangan
     * fokus sehingga event "blur" muncul.
     *
     * Karena itu kita memberikan toleransi singkat ketika
     * siswa sedang berinteraksi dengan iframe Google Form.
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
        if (!armed) return;

        if (
          document.visibilityState ===
          "hidden"
        ) {
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
        if (!armed) return;

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
        if (!armed) return;

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
         * Selain kondisi di atas, blur dianggap sebagai
         * kehilangan fokus dari halaman ujian.
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
     */

    document.addEventListener(
      "contextmenu",
      e => {
        if (!armed) return;

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
        if (!armed) return;

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
        if (!armed) return;

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
    sendMonitoring
  };
})();
