/**
 * NEXORA EXAM - Security & Monitoring Module
 */
const NEXORA_SECURITY = (function () {
    let violationCount = 0;
    let onViolationCallback = null;
    let isArmed = false;
    let audioCtx = null;

    function initAudio() {
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        } catch (e) {
            console.warn("Audio Context init failed", e);
        }
    }

    function playBeep(durationMs = 2000) {
        try {
            initAudio();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(660, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            setTimeout(() => {
                try { osc.stop(); } catch(e){}
            }, durationMs);
        } catch (e) {
            console.error("Beep error:", e);
        }
    }

    function enterFullscreen() {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => console.log("Fullscreen restriction:", err));
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
        }
    }

    function sendMonitoring(type, details = "") {
        const session = JSON.parse(localStorage.getItem('nexora_session') || '{}');
        const scriptUrl = window.NEXORA_CONFIG ? window.NEXORA_CONFIG.scriptUrl : '';

        if (!scriptUrl) return;

        const payload = {
            action: 'logViolation',
            nisn: session.nisn || '-',
            nama: session.nama || 'Siswa',
            kelas: session.kelas || '-',
            violationType: type,
            details: details,
            violationsCount: violationCount,
            timestamp: new Date().toISOString()
        };

        // Kirim log ke Google Apps Script / Spreadsheet
        fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error("Gagal kirim log kecurangan:", err));
    }

    function recordViolation(type, details) {
        if (!isArmed) return;
        
        violationCount++;
        playBeep(2000);
        sendMonitoring(type, details);

        if (typeof onViolationCallback === 'function') {
            onViolationCallback(violationCount, type, details);
        }
    }

    function setupEventListeners() {
        // Deteksi Keluar Fullscreen
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && isArmed) {
                recordViolation('FULLSCREEN_EXIT', 'Siswa keluar dari mode Layar Penuh');
            }
        });

        // Deteksi Pindah Tab / Minimalize Browser
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isArmed) {
                recordViolation('VISIBILITY_HIDDEN', 'Siswa berpindah tab / aplikasi');
            }
        });

        // Deteksi Shortcut DevTools (F12, Ctrl+Shift+I, dll)
        window.addEventListener('keydown', (e) => {
            if (!isArmed) return;
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))) {
                e.preventDefault();
                recordViolation('DEVTOOLS_SHORTCUT', 'Membuka DevTools / Mode Pengembang');
            }
        });
    }

    return {
        arm: function() { isArmed = true; setupEventListeners(); },
        disarm: function() { isArmed = false; },
        enterFullscreen: enterFullscreen,
        initAudio: initAudio,
        setCallback: function(fn) { onViolationCallback = fn; },
        getViolationCount: function() { return violationCount; },
        recordManual: recordViolation
    };
})();
