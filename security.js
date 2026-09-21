/**
 * NEXORA EXAM - Security & Monitoring Engine
 * File: security.js (VERSI PERBAIKAN & TERHUBUNG EXAM)
 * SMP Negeri 44 Bandar Lampung
 */

const NEXORA_SECURITY = (function () {
    // 1. Fungsi Bantuan untuk Sinkronisasi Sesi
    function getSessionData() {
        let rawSession = localStorage.getItem('nexora_session') || sessionStorage.getItem('nexora_session') || localStorage.getItem('nexoraCandidate') || '{}';
        try {
            return JSON.parse(rawSession);
        } catch (e) {
            return {};
        }
    }

    function saveViolationToSession(count) {
        let session = getSessionData();
        session.violations = count;
        localStorage.setItem('nexora_session', JSON.stringify(session));
        sessionStorage.setItem('nexora_session', JSON.stringify(session));
    }

    let sessionData = getSessionData();
    let violationCount = sessionData.violations || 0;
    let onViolationCallback = null;
    let isArmed = false;
    let audioCtx = null;

    // 2. Inisialisasi Audio Context (Web Audio API)
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

    // 3. Beep Peringatan Pelanggaran
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

    // 4. Masuk ke Mode Fullscreen
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

    // 5. Pengiriman Log Pelanggaran ke Google Apps Script (Spreadsheet)
    function sendMonitoring(type, details) {
        const session = getSessionData();
        const scriptUrl = (window.NEXORA_CONFIG && (window.NEXORA_CONFIG.scriptUrl || window.NEXORA_CONFIG.monitoringUrl)) ? (window.NEXORA_CONFIG.scriptUrl || window.NEXORA_CONFIG.monitoringUrl) : '';

        if (!scriptUrl) {
            console.warn("[NEXORA SECURITY] scriptUrl belum diset di config.js!");
            return;
        }

        const payload = {
            action: 'logViolation',
            nisn: session.nisn || session.username || '-',
            nama: session.nama || session.name || session.namaSiswa || 'Siswa',
            kelas: session.kelas || session.className || '-',
            violationType: type,
            details: details || '',
            violationsCount: violationCount,
            timestamp: new Date().toISOString()
        };

        fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(() => {
            console.log("[NEXORA SECURITY] Log pelanggaran berhasil dikirim.");
        }).catch(err => {
            console.error("[NEXORA SECURITY] Gagal mengirim log:", err);
        });
    }

    // 6. Mencatat Pelanggaran
    function recordViolation(type, details) {
        if (!isArmed) return;

        violationCount++;
        saveViolationToSession(violationCount); // Sync dengan LocalStorage & SessionStorage
        playViolationBeep(2000);
        sendMonitoring(type, details);

        if (typeof onViolationCallback === 'function') {
            // Mengakomodasi 2 tipe signature callback (Count, Type, Details) atau (Reason string)
            const reasonString = details || type;
            onViolationCallback(reasonString, type, violationCount);
        }
    }

    // 7. Event Listener Keamanan
    let listenersAttached = false;
    function setupEventListeners() {
        if (listenersAttached) return;
        listenersAttached = true;

        // A. Deteksi Keluar Fullscreen
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement && isArmed) {
                setTimeout(() => {
                    const activeEl = document.activeElement;
                    if (activeEl && activeEl.tagName === 'IFRAME') {
                        console.warn("[NEXORA SECURITY] Indikasi Keyboard Virtual. Pelanggaran diabaikan.");
                        enterFullscreen();
                        return;
                    }
                    recordViolation('FULLSCREEN_EXIT', 'Keluar dari mode Layar Penuh (Fullscreen)');
                }, 500);
            }
        });

        // B. Deteksi Pindah Tab / Minimalize Browser
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isArmed) {
                recordViolation('VISIBILITY_HIDDEN', 'Beralih tab atau meminimalkan browser');
            }
        });

        // C. Deteksi Blur Window
        window.addEventListener('blur', () => {
            if (!isArmed) return;
            setTimeout(() => {
                const activeEl = document.activeElement;
                if (activeEl && activeEl.tagName === 'IFRAME') {
                    return; // Fokus pindah ke Google Form, aman!
                }
                if (document.hidden) {
                    return; // Sudah ditangani oleh visibilitychange
                }
            }, 200);
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

        // E. Deteksi Tombol Back / Reload
        window.addEventListener('beforeunload', (e) => {
            if (isArmed) {
                e.preventDefault();
                e.returnValue = "Ujian sedang berlangsung. Apakah Anda yakin ingin meninggalkan halaman ini?";
            }
        });
    }

    // Mengaktifkan sistem keamanan
    function armEngine() {
        isArmed = true;
        const currentSession = getSessionData();
        violationCount = currentSession.violations || 0; 
        setupEventListeners();
    }

    return {
        // Alias agar 100% cocok dengan panggillan di exam.js
        init: function (callback) {
            if (callback) onViolationCallback = callback;
            armEngine();
        },
        requestFullscreen: enterFullscreen,

        // Method asli milik Anda
        arm: armEngine,
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
            saveViolationToSession(val);
        },
        recordManual: recordViolation,
        sendMonitoring: sendMonitoring
    };
})();

// Menghubungkan ke object Window agar global
window.NEXORA_SECURITY = NEXORA_SECURITY;
