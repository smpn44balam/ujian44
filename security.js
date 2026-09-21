/**
 * NEXORA EXAM - Security & Monitoring Engine
 * File: security.js (VERSI DIPERBAIKI)
 * SMP Negeri 44 Bandar Lampung
 *
 * RINGKASAN PERBAIKAN DI FILE INI:
 * 1. FULLSCREEN_EXIT palsu akibat keyboard virtual mobile: sekarang ada
 *    grace period (debounce) + deteksi perubahan visualViewport sebelum
 *    sebuah "keluar fullscreen" benar-benar dicatat sebagai pelanggaran.
 * 2. violationCount kini juga dibaca ulang dari localStorage saat modul
 *    ini di-arm (defense-in-depth), bukan hanya mengandalkan exam.js
 *    memanggil setViolationCount() setelah DOMContentLoaded.
 * 3. scriptUrl: mendukung NEXORA_CONFIG.scriptUrl (nama baku) maupun
 *    monitoringUrl (alias lama) supaya tidak silent-fail lagi.
 * 4. Header 'Content-Type: application/json' dihapus dari fetch mode
 *    'no-cors' karena browser TIDAK PERNAH benar-benar mengirim header ini
 *    pada request no-cors (hanya boleh text/plain / x-www-form-urlencoded
 *    / multipart) — sebelumnya header ini menyesatkan karena dikira
 *    terkirim padahal tidak. Payload tetap JSON string di body, dan
 *    Google Apps Script tetap bisa mem-parse via e.postData.contents
 *    apa pun Content-Type yang tercatat di sisi server.
 * 5. Setiap pelanggaran & heartbeat kini JUGA disimpan ke
 *    localStorage["nexoraMonitoring"] supaya dashboard pengawas.html
 *    (yang sebelumnya SELALU KOSONG karena tidak ada satupun kode yang
 *    menulis ke key ini) bisa menampilkan data — minimal untuk device
 *    yang sama. Ini bukan pengganti Google Sheets (lihat catatan di
 *    ringkasan akhir), hanya jaring pengaman lokal.
 */

