/**
 * NEXORA EXAM - Next Generation Examination & Assessment System
 * File: exam.js (FULL FIXED VERSION - TERINTEGRASI SECURITY.JS BARU)
 * SMP Negeri 44 Bandar Lampung
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. VALIDASI SESI UJIAN (PEMBERSIHAN & SAFETY CHECK)
    // ==========================================
    let rawSession = localStorage.getItem('nexora_session') || sessionStorage.getItem('nexora_session') || localStorage.getItem('NEXORA_SESSION') || sessionStorage.getItem('NEXORA_SESSION');
    let session = null;

    try {
        session = JSON.parse(rawSession || 'null');
    } catch (e) {
        console.error("Format session tidak valid:", e);
    }

    // Jika tidak ada sesi sama sekali, kembalikan ke login
    if (!session || !session.formUrl) {
        console.warn("Session atau Form URL tidak ditemukan. Redirecting to index.html...");
        window.location.href = 'index.html';
        return;
    }

    // Jika status RELOGIN_REQUIRED (setelah pelanggaran #3 selesai countdown)
    if (session.status === "RELOGIN_REQUIRED" && session.reloginRequired === true) {
        console.warn("Status sesi membutuhkan Login Ulang.");
        window.location.href = 'index.html';
        return;
    }

    // ==========================================
    // 2. DEKLARASI ELEMEN DOM
    // ==========================================
    const DOM = {
        beginExamBtn: document.getElementById('beginExamBtn'),
        fullscreenBtn: document.getElementById('fullscreenBtn'),
        startOverlay: document.getElementById('startOverlay'),
        formFrame: document.getElementById('formFrame'),
        timer: document.getElementById('timer'),
        realtimeClock: document.getElementById('realtimeClock'),
        realtimeDate: document.getElementById('realtimeDate'),
        violationBadge: document.getElementById('violationBadge'),
        violationModal: document.getElementById('violationModal'),
        violationText: document.getElementById('violationText'),
        closeViolationBtn: document.getElementById('closeViolation'),
        loading: document.getElementById('loading'),
        finished: document.getElementById('finished'),
        finishReason: document.getElementById('finishReason'),
        examIdentity: document.getElementById('examIdentity')
    };

    // Helper untuk menyimpan session kembali dengan aman
    function saveSession() {
        localStorage.setItem('nexora_session', JSON.stringify(session));
        sessionStorage.setItem('nexora_session', JSON.stringify(session));
    }

    // Tampilkan identitas peserta jika elemen tersedia
    if (DOM.examIdentity && session.nama) {
        DOM.examIdentity.textContent = `${session.nama} (${session.kelas || 'Siswa'})`;
    }

    // Tampilkan badge pelanggaran terakhir
    if (DOM.violationBadge) {
        DOM.violationBadge.textContent = `⚠ ${session.violations || 0} / 3`;
    }

    // Set jumlah pelanggaran ke modul security dari sesi yang tersimpan
    if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.setViolationCount === 'function') {
        NEXORA_SECURITY.setViolationCount(session.violations || 0);
    }

    // ==========================================
    // 3. FITUR JAM REAL-TIME 
    // ==========================================
    function updateRealtimeClock() {
        const now = new Date();
        if (DOM.realtimeClock) {
            const hrs = String(now.getHours()).padStart(2, '0');
            const mins = String(now.getMinutes()).padStart(2, '0');
            const secs = String(now.getSeconds()).padStart(2, '0');
            DOM.realtimeClock.textContent = `${hrs}:${mins}:${secs}`;
        }

        if (DOM.realtimeDate) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            DOM.realtimeDate.textContent = now.toLocaleDateString('id-ID', options);
        }
    }
    setInterval(updateRealtimeClock, 1000);
    updateRealtimeClock(); 

    // ==========================================
    // 4. TIMER SISA WAKTU
    // ==========================================
    let durationMs = (window.NEXORA_CONFIG?.durationMinutes || 90) * 60 * 1000;
    let examTimerInterval = null;
    let remainingMs = durationMs;

    function startTimer() {
        if (!session.startedAt) {
            session.startedAt = Date.now();
            session.durationMs = durationMs;
            saveSession();
        }

        if (examTimerInterval) clearInterval(examTimerInterval);

        examTimerInterval = setInterval(() => {
            const elapsed = Date.now() - session.startedAt;
            remainingMs = Math.max(0, session.durationMs - elapsed);

            if (remainingMs <= 0) {
                clearInterval(examTimerInterval);
                finishExam("Waktu ujian telah habis.");
                return;
            }
            
            if (DOM.timer) {
                const totalSecs = Math.floor(remainingMs / 1000);
                const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
                const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
                const secs = String(totalSecs % 60).padStart(2, '0');
                DOM.timer.textContent = `${hrs}:${mins}:${secs}`;
            }
        }, 1000);
    }

    // ==========================================
    // 5. SISTEM PENALTY & RELOGIN (Pelanggaran 1, 2, 3)
    // ==========================================
    let penaltyInterval = null;
    let penaltyRemainingMs = 0;
    let penaltyActive = false;

    function applyPenalty(penaltySeconds, isRelogin = false) {
        penaltyActive = true;
        let remainingSecs = penaltySeconds;
        penaltyRemainingMs = penaltySeconds * 1000;
        
        if (DOM.closeViolationBtn) DOM.closeViolationBtn.style.display = 'none'; 
        
        if (isRelogin) {
            session.thirdReloginUntil = Date.now() + penaltyRemainingMs;
        } else {
            session.penaltyUntil = Date.now() + penaltyRemainingMs;
        }
        saveSession();

        if (penaltyInterval) clearInterval(penaltyInterval);
        
        const baseWarningHtml = DOM.violationText ? DOM.violationText.innerHTML.split('<br><strong id="countdownPenalty"')[0] : '';

        penaltyInterval = setInterval(() => {
            remainingSecs--;
            penaltyRemainingMs = remainingSecs * 1000;
            
            if (DOM.violationText) {
                DOM.violationText.innerHTML = `${baseWarningHtml}<br><strong id="countdownPenalty" style="color:#ef4444; font-size:1.2rem; display:block; margin-top:10px;">Form Terkunci: ${remainingSecs} detik</strong>`;
            }

            if (remainingSecs <= 0) {
                clearInterval(penaltyInterval);
                penaltyActive = false;
                
                if (isRelogin) {
                    session.thirdReloginUntil = null;
                    session.status = "RELOGIN_REQUIRED";
                    session.reloginRequired = true;
                    saveSession();
                    
                    alert("Sesi dibekukan karena pelanggaran ke-3. Anda wajib Login Ulang!");
                    window.location.href = 'index.html';
                } else {
                    session.penaltyUntil = null;
                    saveSession();
                    
                    const penaltyElem = document.getElementById('countdownPenalty');
                    if(penaltyElem) penaltyElem.remove();
                    
                    if (DOM.closeViolationBtn) {
                        DOM.closeViolationBtn.style.display = 'inline-block';
                        DOM.closeViolationBtn.textContent = 'Saya Mengerti, Lanjutkan Ujian';
                    }
                }
            }
        }, 1000);
    }

    function restorePenalty() {
        if (session.penaltyUntil && session.penaltyUntil > Date.now()) {
            const remainingSecs = Math.floor((session.penaltyUntil - Date.now()) / 1000);
            triggerPenaltyUI(session.violations || 1, `Anda merefresh halaman saat penalti berjalan.`);
            applyPenalty(remainingSecs, false);
            return true;
        }
        return false;
    }

    function restoreThirdReloginLock() {
        if (session.thirdReloginUntil && session.thirdReloginUntil > Date.now()) {
            const remainingSecs = Math.floor((session.thirdReloginUntil - Date.now()) / 1000);
            triggerPenaltyUI(session.violations || 3, `Menunggu sesi dibekukan...`);
            applyPenalty(remainingSecs, true);
            return true;
        }
        return false;
    }

    function triggerPenaltyUI(count, details) {
        if (DOM.startOverlay) DOM.startOverlay.style.display = 'none'; 
        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.arm === 'function') {
            NEXORA_SECURITY.arm();
        }
        
        if (DOM.violationModal && DOM.violationText) {
            DOM.violationText.innerHTML = `
                <div style="text-align: center; color: #dc2626; font-weight: bold; font-size: 1.2rem; margin-bottom: 10px;">
                    PELANGGARAN TERDETEKSI (${count}/3)
                </div>
                <p style="margin: 0; font-size: 1rem; color: #374151;">${details}</p>
            `;
            DOM.violationModal.style.display = 'flex';
            DOM.violationModal.classList.add('active');
        }
    }

    // ==========================================
    // 6. CALLBACK SECURITY (DENGAN PENANGANAN SAFE-CALL)
    // ==========================================
    if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.setCallback === 'function') {
        NEXORA_SECURITY.setCallback((count, type, details) => {
            session.violations = count;
            saveSession();

            if (DOM.violationBadge) DOM.violationBadge.textContent = `⚠ ${count} / 3`;
            
            triggerPenaltyUI(count, details);

            if (count === 1) {
                applyPenalty(90, false); // Penalti 1.5 Menit
            } else if (count === 2) {
                applyPenalty(300, false); // Penalti 5 Menit
            } else if (count >= 3) {
                applyPenalty(60, true); // Penalti ke-3 (Bekukan Sesi)
            }
        });
    }

    if (DOM.closeViolationBtn) {
        DOM.closeViolationBtn.addEventListener('click', () => {
            if (DOM.violationModal) {
                DOM.violationModal.style.display = 'none';
                DOM.violationModal.classList.remove('active');
            }
            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.enterFullscreen === 'function') {
                NEXORA_SECURITY.enterFullscreen();
            }
        });
    }

    // ==========================================
    // 7. SISTEM HEARTBEAT (Interval 20 Detik)
    // ==========================================
    function startHeartbeat() {
        setInterval(() => {
            const scriptUrl = window.NEXORA_CONFIG?.scriptUrl;
            if (!scriptUrl) return;

            const payload = {
                action: 'heartbeat',
                nisn: session.nisn || '-',
                nama: session.nama || '-',
                remainingMs: remainingMs,
                penaltyRemainingMs: penaltyRemainingMs,
                violations: session.violations || 0,
                penaltyActive: penaltyActive,
                timestamp: new Date().toISOString()
            };

            fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(e => console.log("Heartbeat tersendat (Abaikan, sistem berjalan lokal)"));
        }, 20000);
    }

    // ==========================================
    // 8. LOGIKA SELESAI UJIAN
    // ==========================================
    function finishExam(reasonStr) {
        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.disarm === 'function') {
            NEXORA_SECURITY.disarm();
        }
        if (DOM.formFrame) DOM.formFrame.style.display = 'none';
        if (DOM.timer) DOM.timer.textContent = "00:00:00";
        
        if (DOM.finished && DOM.finishReason) {
            DOM.finishReason.textContent = reasonStr;
            DOM.finished.style.display = 'flex';
        }

        localStorage.removeItem('nexora_session');
        sessionStorage.removeItem('nexora_session');
    }

    // ==========================================
    // 9. EVENT LISTENER MULAI UJIAN & FULLSCREEN
    // ==========================================
    if (DOM.beginExamBtn) {
        DOM.beginExamBtn.addEventListener('click', () => {
            // Safe call inisialisasi Audio dan Keamanan
            if (typeof NEXORA_SECURITY !== 'undefined') {
                if (typeof NEXORA_SECURITY.initializeAudio === 'function') {
                    NEXORA_SECURITY.initializeAudio();
                } else if (typeof NEXORA_SECURITY.initAudio === 'function') {
                    NEXORA_SECURITY.initAudio();
                }
                if (typeof NEXORA_SECURITY.enterFullscreen === 'function') {
                    NEXORA_SECURITY.enterFullscreen();
                }
                if (typeof NEXORA_SECURITY.arm === 'function') {
                    NEXORA_SECURITY.arm();
                }
            }

            // Muat URL Google Form ke Iframe
            if (session.formUrl && DOM.formFrame) {
                if (DOM.loading) DOM.loading.style.display = 'flex';
                DOM.formFrame.src = session.formUrl;
                
                DOM.formFrame.onload = () => {
                    if (DOM.loading) DOM.loading.style.display = 'none';
                };
            }

            // Sembunyikan Overlay Mulai
            if (DOM.startOverlay) DOM.startOverlay.style.display = 'none';
            
            // Tandai status bahwa ujian telah dimulai
            session.isStarted = true;
            saveSession();

            // Jalankan Timer & Heartbeat
            startTimer();
            startHeartbeat();
        });
    }

    if (DOM.fullscreenBtn) {
        DOM.fullscreenBtn.addEventListener('click', () => {
            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.enterFullscreen === 'function') {
                NEXORA_SECURITY.enterFullscreen();
            }
        });
    }

    // ==========================================
    // 10. PEMERIKSAAN AWAL SAAT HALAMAN DIMUAT (RESUME STATE)
    // ==========================================
    const isPenalty3Locked = restoreThirdReloginLock();
    if (!isPenalty3Locked) {
        restorePenalty();
    }

    // Jika siswa merefresh saat ujian sedang berjalan
    if ((session.startedAt || session.isStarted) && !isPenalty3Locked && !(session.penaltyUntil > Date.now())) {
        if (DOM.startOverlay) DOM.startOverlay.style.display = 'none';
        
        if (DOM.formFrame && session.formUrl) {
            DOM.formFrame.src = session.formUrl;
        }
        
        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.arm === 'function') {
            NEXORA_SECURITY.arm();
        }
        startTimer();
        startHeartbeat();
    }
});
