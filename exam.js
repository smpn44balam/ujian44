/**
 * NEXORA EXAM - Next Generation Examination & Assessment System
 * File: exam.js (FULL VERSION + PERBAIKAN)
 * SMP Negeri 44 Bandar Lampung
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. VALIDASI SESI UJIAN
    // ==========================================
    let session = JSON.parse(localStorage.getItem('nexora_session') || 'null');
    
    // Jika tidak ada sesi, atau status mewajibkan login ulang (Pelanggaran #3)
    if (!session || !session.formUrl || session.status === "RELOGIN_REQUIRED") {
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
        violationBadge: document.getElementById('violationBadge'),
        violationModal: document.getElementById('violationModal'),
        violationText: document.getElementById('violationText'),
        closeViolationBtn: document.getElementById('closeViolation'),
        loading: document.getElementById('loading'),
        finished: document.getElementById('finished'),
        finishReason: document.getElementById('finishReason'),
        examIdentity: document.getElementById('examIdentity')
    };

    // Tampilkan identitas peserta jika elemen tersedia
    if (DOM.examIdentity && session.nama) {
        DOM.examIdentity.textContent = `${session.nama} (${session.kelas})`;
    }

    // Tampilkan badge pelanggaran terakhir
    if (DOM.violationBadge) {
        DOM.violationBadge.textContent = `⚠ ${session.violations || 0} / 3`;
    }

    // Set jumlah pelanggaran ke modul security
    if (typeof NEXORA_SECURITY.setViolationCount === 'function') {
        NEXORA_SECURITY.setViolationCount(session.violations || 0);
    }

    // ==========================================
    // 3. FITUR JAM REAL-TIME (BARU)
    // ==========================================
    function updateRealtimeClock() {
        const now = new Date();
        if (DOM.realtimeClock) {
            DOM.realtimeClock.textContent = now.toLocaleTimeString('id-ID', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });
        }
    }
    setInterval(updateRealtimeClock, 1000);
    updateRealtimeClock(); 

    // ==========================================
    // 4. TIMER SISA WAKTU (Diperbaiki)
    // ==========================================
    let durationMs = (window.NEXORA_CONFIG?.durationMinutes || 90) * 60 * 1000;
    let examTimerInterval = null;
    let remainingMs = durationMs;

    function startTimer() {
        if (!session.startedAt) {
            session.startedAt = Date.now();
            session.durationMs = durationMs;
            localStorage.setItem('nexora_session', JSON.stringify(session));
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
    // 5. SISTEM PENALTY & RELOGIN
    // ==========================================
    let penaltyInterval = null;
    let penaltyRemainingMs = 0;
    let penaltyActive = false;

    function applyPenalty(penaltySeconds, isRelogin = false) {
        penaltyActive = true;
        let remainingSecs = penaltySeconds;
        penaltyRemainingMs = penaltySeconds * 1000;
        
        if (DOM.closeViolationBtn) DOM.closeViolationBtn.style.display = 'none'; 
        
        // Simpan waktu penalti ke session (Anti-Refresh Cheat)
        if (isRelogin) {
            session.thirdReloginUntil = Date.now() + penaltyRemainingMs;
        } else {
            session.penaltyUntil = Date.now() + penaltyRemainingMs;
        }
        localStorage.setItem('nexora_session', JSON.stringify(session));

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
                    localStorage.setItem('nexora_session', JSON.stringify(session));
                    
                    alert("Sesi dibekukan karena pelanggaran ke-3. Anda wajib Login Ulang!");
                    window.location.href = 'index.html';
                } else {
                    session.penaltyUntil = null;
                    localStorage.setItem('nexora_session', JSON.stringify(session));
                    
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

    // Fungsi Restore Penalty jika siswa melakukan Refresh saat Form Terkunci
    function restorePenalty() {
        if (session.penaltyUntil && session.penaltyUntil > Date.now()) {
            const remainingSecs = Math.floor((session.penaltyUntil - Date.now()) / 1000);
            triggerPenaltyUI(session.violations, `Anda merefresh halaman saat penalti berjalan.`);
            applyPenalty(remainingSecs, false);
            return true;
        }
        return false;
    }

    function restoreThirdReloginLock() {
        if (session.thirdReloginUntil && session.thirdReloginUntil > Date.now()) {
            const remainingSecs = Math.floor((session.thirdReloginUntil - Date.now()) / 1000);
            triggerPenaltyUI(session.violations, `Menunggu sesi dibekukan...`);
            applyPenalty(remainingSecs, true);
            return true;
        }
        return false;
    }

    function triggerPenaltyUI(count, details) {
        if (DOM.startOverlay) DOM.startOverlay.style.display = 'none'; 
        NEXORA_SECURITY.arm(); // Pastikan security tetap menyala
        
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
    // 6. CALLBACK SECURITY (Diperbaiki)
    // ==========================================
    NEXORA_SECURITY.setCallback((count, type, details) => {
        session.violations = count;
        localStorage.setItem('nexora_session', JSON.stringify(session));

        if (DOM.violationBadge) DOM.violationBadge.textContent = `⚠ ${count} / 3`;
        
        triggerPenaltyUI(count, details);

        // Aturan Penalti sesuai Ringkasan Proyek
        if (count === 1) {
            applyPenalty(90, false); // Penalti 1: 90 detik
        } else if (count === 2) {
            applyPenalty(300, false); // Penalti 2: 5 menit
        } else if (count >= 3) {
            applyPenalty(60, true); // Penalti 3: 60 detik -> LOGOUT
        }
    });

    if (DOM.closeViolationBtn) {
        DOM.closeViolationBtn.addEventListener('click', () => {
            if (DOM.violationModal) {
                DOM.violationModal.style.display = 'none';
                DOM.violationModal.classList.remove('active');
            }
            // PAKSA FULLSCREEN LAGI
            NEXORA_SECURITY.enterFullscreen();
        });
    }

    // ==========================================
    // 7. SISTEM HEARTBEAT (Hemat Kuota - 20 Detik)
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
        }, 20000); // 20.000 ms = 20 Detik
    }

    // ==========================================
    // 8. LOGIKA SELESAI UJIAN
    // ==========================================
    function finishExam(reasonStr) {
        NEXORA_SECURITY.disarm();
        if (DOM.formFrame) DOM.formFrame.style.display = 'none';
        if (DOM.timer) DOM.timer.textContent = "00:00:00";
        
        if (DOM.finished && DOM.finishReason) {
            DOM.finishReason.textContent = reasonStr;
            DOM.finished.style.display = 'flex';
        }

        // Hapus sesi agar siswa tidak bisa masuk lagi tanpa login ulang
        localStorage.removeItem('nexora_session');
    }

    // ==========================================
    // 9. EVENT LISTENER MULAI UJIAN & FULLSCREEN
    // ==========================================
    if (DOM.beginExamBtn) {
        DOM.beginExamBtn.addEventListener('click', () => {
            // 1. Inisiasi Audio Beep
            NEXORA_SECURITY.initAudio();
            
            // 2. Minta Fullscreen (Wajib karena ini dari klik pengguna)
            NEXORA_SECURITY.enterFullscreen();
            
            // 3. Aktifkan Keamanan
            NEXORA_SECURITY.arm();

            // 4. Muat Form
            if (session.formUrl && DOM.formFrame && DOM.formFrame.src !== session.formUrl) {
                if(DOM.loading) DOM.loading.style.display = 'flex';
                DOM.formFrame.src = session.formUrl;
                
                DOM.formFrame.onload = () => {
                    if(DOM.loading) DOM.loading.style.display = 'none';
                };
            }

            // 5. Sembunyikan Overlay
            if (DOM.startOverlay) DOM.startOverlay.style.display = 'none';
            
            // 6. Jalankan Timer & Heartbeat
            startTimer();
            startHeartbeat();
        });
    }

    // Tombol manual Fullscreen (ikon ⛶ di header)
    if (DOM.fullscreenBtn) {
        DOM.fullscreenBtn.addEventListener('click', () => {
            NEXORA_SECURITY.enterFullscreen();
        });
    }

    // ==========================================
    // 10. PEMERIKSAAN AWAL SAAT HALAMAN DIMUAT
    // ==========================================
    // Cek apakah ada penalti yang harus dilanjutkan
    const isPenalty3Locked = restoreThirdReloginLock();
    if (!isPenalty3Locked) {
        restorePenalty();
    }

    // Jika timer sudah pernah berjalan (kasus refresh halaman)
    if (session.startedAt && !isPenalty3Locked && !(session.penaltyUntil > Date.now())) {
        if (DOM.startOverlay) DOM.startOverlay.style.display = 'none';
        
        // Muat Form langsung
        if (DOM.formFrame) DOM.formFrame.src = session.formUrl;
        
        NEXORA_SECURITY.arm();
        startTimer();
        startHeartbeat();
    }
});