const NEXORA_SECURITY = (function () {
    const SESSION_KEY = 'nexora_session';
    const MONITORING_KEY = 'nexoraMonitoring';

    let violationCount = 0;
    let onViolationCallback = null;
    let isArmed = false;
    let audioCtx = null;
    let audioUnlocked = false;

    // ---------------------------------------------------------
    // 0. Deteksi keyboard virtual mobile (via visualViewport)
    // ---------------------------------------------------------
    let baselineViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    let keyboardLikelyOpen = false;

    function setupViewportWatcher() {
        if (!window.visualViewport) return;
        baselineViewportHeight = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', () => {
            const current = window.visualViewport.height;
            // Jika tinggi viewport menyusut signifikan (>18%), kemungkinan
            // besar itu keyboard virtual muncul, bukan siswa keluar fullscreen.
            keyboardLikelyOpen = current < baselineViewportHeight * 0.82;
            // Update baseline ke arah yang lebih besar saja (saat keyboard
            // tertutup lagi) supaya baseline tetap akurat mengikuti rotasi layar.
            if (current > baselineViewportHeight) {
                baselineViewportHeight = current;
            }
        });
    }

    // ---------------------------------------------------------
    // 1. Inisialisasi Audio Context (Web Audio API)
    // ---------------------------------------------------------
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
            audioUnlocked = true;
        } catch (e) {
            console.warn("[NEXORA SECURITY] Audio Context init error:", e);
        }
    }

    // Jaring pengaman tambahan: banyak browser mobile (iOS Safari khususnya)
    // hanya mau membuka AudioContext pada gesture sentuh/klik PERTAMA di
    // halaman, sebelum siswa sempat menekan tombol "Mulai". Dengan listener
    // sekali-pakai ini, begitu ada sentuhan/klik apa pun, audio langsung
    // dicoba di-unlock lebih awal, tanpa harus menunggu tombol tertentu.
    function armAudioAutoUnlock() {
        const unlockOnce = () => {
            initAudio();
            document.removeEventListener('touchstart', unlockOnce);
            document.removeEventListener('pointerdown', unlockOnce);
            document.removeEventListener('click', unlockOnce);
        };
        document.addEventListener('touchstart', unlockOnce, { passive: true });
        document.addEventListener('pointerdown', unlockOnce, { passive: true });
        document.addEventListener('click', unlockOnce, { passive: true });
    }

    // ---------------------------------------------------------
    // 2. Beep Peringatan Pelanggaran (Durasi ~2 detik)
    // ---------------------------------------------------------
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

    // ---------------------------------------------------------
    // 3. Masuk ke Mode Fullscreen
    // ---------------------------------------------------------
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

    function isCurrentlyFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    }

    // ---------------------------------------------------------
    // 4. Ambil sesi aktif (dipakai untuk identitas log)
    // ---------------------------------------------------------
    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function resolveScriptUrl() {
        const cfg = window.NEXORA_CONFIG || {};
        return cfg.scriptUrl || cfg.monitoringUrl || '';
    }

    // ---------------------------------------------------------
    // 5. Simpan salinan lokal untuk dashboard pengawas.html
    // ---------------------------------------------------------
    function writeLocalMonitoring(entry) {
        try {
            const list = JSON.parse(localStorage.getItem(MONITORING_KEY) || '[]');
            list.push(entry);
            // Batasi ukuran log lokal agar localStorage tidak membengkak.
            const trimmed = list.slice(-500);
            localStorage.setItem(MONITORING_KEY, JSON.stringify(trimmed));
        } catch (e) {
            console.warn("[NEXORA SECURITY] Gagal menyimpan log monitoring lokal:", e);
        }
    }

    // ---------------------------------------------------------
    // 6. Pengiriman Log Pelanggaran ke Google Apps Script (Spreadsheet)
    // ---------------------------------------------------------
    function sendMonitoring(type, details) {
        const session = getSession();
        const scriptUrl = resolveScriptUrl();

        const payload = {
            action: 'logViolation',
            sessionId: session.sessionId || '-',
            nisn: session.nisn || session.username || '-',
            name: session.nama || session.name || 'Siswa',
            nama: session.nama || session.name || 'Siswa',
            kelas: session.kelas || session.className || '-',
            className: session.className || session.kelas || '-',
            subjectName: session.subjectName || session.mapel || '-',
            violationType: type,
            details: details || '',
            violations: violationCount,
            violationsCount: violationCount,
            timestamp: new Date().toLocaleString('id-ID'),
            at: Date.now()
        };

        // Selalu simpan salinan lokal dulu supaya pengawas.html tetap punya
        // data walau Apps Script belum dikonfigurasi / sedang gagal.
        writeLocalMonitoring(payload);

        if (!scriptUrl) {
            console.warn("[NEXORA SECURITY] scriptUrl belum diset di config.js — log hanya tersimpan lokal.");
            return;
        }

        // CATATAN: mode 'no-cors' membuat browser tidak pernah benar-benar
        // mengirim header Content-Type non-simple seperti 'application/json'.
        // Header sengaja TIDAK diset di sini (lihat catatan di atas file).
        // Body tetap JSON string dan tetap bisa diparse oleh Code.gs lewat
        // e.postData.contents, apa pun Content-Type yang tercatat di server.
        fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        }).then(() => {
            console.log("[NEXORA SECURITY] Log pelanggaran berhasil dikirim ke Spreadsheet.");
        }).catch(err => {
            console.error("[NEXORA SECURITY] Gagal mengirim log ke server (tersimpan lokal):", err);
        });
    }

    // ---------------------------------------------------------
    // 7. Mencatat Pelanggaran
    // ---------------------------------------------------------
    function recordViolation(type, details) {
        if (!isArmed) return;

        violationCount++;
        playViolationBeep(2000);
        sendMonitoring(type, details);

        if (typeof onViolationCallback === 'function') {
            onViolationCallback(violationCount, type, details);
        }
    }

    // ---------------------------------------------------------
    // 8. Event Listener Keamanan
    // ---------------------------------------------------------
    let listenersAttached = false;
    let fullscreenExitTimer = null;

    function setupEventListeners() {
        if (listenersAttached) return;
        listenersAttached = true;

        setupViewportWatcher();

        // A. Deteksi Keluar Fullscreen (dengan grace period untuk keyboard mobile)
        document.addEventListener('fullscreenchange', () => {
            if (isCurrentlyFullscreen() || !isArmed) {
                // Kembali fullscreen (mis. keyboard ditutup) -> batalkan timer tunda.
                if (fullscreenExitTimer) {
                    clearTimeout(fullscreenExitTimer);
                    fullscreenExitTimer = null;
                }
                return;
            }

            // Jangan langsung mencatat pelanggaran. Tunggu sebentar (600ms):
            // - Jika ini disebabkan keyboard virtual muncul, viewport akan
            //   menyusut (keyboardLikelyOpen = true) dan browser SERINGKALI
            //   tidak benar-benar keluar fullscreen di background; begitu
            //   keyboard ditutup, fullscreen kembali normal.
            // - Jika benar-benar keluar (siswa menekan Home/Back/Recent
            //   apps, atau menutup fullscreen manual), setelah 600ms
            //   status document.fullscreenElement TETAP kosong.
            if (fullscreenExitTimer) clearTimeout(fullscreenExitTimer);
            fullscreenExitTimer = setTimeout(() => {
                fullscreenExitTimer = null;
                if (isCurrentlyFullscreen()) return; // sudah balik sendiri, aman.

                if (keyboardLikelyOpen) {
                    // Kemungkinan besar cuma keyboard. Coba diam-diam minta
                    // fullscreen lagi tanpa mencatat pelanggaran.
                    enterFullscreen();
                    return;
                }

                recordViolation('FULLSCREEN_EXIT', 'Siswa keluar dari mode Layar Penuh (Fullscreen)');
            }, 600);
        });

        // B. Deteksi Pindah Tab / Minimalize Browser
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isArmed) {
                recordViolation('VISIBILITY_HIDDEN', 'Siswa beralih tab atau meminimalkan browser');
            }
        });

        // C. Deteksi Blur Window (Abaikan jika siswa klik Google Form iframe
        //    atau sedang mengetik dengan keyboard virtual terbuka)
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
                if (keyboardLikelyOpen) {
                    // Aman, kemungkinan cuma keyboard virtual yang mengubah fokus.
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
            // Defense-in-depth: sinkronkan ulang dari session tersimpan,
            // supaya walau exam.js belum sempat memanggil setViolationCount,
            // jumlah pelanggaran tidak pernah "turun" ke 0 secara keliru.
            const session = getSession();
            if ((session.violations || 0) > violationCount) {
                violationCount = session.violations;
            }
            armAudioAutoUnlock();
            setupEventListeners();
        },
        disarm: function () {
            isArmed = false;
            if (fullscreenExitTimer) {
                clearTimeout(fullscreenExitTimer);
                fullscreenExitTimer = null;
            }
        },
        enterFullscreen: enterFullscreen,
        initAudio: initAudio,
        initializeAudio: initAudio,
        setCallback: function (fn) {
            onViolationCallback = fn;
        },
        getViolationCount: function () {
            return violationCount;
        },
        setViolationCount: function (val) {
            // Jangan pernah menurunkan nilai yang sudah lebih tinggi di memori.
            violationCount = Math.max(violationCount, val || 0);
        },
        recordManual: recordViolation,
        sendMonitoring: sendMonitoring,
        writeLocalMonitoring: writeLocalMonitoring
    };
})();
