/**
 * NEXORA EXAM - Next Generation Examination & Assessment System
 * File: exam.js (FULL FIXED VERSION)
 * SMP Negeri 44 Bandar Lampung
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. VALIDASI SESI UJIAN (PEMBERSIHAN & SAFETY CHECK)
    // ==========================================
    // Satu key baku "nexora_session" (lihat catatan konsolidasi key di app.js).
    // Cek localStorage dulu (persisten), lalu sessionStorage sebagai fallback.
    let rawSession = localStorage.getItem('nexora_session') || sessionStorage.getItem('nexora_session');
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

    // Jika status RELOGIN_REQUIRED (peninggalan sesi LAMA dari sebelum
    // sistem reset-otomatis pelanggaran ke-3 ini ada). Alur baru tidak
    // pernah menyetel status ini lagi, tapi kode ini dipertahankan supaya
    // siswa yang HP-nya masih menyimpan sesi lama tetap diarahkan balik
    // ke halaman login dengan aman, bukan macet di halaman ujian.
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

    // ==========================================
    // HELPER TAMPIL/SEMBUNYI ELEMEN (berbasis class "hidden")
    // ==========================================
    // PENTING: jangan pakai el.style.display = 'none' / 'flex' untuk
    // #startOverlay, #violationModal, dan #finished. Elemen-elemen itu
    // punya CSS `display: ... !important` (ujian.html / style.css) atau
    // class ".hidden { display:none !important }". Deklarasi !important
    // SELALU mengalahkan inline style biasa, jadi:
    //  - overlay "Siap Memulai?" tidak pernah hilang (menutupi Google Form),
    //  - modal pelanggaran tidak pernah muncul (padahal beep sudah bunyi).
    // Solusinya: toggle class "hidden" saja, dan kosongkan inline display.
    function showEl(el) {
        if (!el) return;
        el.classList.remove('hidden');
        el.style.display = '';
    }

    function hideEl(el) {
        if (!el) return;
        el.classList.add('hidden');
        el.style.display = '';
    }

    // Tampilkan modal pelanggaran dengan teks berwarna terang (kartu modal
    // berlatar biru tua; warna abu gelap lama membuat teks nyaris tak terbaca).
    function showViolationModal(title, message) {
        if (!DOM.violationModal || !DOM.violationText) return;
        DOM.violationText.innerHTML = `
            <div style="text-align:center; color:#fca5a5; font-weight:800; font-size:1.2rem; margin-bottom:10px;">
                ${title}
            </div>
            <p style="margin:0; font-size:1rem; color:#dbeafe;">${message}</p>
        `;
        showEl(DOM.violationModal);
    }

    // Google Form: paksa mode embed bila memakai URL docs.google.com/forms
    // (link pendek forms.gle tidak bisa diberi parameter, dibiarkan apa adanya).
    function normalizeFormUrl(url) {
        try {
            const u = new URL(url);
            if (u.hostname === 'docs.google.com' && u.pathname.indexOf('/forms/') === 0 && !u.searchParams.has('embedded')) {
                u.searchParams.set('embedded', 'true');
                return u.toString();
            }
        } catch (e) { /* URL tidak valid: pakai apa adanya */ }
        return url;
    }

    // Tampilkan identitas peserta jika elemen tersedia
    if (DOM.examIdentity && session.nama) {
        DOM.examIdentity.textContent = `${session.nama} (${session.kelas || 'Siswa'})`;
    }

    // Badge pelanggaran: dua angka terpisah --
    //  - Siklus (0-3): dipakai sistem untuk menentukan hukuman, dan DIRESET
    //    ke 0 tiap kali mencapai 3 dan masa penalti selesai.
    //  - Total (akumulatif): TIDAK PERNAH direset, terus bertambah meski
    //    siswa melanggar 5x, 10x, dst -- untuk catatan/riwayat permanen.
    function updateViolationBadge() {
        if (!DOM.violationBadge) return;
        const cycle = session.violations || 0;
        const total = session.totalViolations || 0;
        DOM.violationBadge.textContent = `⚠ Siklus ${cycle}/3 · Total ${total}`;
    }
    updateViolationBadge();

    // Set jumlah pelanggaran ke modul security jika ada
    if (typeof NEXORA_SECURITY !== 'undefined') {
        if (typeof NEXORA_SECURITY.setViolationCount === 'function') {
            NEXORA_SECURITY.setViolationCount(session.violations || 0);
        }
        if (typeof NEXORA_SECURITY.setTotalViolationCount === 'function') {
            NEXORA_SECURITY.setTotalViolationCount(session.totalViolations || 0);
        }
    }

    // ==========================================
    // 3. FITUR JAM REAL-TIME (TAHAP 1 - PRIORITAS Utama)
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
        } else if (typeof session.durationMs !== 'number' || !isFinite(session.durationMs) || session.durationMs <= 0) {
            // Jaring pengaman: sesi lama (dibuat sebelum perbaikan durationMs
            // di app.js, atau data korup) bisa punya startedAt tapi tanpa
            // durationMs -> tanpa ini, timer akan macet di "NaN:NaN:NaN"
            // selamanya. Pulihkan ke durasi default dari config.
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
    // 5. SISTEM PENALTY (SIKLUS RESET OTOMATIS DI PELANGGARAN KE-3)
    // ==========================================
    // Aturan: pelanggaran 1 -> kunci 90 detik. Pelanggaran 2 -> kunci 300
    // detik (5 menit). Pelanggaran 3 -> kunci 100 detik, lalu penghitung
    // OTOMATIS direset ke 0 dan ujian dilanjutkan (TIDAK ada relogin/keluar
    // ke halaman login lagi). Siklus lalu mulai lagi dari pelanggaran 1.
    let penaltyInterval = null;
    let penaltyRemainingMs = 0;
    let penaltyActive = false;

    function applyPenalty(penaltySeconds, isResetCycle = false) {
        penaltyActive = true;
        penaltyRemainingMs = penaltySeconds * 1000;

        if (DOM.closeViolationBtn) DOM.closeViolationBtn.style.display = 'none';

        // penaltyUntil adalah waktu ABSOLUT (timestamp), bukan sekadar
        // hitungan detik. Ini sumber kebenaran utama -- BUKAN counter
        // remainingSecs yang di-decrement per tick. Alasannya: banyak
        // browser mobile menahan/menghentikan (throttle) setInterval saat
        // tab di-background (layar dikunci / aplikasi diminimalkan) --
        // dulu, karena reset ke-0 di pelanggaran ke-3 murni mengandalkan
        // remainingSecs mencapai 0 lewat tick yang berjalan normal, kalau
        // HP terkunci selama proses menunggu, tick-nya macet/telat dan
        // reset otomatis nyaris tidak pernah benar-benar selesai -- itulah
        // sebabnya jumlah pelanggaran terus naik melebihi 3 dan tidak
        // pernah kembali ke 0. Sekarang penyelesaian penalti SELALU dicek
        // dengan membandingkan Date.now() terhadap session.penaltyUntil,
        // jadi begitu HP aktif lagi (walau telat), penalti langsung
        // dinyatakan selesai kalau waktunya memang sudah lewat.
        session.penaltyUntil = Date.now() + penaltyRemainingMs;
        session.penaltyIsReset = isResetCycle;
        saveSession();

        if (penaltyInterval) clearInterval(penaltyInterval);

        const baseWarningHtml = DOM.violationText ? DOM.violationText.innerHTML.split('<br><strong id="countdownPenalty"')[0] : '';

        function tickPenalty() {
            const remainingMsReal = session.penaltyUntil - Date.now();
            const remainingSecs = Math.max(0, Math.ceil(remainingMsReal / 1000));
            penaltyRemainingMs = Math.max(0, remainingMsReal);

            if (DOM.violationText) {
                DOM.violationText.innerHTML = `${baseWarningHtml}<br><strong id="countdownPenalty" style="color:#ef4444; font-size:1.2rem; display:block; margin-top:10px;">${isResetCycle ? 'Direset dalam' : 'Form Terkunci'}: ${remainingSecs} detik</strong>`;
            }

            if (remainingMsReal <= 0) {
                clearInterval(penaltyInterval);
                penaltyActive = false;
                session.penaltyUntil = null;
                session.penaltyIsReset = false;

                if (isResetCycle) {
                    // Reset penghitung pelanggaran ke 0 dan lanjutkan ujian
                    // di halaman yang sama, tanpa relogin.
                    session.violations = 0;
                    saveSession();

                    if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.resetViolationCount === 'function') {
                        NEXORA_SECURITY.resetViolationCount();
                    }
                    updateViolationBadge();

                    hideEl(DOM.violationModal);

                    if (typeof NEXORA_SECURITY !== 'undefined') {
                        if (typeof NEXORA_SECURITY.resumeViolations === 'function') NEXORA_SECURITY.resumeViolations();
                        if (typeof NEXORA_SECURITY.enterFullscreen === 'function') NEXORA_SECURITY.enterFullscreen();
                    }
                } else {
                    saveSession();

                    const penaltyElem = document.getElementById('countdownPenalty');
                    if (penaltyElem) penaltyElem.remove();

                    if (DOM.closeViolationBtn) {
                        DOM.closeViolationBtn.style.display = 'inline-block';
                        DOM.closeViolationBtn.textContent = 'Saya Mengerti, Lanjutkan Ujian';
                    }
                    // Untuk pelanggaran 1 & 2, deteksi baru dilanjutkan saat
                    // siswa menekan tombol "Saya Mengerti" (lihat listener
                    // closeViolationBtn di bawah), bukan otomatis di sini.
                }
            }
        }

        penaltyInterval = setInterval(tickPenalty, 1000);
        tickPenalty(); // jalankan sekali segera, jangan menunggu tick 1 detik pertama

        // Jaring pengaman tambahan: kalau HP dikunci/di-minimize SELAMA masa
        // penalti berjalan, setInterval di atas bisa ditahan (throttle) oleh
        // browser sehingga tick-nya telat. Begitu halaman aktif/terlihat lagi,
        // langsung evaluasi ulang berdasarkan waktu ASLI (session.penaltyUntil)
        // supaya penalti tidak "menggantung" lebih lama dari seharusnya, dan
        // supaya reset ke-0 di pelanggaran ke-3 benar-benar terjadi begitu
        // waktunya sudah lewat -- bukan menunggu tick berikutnya yang mungkin
        // tertunda lama.
        function recheckOnVisible() {
            if (!document.hidden && penaltyActive) tickPenalty();
        }
        document.addEventListener('visibilitychange', recheckOnVisible);
    }

    function restorePenalty() {
        if (session.penaltyUntil && session.penaltyUntil > Date.now()) {
            const remainingSecs = Math.floor((session.penaltyUntil - Date.now()) / 1000);
            const isReset = !!session.penaltyIsReset;
            const count = session.violations || 1;

            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.pauseViolations === 'function') {
                NEXORA_SECURITY.pauseViolations();
            }

            if (isReset) {
                triggerPenaltyUI(count, 'Anda sudah melakukan pelanggaran sebanyak 3 kali. Peringatan kecurangan akan direset ke 0. Silakan tunggu.');
            } else {
                triggerPenaltyUI(count, 'Anda merefresh halaman saat penalti berjalan.');
            }
            applyPenalty(remainingSecs, isReset);
            return true;
        }
        return false;
    }

    function triggerPenaltyUI(count, details) {
        hideEl(DOM.startOverlay);
        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.arm === 'function') {
            NEXORA_SECURITY.arm();
        }

        showViolationModal(`PELANGGARAN TERDETEKSI (${count}/3)`, details);
    }

    // ==========================================
    // 6. CALLBACK SECURITY (DENGAN PENANGANAN SAFE-CALL)
    // ==========================================
    if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.setCallback === 'function') {
        NEXORA_SECURITY.setCallback((count, type, details, totalCount) => {
            session.violations = count;
            session.totalViolations = typeof totalCount === 'number' ? totalCount : (session.totalViolations || 0) + 1;
            saveSession();

            updateViolationBadge();

            if (count >= 3) {
                // Pelanggaran ke-3: kunci 100 detik, lalu OTOMATIS direset
                // ke 0 (bukan relogin). Siklus mulai lagi dari awal.
                triggerPenaltyUI(count, 'Anda sudah melakukan pelanggaran sebanyak 3 kali. Peringatan kecurangan akan direset ke 0. Silakan tunggu selama 100 detik.');
                applyPenalty(100, true);
            } else if (count === 2) {
                triggerPenaltyUI(count, details);
                applyPenalty(300, false);
            } else {
                triggerPenaltyUI(count, details);
                applyPenalty(90, false);
            }
        });
    }

    if (DOM.closeViolationBtn) {
        DOM.closeViolationBtn.addEventListener('click', () => {
            hideEl(DOM.violationModal);
            if (typeof NEXORA_SECURITY !== 'undefined') {
                // Baru sekarang deteksi pelanggaran dilanjutkan (khusus
                // pelanggaran 1 & 2) — siswa sudah membaca peringatannya
                // dan sengaja menekan tombol ini.
                if (typeof NEXORA_SECURITY.resumeViolations === 'function') NEXORA_SECURITY.resumeViolations();
                if (typeof NEXORA_SECURITY.enterFullscreen === 'function') NEXORA_SECURITY.enterFullscreen();
            }
        });
    }

    // ==========================================
    // 7. SISTEM HEARTBEAT (Interval 30 Detik)
    // ==========================================
    // Sebelumnya 20 detik. Dengan potensi ~600 siswa aktif bersamaan,
    // interval diperlebar ke 30 detik untuk mengurangi beban permintaan
    // ke Google Apps Script (kuota eksekusi & penulisan Spreadsheet
    // terbatas), tanpa mengurangi kegunaan pemantauan pengawas secara
    // berarti.
    function startHeartbeat() {
        setInterval(() => {
            const scriptUrl = window.NEXORA_CONFIG?.scriptUrl || window.NEXORA_CONFIG?.monitoringUrl;

            const payload = {
                action: 'heartbeat',
                sessionId: session.sessionId || '-',
                nisn: session.nisn || '-',
                name: session.nama || session.name || '-',
                nama: session.nama || session.name || '-',
                kelas: session.kelas || session.className || '-',
                className: session.className || session.kelas || '-',
                subjectName: session.subjectName || session.mapel || '-',
                remainingMs: remainingMs,
                penaltyRemainingMs: penaltyRemainingMs,
                violations: session.violations || 0,
                violationsCount: session.violations || 0,
                totalViolations: session.totalViolations || 0,
                penaltyActive: penaltyActive,
                timestamp: new Date().toISOString(),
                at: Date.now()
            };

            // Simpan salinan lokal juga, dipakai oleh pengawas.html sebagai
            // jaring pengaman kalau Apps Script belum/gagal dikonfigurasi.
            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.writeLocalMonitoring === 'function') {
                NEXORA_SECURITY.writeLocalMonitoring(payload);
            }

            if (!scriptUrl) return;

            // Header Content-Type sengaja tidak diset — lihat catatan di security.js.
            fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(payload)
            }).catch(e => console.log("Heartbeat tersendat (Abaikan, sistem berjalan lokal)"));
        }, 30000);
    }

    // ==========================================
    // PROTEKSI KELUAR HALAMAN / TOMBOL BACK SELAMA UJIAN BERLANGSUNG
    // ==========================================
    let examActiveForNavGuard = false;

    function isExamActiveNow() {
        return examActiveForNavGuard && !(session.status === 'FINISHED');
    }

    window.addEventListener('beforeunload', (e) => {
        if (!isExamActiveNow()) return;
        e.preventDefault();
        e.returnValue = 'Ujian sedang berlangsung. Yakin ingin meninggalkan halaman ini?';
        return e.returnValue;
    });

    // Cegah tombol Back browser menutup/keluar dari halaman ujian: kita
    // "kunci" satu history entry ekstra, sehingga menekan Back hanya
    // membatalkan entry itu dan tetap berada di ujian.html.
    let backGuardArmed = false;
    function armBackButtonGuard() {
        if (backGuardArmed) return; // cegah listener ganda
        backGuardArmed = true;
        history.pushState({ nexoraGuard: true }, document.title, location.href);
        window.addEventListener('popstate', () => {
            if (!isExamActiveNow()) return;
            history.pushState({ nexoraGuard: true }, document.title, location.href);
            showViolationModal('JANGAN TEKAN TOMBOL KEMBALI', 'Ujian masih berlangsung. Gunakan tombol yang tersedia di halaman ini saja.');
        });
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
            showEl(DOM.finished);
        }

        examActiveForNavGuard = false;
        localStorage.removeItem('nexora_session');
        sessionStorage.removeItem('nexora_session');
    }

    // ==========================================
    // 9. EVENT LISTENER MULAI UJIAN & FULLSCREEN
    // ==========================================
    if (DOM.beginExamBtn) {
        DOM.beginExamBtn.addEventListener('click', () => {
            // Safe call inisialisasi Audio
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

            // Muat Form Google Form
            if (session.formUrl && DOM.formFrame) {
                if (DOM.loading) DOM.loading.style.display = 'flex';
                DOM.formFrame.src = normalizeFormUrl(session.formUrl);
                
                DOM.formFrame.onload = () => {
                    if (DOM.loading) DOM.loading.style.display = 'none';
                };
            }

            // Sembunyikan Overlay Mulai
            hideEl(DOM.startOverlay);
            
            // Tandai status bahwa ujian telah dimulai
            session.isStarted = true;
            saveSession();

            // Jalankan Timer & Heartbeat
            startTimer();
            startHeartbeat();

            // Aktifkan proteksi keluar halaman / tombol Back
            examActiveForNavGuard = true;
            armBackButtonGuard();
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
    // CATATAN: fungsi restoreThirdReloginLock() & alur relogin pelanggaran
    // ke-3 sudah dihapus — sekarang pelanggaran ke-3 direset otomatis ke 0
    // (lihat restorePenalty() & applyPenalty() di atas), tidak ada lagi
    // sesi yang "dibekukan" menunggu login ulang.
    const inPenaltyNow = restorePenalty();

    // Proteksi keluar halaman (beforeunload + tombol Back) HARUS tetap aktif
    // selama sesi belum selesai — termasuk saat sedang dalam masa penalti,
    // bukan cuma saat form sedang aktif diisi. Sebelumnya celah ini bisa
    // dipakai siswa kabur dari penalti dengan menutup tab / menekan Back
    // saat modal penalti tampil.
    if (session.startedAt || session.isStarted || inPenaltyNow) {
        examActiveForNavGuard = true;
        armBackButtonGuard();
    }

    // Jika siswa merefresh saat ujian sedang berjalan (di luar masa penalti)
    if ((session.startedAt || session.isStarted) && !inPenaltyNow) {
        hideEl(DOM.startOverlay);
        
        if (DOM.formFrame && session.formUrl) {
            DOM.formFrame.src = normalizeFormUrl(session.formUrl);
        }
        
        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.arm === 'function') {
            NEXORA_SECURITY.arm();
        }
        startTimer();
        startHeartbeat();
    }
});
