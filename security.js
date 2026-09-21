/**
 * NEXORA EXAM - Security & Monitoring Engine
 * File: security.js (VERSI LENGKAP)
 * SMP Negeri 44 Bandar Lampung
 */

const NEXORA_SECURITY = (function () {
    let violationCount = 0;
    let onViolationCallback = null;
    let isArmed = false;
    let audioCtx = null;

    // 1. Inisialisasi Audio Context (Web Audio API)
    function initAudio() {
        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioCtx = new AudioContextClass();
                }
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        } catch (e) {
            console.warn("[NEXORA SECURITY] Audio Context init error:", e);
        }
    }

    // 2. Beep Peringatan Pelanggaran (Durasi ~2 detik)
    function playViolationBeep(durationMs = 2000) {
        try {
            initAudio();
            if (!audioCtx) return;

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(660, audioCtx.currentTime); // Nada 660 Hz
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            setTimeout(() => {
                try {
                    osc.stop();
                    osc.disconnect();
                } catch (e) {}
            }, durationMs);
        } catch (e) {
            console.error("[NEXORA SECURITY] Gagal memainkan beep:", e);
        }
    }

    // 3. Masuk ke Mode Fullscreen
    function enterFullscreen() {
        const docEl = document.documentElement;
        try {
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(err => console.warn("[NEXORA SECURITY] Fullscreen diblokir browser:", err));
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        } catch (e) {
            console.warn("[NEXORA SECURITY] Gagal meminta Fullscreen:", e);
        }
    }

    // 4. Pengiriman Log Pelanggaran ke Google Apps Script (Spreadsheet)
    function sendMonitoring(type, details) {
        const session = JSON.parse(localStorage.getItem('nexora_session') || '{}');
        const scriptUrl = (window.NEXORA_CONFIG && window.NEXORA_CONFIG.scriptUrl) ? window.NEXORA_CONFIG.scriptUrl : '';

        if (!scriptUrl) {
            console.warn("[NEXORA SECURITY] scriptUrl belum diset di config.js!");
            return;
        }

        const payload = {
            action: 'logViolation',
            nisn: session.nisn || session.username || '-',
            nama: session.nama || session.namaSiswa || 'Siswa',
            kelas: session.kelas || '-',
            violationType: type,
            details: details || '',
            violationsCount: violationCount,
            timestamp: new Date().toLocaleString('id-ID')
        };

        fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(() => {
            console.log("[NEXORA SECURITY] Log pelanggaran berhasil dikirim ke Spreadsheet.");
        }).catch(err => {
            console.error("[NEXORA SECURITY] Gagal mengirim log:", err);
        });
    }

    // 5. Mencatat Pelanggaran
    function recordViolation(type, details) {
        if (!isArmed) return;

        violationCount++;
        playViolationBeep(2000);
        sendMonitoring(type, details);

        if (typeof onViolationCallback === 'function') {
            onViolationCallback(violationCount, type, details);
        }
    }

    // 6. Event Listener Keamanan
    let listenersAttached = false;
    function setupEventListeners() {
        if (listenersAttached) return;
        listenersAttached = true;

        // A. Deteksi Keluar Fullscreen
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement && isArmed) {
                recordViolation('FULLSCREEN_EXIT', 'Siswa keluar dari mode Layar Penuh (Fullscreen)');
            }
        });

        // B. Deteksi Pindah Tab / Minimalize Browser
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isArmed) {
                recordViolation('VISIBILITY_HIDDEN', 'Siswa beralih tab atau meminimalkan browser');
            }
        });

        // C. Deteksi Blur Window (Abaikan jika siswa klik Google Form iframe)
        window.addEventListener('blur', () => {
            if (!isArmed) return;
            setTimeout(() => {
                const activeEl = document.activeElement;
                if (activeEl && activeEl.tagName === 'IFRAME') {
                    // Fokus pindah ke Google Form, aman!
                    return;
                }
                if (document.hidden) {
                    // Sudah ditangani oleh visibilitychange
                    return;
                }
            }, 150);
        });

        // D. Deteksi Shortcut DevTools & Tombol Terlarang
        window.addEventListener('keydown', (e) => {
            if (!isArmed) return;

            // F12
            if (e.key === 'F12') {
                e.preventDefault();
                recordViolation('DEVTOOLS_SHORTCUT', 'Mencoba membuka F12 DevTools');
            }

            // Ctrl+Shift+I / J / C
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
                e.preventDefault();
                recordViolation('DEVTOOLS_SHORTCUT', 'Mencoba membuka DevTools Shortcut');
            }

            // Ctrl+U
            if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
                e.preventDefault();
                recordViolation('VIEW_SOURCE', 'Mencoba melihat Source Code (Ctrl+U)');
            }
        });
    }

    return {
        arm: function () {
            isArmed = true;
            setupEventListeners();
        },
        disarm: function () {
            isArmed = false;
        },
        enterFullscreen: enterFullscreen,
        initAudio: initAudio,
        setCallback: function (fn) {
            onViolationCallback = fn;
        },
        getViolationCount: function () {
            return violationCount;
        },
        setViolationCount: function (val) {
            violationCount = val;
        },
        recordManual: recordViolation,
        sendMonitoring: sendMonitoring
    };
})();
