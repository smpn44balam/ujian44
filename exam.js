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

    // Sesi basi (kemarin / lewat durasi ujian): buang, kembali ke login.
    if (typeof window.NEXORA_isSessionExpired === 'function' && window.NEXORA_isSessionExpired(session)) {
        localStorage.removeItem('nexora_session');
        sessionStorage.removeItem('nexora_session');
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
        finishExamBtn: document.getElementById('finishExamBtn'),
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
        examIdentity: document.getElementById('examIdentity'),
        startIdentity: document.getElementById('startIdentity'),
        timeBanner: document.getElementById('timeBanner'),
        finishConfirm: document.getElementById('finishConfirm'),
        finishWarn: document.getElementById('finishWarn'),
        finishBack: document.getElementById('finishBack'),
        finishOk: document.getElementById('finishOk'),
        reloadBtn: document.getElementById('reloadFormBtn'),
        reloadConfirm: document.getElementById('reloadConfirm'),
        reloadConfirmText: document.getElementById('reloadConfirmText'),
        reloadOk: document.getElementById('reloadOk'),
        reloadCancel: document.getElementById('reloadCancel')
    };

    // Ambil nilai config tanpa sintaks "?." (gagal total di Chrome/WebView < 80
    // yang masih banyak di HP lama).
    function cfg(key, fallback) {
        const c = window.NEXORA_CONFIG;
        return (c && c[key] !== undefined && c[key] !== null) ? c[key] : fallback;
    }

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
    function showViolationModal(title, message, color) {
        if (!DOM.violationModal || !DOM.violationText) return;
        DOM.violationText.innerHTML = `
            <div style="text-align:center; color:${color || '#fca5a5'}; font-weight:800; font-size:1.2rem; margin-bottom:10px;">
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

    // ==========================================
    // MEMUAT GOOGLE FORM KE <iframe> (dipakai di beberapa tempat)
    // ==========================================
    // BUG (fase 8): sebelumnya "muat form ke iframe" ditulis terpisah di
    // dua tempat: sekali lengkap (tampilkan #loading + pasang onload) saat
    // tombol "Mulai Ujian" diklik, dan sekali lagi TIDAK LENGKAP (cuma
    // set formFrame.src, tanpa menyentuh #loading sama sekali) di bagian
    // "siswa merefresh saat ujian berjalan". #loading TIDAK disembunyikan
    // secara default oleh CSS -- ia hanya disembunyikan lewat onload
    // iframe yang tadi tidak pernah dipasang ulang di jalur kedua itu.
    // Akibatnya: begitu halaman ini reload di tengah ujian (paling sering
    // terjadi kalau tab di HP dibekukan/dimuat ulang otomatis oleh Android
    // saat menunggu lama, misalnya penalti 300 detik di pelanggaran ke-2),
    // tulisan "Memuat lembar ujian..." macet tampil selamanya walau form
    // sebenarnya sudah selesai dimuat. Sekarang disatukan jadi satu fungsi
    // supaya kedua jalur selalu konsisten.
    // Banner tipis di bawah bar atas (peringatan waktu). Tidak memakan ruang
    // saat tidak dipakai.
    let bannerTimer = null;
    function setBanner(text, level) {
        if (!DOM.timeBanner) return;
        if (!text) { DOM.timeBanner.className = 'xbanner hidden'; return; }
        DOM.timeBanner.textContent = text;
        DOM.timeBanner.className = 'xbanner' + (level === 'danger' ? ' danger' : '');
    }
    function flashBanner(text, level, ms) {
        setBanner(text, level);
        if (bannerTimer) clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => { setBanner(''); bannerTimer = null; }, ms || 8000);
    }

    // Berapa kali iframe Google Form selesai memuat. Form dimuat = 1. Tiap
    // "Berikutnya" atau "Kirim" membuat iframe berpindah halaman = +1.
    // Dipakai sebagai PETUNJUK (bukan bukti) apakah siswa sudah menekan Kirim
    // -- isi iframe cross-origin tidak bisa dibaca.
    let formLoadCount = 0;
    let slowHintTimer = null;
    const DEBUG_FORM = /[?&]debug/.test(location.search);

    function loadExamForm() {
        if (!session.formUrl || !DOM.formFrame) return;
        if (DOM.loading) DOM.loading.style.display = 'flex';
        // Pasang onload SEBELUM men-set src (bukan sesudah), supaya tidak
        // ada celah waktu di mana form sempat selesai dimuat sebelum
        // handler penyembunyi #loading terpasang.
        formLoadCount = 0;
        DOM.formFrame.onload = () => {
            formLoadCount++;
            if (DOM.loading) DOM.loading.style.display = 'none';
            if (DEBUG_FORM) flashBanner('debug: formLoadCount=' + formLoadCount, 'warn', 4000);
        };
        // Jaringan lemot: kalau form belum muncul setelah 20 detik, beri petunjuk.
        if (slowHintTimer) clearTimeout(slowHintTimer);
        slowHintTimer = setTimeout(() => {
            if (formLoadCount === 0 && !session.finishedFlag) {
                flashBanner('Form belum muncul. Tekan tombol ⟳ di atas untuk memuat ulang.', 'warn', 12000);
            }
        }, 20000);
        DOM.formFrame.src = normalizeFormUrl(session.formUrl);
    }

    // Tampilkan identitas peserta jika elemen tersedia
    if (session.nama) {
        const idText = `${session.nama} (${session.kelas || 'Siswa'}) · ${session.subjectName || session.mapel || ''}`;
        if (DOM.examIdentity) DOM.examIdentity.textContent = idText;
        if (DOM.startIdentity) DOM.startIdentity.textContent = idText;
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
        DOM.violationBadge.textContent = `⚠ ${cycle}/3`;
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
    // BUG FIX (masalah #2 dilaporkan guru): iPhone + Chrome tidak bisa masuk
    // fullscreen & malah tercatat sebagai pelanggaran "keluar fullscreen".
    // Root cause ada di security.js (lihat catatan panjang di sana): Apple
    // tidak mengizinkan Fullscreen API berjalan penuh di browser non-Safari
    // pada iPhone. security.js sekarang tidak lagi mencatat pelanggaran
    // untuk kasus ini, dan memanggil callback berikut SEKALI kalau memang
    // terdeteksi tidak didukung -- kita tampilkan pesan non-blocking supaya
    // siswa tahu dan bisa pindah ke Safari kalau mau, tapi ujian tetap bisa
    // dilanjutkan (deteksi pindah tab & devtools tetap aktif).
    if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.setFullscreenUnsupportedCallback === 'function') {
        NEXORA_SECURITY.setFullscreenUnsupportedCallback(() => {
            showViolationModal(
                'INFO — LAYAR PENUH TIDAK DIDUKUNG',
                'Browser ini (biasanya Chrome/Firefox di iPhone) tidak mengizinkan mode layar penuh. Ini BUKAN pelanggaran dan tidak dicatat. Untuk hasil terbaik, gunakan aplikasi <strong>Safari</strong> di iPhone Anda. Ujian tetap bisa dilanjutkan seperti biasa.',
                '#93c5fd'
            );
        });
    }

    // ==========================================
    // 3. FITUR JAM REAL-TIME (TAHAP 1 - PRIORITAS Utama)
    // ==========================================
    // (jam & tanggal real-time dihapus dari layar ujian agar bar atas ringkas)

    // ==========================================
    // 4. TIMER SISA WAKTU
    // ==========================================
    let durationMs = cfg('durationMinutes', 90) * 60 * 1000;
    let examTimerInterval = null;
    let remainingMs = durationMs;

    let warned5 = false;
    let warned1 = false;
    let graceStarted = false;

    function formatTime(ms) {
        const totalSecs = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(totalSecs / 3600);
        const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
        const sec = String(totalSecs % 60).padStart(2, '0');
        return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
    }

    function tickExamTimer() {
        const elapsed = Date.now() - session.startedAt;
        remainingMs = Math.max(0, session.durationMs - elapsed);

        if (DOM.timer) {
            DOM.timer.textContent = formatTime(remainingMs);
            DOM.timer.classList.toggle('warn', remainingMs <= 300000 && remainingMs > 60000);
            DOM.timer.classList.toggle('danger', remainingMs <= 60000);
        }

        if (remainingMs > 0) {
            if (remainingMs <= 300000 && !warned5) {
                warned5 = true;
                flashBanner('Sisa waktu 5 menit. Pastikan jawabanmu sudah di-KIRIM.', 'warn', 10000);
            }
            if (remainingMs <= 60000 && !warned1) {
                warned1 = true;
                flashBanner('Sisa 1 menit! Tekan KIRIM di form sekarang.', 'danger', 10000);
            }
            return;
        }

        // ---- Waktu habis: beri tenggang supaya siswa sempat menekan KIRIM ----
        // Dulu form langsung disembunyikan saat 00:00, sehingga jawaban yang
        // belum terkirim hilang (nilai tidak tercatat).
        const graceMs = Math.max(0, Number(cfg('graceAfterTimeUpSeconds', 120))) * 1000;
        const graceLeft = session.startedAt + session.durationMs + graceMs - Date.now();

        if (graceLeft <= 0) {
            clearInterval(examTimerInterval);
            finishExam('Waktu ujian telah habis.');
            return;
        }

        if (!graceStarted) {
            graceStarted = true;
            // Lepas kunci penalti & modal supaya form bisa dipakai untuk KIRIM,
            // dan matikan deteksi pelanggaran selama tenggang.
            if (penaltyInterval) clearInterval(penaltyInterval);
            penaltyActive = false;
            session.penaltyUntil = null;
            session.penaltyIsReset = false;
            saveSession();
            hideEl(DOM.violationModal);
            hideEl(DOM.finishConfirm);
            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.disarm === 'function') {
                NEXORA_SECURITY.disarm();
            }
        }
        if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
        setBanner(`Waktu habis! Tekan KIRIM di form sekarang (${Math.ceil(graceLeft / 1000)} dtk)`, 'danger');
    }

    function startTimer() {
        if (!session.startedAt) {
            session.startedAt = Date.now();
            session.durationMs = durationMs;
            saveSession();
        } else if (typeof session.durationMs !== 'number' || !isFinite(session.durationMs) || session.durationMs <= 0) {
            // Jaring pengaman: sesi lama tanpa durationMs -> timer "NaN".
            session.durationMs = durationMs;
            saveSession();
        }

        if (examTimerInterval) clearInterval(examTimerInterval);
        examTimerInterval = setInterval(tickExamTimer, 1000);
        tickExamTimer();
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
                DOM.violationText.innerHTML = `${baseWarningHtml}<br><strong id="countdownPenalty" style="color:#ef4444; font-size:1.2rem; display:block; margin-top:10px;">${isResetCycle ? 'Direset dalam' : 'Form Terkunci'}: ${remainingSecs} detik<span style="display:block; margin-top:6px; font-size:.8rem; font-weight:400; color:#cbd5e1;">Waktu ujian TETAP berjalan selama form terkunci.</span></strong>`;
            }

            if (remainingMsReal <= 0) {
                clearInterval(penaltyInterval);
                penaltyActive = false;
                session.penaltyUntil = null;
                session.penaltyIsReset = false;

                if (isResetCycle) {
                    // Reset penghitung pelanggaran ke 0 dan lanjutkan ujian
                    // di halaman yang sama, tanpa relogin. Ini aman
                    // dilakukan otomatis (tanpa gesture) karena cuma
                    // mengubah angka/badge -- BUKAN meminta browser masuk
                    // fullscreen (lihat catatan di bawah kenapa itu beda).
                    session.violations = 0;
                    saveSession();

                    if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.resetViolationCount === 'function') {
                        NEXORA_SECURITY.resetViolationCount();
                    }
                    updateViolationBadge();
                } else {
                    saveSession();
                }

                // BUG (fase 9) -- "pelanggaran berjalan sendiri" setelah
                // siklus ke-3 selesai: sebelumnya, begitu 100 detik habis,
                // kode di sini LANGSUNG memanggil resumeViolations() DAN
                // enterFullscreen() secara otomatis dari timer, tanpa
                // menunggu klik siswa. Masalahnya, requestFullscreen()
                // mengharuskan ada gesture pengguna ASLI (tap/klik) --
                // sebuah timer bukan gesture, jadi permintaan fullscreen
                // otomatis ini GAGAL DIAM-DIAM kalau pas 100 detiknya habis
                // siswa sedang tidak menyentuh/melihat halaman ujian (mis.
                // sedang baca pesan lain). Karena deteksi sudah kepalang
                // di-resume duluan, begitu siswa balik ke tab, sistem
                // langsung mencatat "keluar fullscreen" LAGI -- padahal
                // siswa tidak melakukan apa pun yang baru sejak pelanggaran
                // ke-3 tadi, cuma masih dalam kondisi yang sama. Sekarang
                // siklus reset diperlakukan SAMA seperti pelanggaran 1 & 2:
                // modal tetap tampil dengan tombol "Saya Mengerti, Lanjutkan
                // Ujian", dan resumeViolations() + enterFullscreen() baru
                // dipanggil setelah siswa benar-benar menekan tombol itu
                // (lihat listener closeViolationBtn di bawah) -- gesture
                // asli, jadi permintaan fullscreen dijamin tidak gagal diam
                // -diam, dan deteksi tidak dilanjutkan sebelum siswa benar-
                // benar kembali & sadar sedang melihat halaman ujian.
                const penaltyElem = document.getElementById('countdownPenalty');
                if (penaltyElem) penaltyElem.remove();

                if (DOM.violationText && isResetCycle) {
                    DOM.violationText.innerHTML = `${baseWarningHtml}<br><strong style="color:#22c55e; font-size:1.05rem; display:block; margin-top:10px;">Peringatan pelanggaran sudah direset ke 0/3. Klik tombol di bawah untuk melanjutkan ujian.</strong>`;
                }

                if (DOM.closeViolationBtn) {
                    DOM.closeViolationBtn.style.display = 'inline-block';
                    DOM.closeViolationBtn.textContent = 'Saya Mengerti, Lanjutkan Ujian';
                }
                // Untuk pelanggaran 1, 2, MAUPUN siklus reset di pelanggaran
                // ke-3: deteksi baru dilanjutkan saat siswa menekan tombol
                // "Saya Mengerti" (lihat listener closeViolationBtn di
                // bawah), bukan otomatis di sini.
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
                // Baru sekarang deteksi pelanggaran dilanjutkan (pelanggaran
                // 1, 2, MAUPUN siklus reset di pelanggaran ke-3) — siswa
                // sudah membaca peringatannya dan sengaja menekan tombol
                // ini, jadi enterFullscreen() di sini dijamin dipanggil
                // dari gesture pengguna asli (tidak akan gagal diam-diam
                // seperti kalau dipanggil otomatis dari timer).
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
    let heartbeatTimer = null;
    let heartbeatInFlight = false;

    function startHeartbeat() {
        if (heartbeatTimer) return; // jangan dobel
        const everySec = Math.max(15, Number(cfg('heartbeatSeconds', 60)) || 60);
        heartbeatTimer = setInterval(sendHeartbeat, everySec * 1000);
    }

    function sendHeartbeat() {
        const scriptUrl = cfg('scriptUrl', '') || cfg('monitoringUrl', '');

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

        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.writeLocalMonitoring === 'function') {
            NEXORA_SECURITY.writeLocalMonitoring(payload);
        }

        if (!scriptUrl) return;
        // Jaringan lemot / offline: jangan menumpuk permintaan yang berebut
        // bandwidth dengan Google Form.
        if (navigator.onLine === false) return;
        if (heartbeatInFlight) return;
        heartbeatInFlight = true;

        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const killer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
        const done = () => { heartbeatInFlight = false; if (killer) clearTimeout(killer); };

        // Cache-busting + no-store: lihat catatan di sendMonitoring() (security.js).
        const bustedUrl = scriptUrl + (scriptUrl.indexOf('?') === -1 ? '?' : '&') + '_ts=' + Date.now();
        const opts = { method: 'POST', mode: 'no-cors', cache: 'no-store', body: JSON.stringify(payload) };
        if (ctrl) opts.signal = ctrl.signal;

        fetch(bustedUrl, opts).then(done, done);
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
        hideEl(DOM.finishConfirm);
        hideEl(DOM.reloadConfirm);
        setBanner('');
        session.finishedFlag = true;
        if (DOM.formFrame) DOM.formFrame.style.display = 'none';
        if (DOM.timer) DOM.timer.textContent = "00:00";
        
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
            loadExamForm();

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
    // BUG FIX (masalah #1 dilaporkan guru): "siswa menyelesaikan form,
    // tidak langsung finish" -- sebelumnya finishExam() HANYA dipanggil
    // saat timer habis (lihat startTimer()). Tidak ada jalur lain untuk
    // mengakhiri sesi. Google Form yang di-embed lewat <iframe> bersifat
    // cross-origin (docs.google.com), sehingga halaman ujian.html TIDAK
    // BISA mendeteksi secara otomatis kapan siswa menekan tombol "Kirim"
    // di dalam form itu (tidak ada API/postMessage resmi dari Google Form
    // untuk ini). Akibatnya: siswa sudah selesai & submit form, tapi
    // timer & mode aman (fullscreen/tab-lock) TETAP AKTIF. Begitu siswa
    // menutup tab / keluar dari HP, event itu tertangkap sebagai
    // FULLSCREEN_EXIT / VISIBILITY_HIDDEN -> tercatat sebagai kecurangan.
    //
    // SOLUSI: tombol "✓ Selesai" manual yang memanggil finishExam()
    // secara eksplisit. Ini men-disarm keamanan & menghentikan timer
    // SEBELUM siswa meninggalkan halaman, sehingga keluar setelahnya
    // tidak lagi terdeteksi sebagai pelanggaran. Siswa diingatkan lewat
    // dialog konfirmasi supaya tidak menekannya sebelum benar-benar
    // menekan Kirim/Submit di Google Form.
    // ==========================================
    if (DOM.finishExamBtn) {
        let finishTimer = null;
        let finishSuspect = false;

        DOM.finishExamBtn.addEventListener('click', () => {
            // Hanya relevan kalau ujian memang sudah dimulai.
            if (!examActiveForNavGuard && !(session.startedAt || session.isStarted)) return;
            if (!DOM.finishConfirm || !DOM.finishOk) return;

            // Form belum pernah berpindah halaman (loadCount <= 1) = kemungkinan
            // besar tombol KIRIM belum ditekan. Ini petunjuk, bukan kepastian.
            finishSuspect = formLoadCount <= 1;
            if (DOM.finishWarn) DOM.finishWarn.classList.toggle('hidden', !finishSuspect);

            const base = finishSuspect ? 'Tetap selesai (tidak disarankan)' : 'Ya, sudah terkirim';
            DOM.finishOk.classList.toggle('danger', finishSuspect);
            DOM.finishOk.classList.toggle('secondary', !finishSuspect);
            DOM.finishOk.disabled = true;

            // Tombol konfirmasi baru aktif setelah jeda, supaya pesan sempat terbaca.
            let wait = finishSuspect ? 8 : 3;
            DOM.finishOk.textContent = `${base} (${wait})`;
            if (finishTimer) clearInterval(finishTimer);
            finishTimer = setInterval(() => {
                wait--;
                if (wait <= 0) {
                    clearInterval(finishTimer);
                    finishTimer = null;
                    DOM.finishOk.disabled = false;
                    DOM.finishOk.textContent = base;
                } else {
                    DOM.finishOk.textContent = `${base} (${wait})`;
                }
            }, 1000);

            showEl(DOM.finishConfirm);
        });

        if (DOM.finishBack) {
            DOM.finishBack.addEventListener('click', () => {
                if (finishTimer) { clearInterval(finishTimer); finishTimer = null; }
                hideEl(DOM.finishConfirm);
            });
        }

        DOM.finishOk.addEventListener('click', () => {
            if (DOM.finishOk.disabled) return;
            // Catat ke monitoring supaya pengawas bisa menelusuri siswa yang
            // menutup tanpa KIRIM. (Ini bukan pelanggaran: penghitung tidak naik.)
            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.sendMonitoring === 'function') {
                NEXORA_SECURITY.sendMonitoring(
                    finishSuspect ? 'FINISH_TANPA_KIRIM_TERDETEKSI' : 'FINISH_OK',
                    'formLoadCount=' + formLoadCount + '; sisaWaktuMs=' + Math.round(remainingMs)
                );
            }
            session.status = 'FINISHED';
            saveSession();
            finishExam('Ujian diselesaikan oleh siswa (tombol Selesai).');
        });
    }

    // ==========================================
    // TOMBOL MUAT ULANG FORM (⟳)
    // ==========================================
    // Me-refresh HANYA Google Form di dalam iframe (bukan seluruh halaman):
    // timer tetap berjalan, sesi & pelanggaran tidak berubah, tidak ada
    // dialog "yakin meninggalkan halaman", dan fullscreen tidak terganggu.
    // Berguna kalau soal/gambar tidak muncul atau form macet di jaringan lemot.
    if (DOM.reloadBtn) {
        let reloadLock = false;

        const doReloadForm = () => {
            if (reloadLock) return;
            reloadLock = true;
            setTimeout(() => { reloadLock = false; }, 3000); // cegah ketukan beruntun
            hideEl(DOM.reloadConfirm);

            // Catatan informasional untuk pengawas (BUKAN pelanggaran).
            if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.sendMonitoring === 'function') {
                NEXORA_SECURITY.sendMonitoring('FORM_RELOAD', 'formLoadCount=' + formLoadCount);
            }
            // Kosongkan dulu (onload dicopot agar about:blank tidak terhitung
            // sebagai "form berpindah halaman"), lalu muat ulang dari awal.
            // Menugaskan src yang sama persis tidak selalu memicu muat ulang.
            if (DOM.formFrame) {
                DOM.formFrame.onload = null;
                DOM.formFrame.src = 'about:blank';
            }
            setTimeout(loadExamForm, 150);
        };

        DOM.reloadBtn.addEventListener('click', () => {
            if (!(session.startedAt || session.isStarted) || session.finishedFlag) return;

            // Form belum termuat sama sekali: tidak ada jawaban yang bisa hilang,
            // langsung muat ulang tanpa bertanya.
            if (formLoadCount === 0) { doReloadForm(); return; }

            if (DOM.reloadConfirmText) {
                DOM.reloadConfirmText.textContent = (formLoadCount >= 2)
                    ? 'Kalau kamu SUDAH menekan KIRIM, tidak perlu muat ulang dan jangan kirim dua kali. Kalau belum, jawaban yang belum terkirim bisa hilang.'
                    : 'Pakai ini kalau soal atau gambar tidak muncul. Jawaban yang sudah diisi tapi belum dikirim bisa hilang. Waktu ujian tetap berjalan.';
            }
            showEl(DOM.reloadConfirm);
        });

        if (DOM.reloadOk) DOM.reloadOk.addEventListener('click', doReloadForm);
        if (DOM.reloadCancel) DOM.reloadCancel.addEventListener('click', () => hideEl(DOM.reloadConfirm));
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

    // Muat ulang Google Form ke <iframe> setiap kali halaman INI dimuat
    // ulang sementara ujian sudah dimulai -- BAIK sedang dalam masa
    // penalti MAUPUN tidak. <iframe> baru selalu kosong (atribut src tidak
    // ikut tersimpan lintas reload), jadi tanpa baris ini:
    //  - kalau reload terjadi DI LUAR masa penalti: dulu formFrame.src
    //    memang di-set ulang, tapi #loading ("Memuat lembar ujian...")
    //    tidak pernah disembunyikan lagi (lihat catatan di loadExamForm())
    //    -- inilah yang bikin tulisan itu macet tampil selamanya.
    //  - kalau reload terjadi PAS SEDANG dalam masa penalti (mis. HP
    //    membekukan/reload tab otomatis selagi menunggu penalti 300 detik
    //    di pelanggaran ke-2): dulu formFrame.src TIDAK PERNAH di-set ulang
    //    sama sekali untuk kasus ini -- begitu modal penalti ditutup,
    //    form-nya kosong permanen.
    if (session.startedAt || session.isStarted) {
        loadExamForm();
    }

    // Jika siswa merefresh saat ujian sedang berjalan (di luar masa penalti)
    // (Dulu ada syarat "&& !inPenaltyNow": kalau halaman dimuat ulang saat penalti,
    // timer & heartbeat TIDAK PERNAH dijalankan lagi setelah penalti selesai.)
    if (session.startedAt || session.isStarted) {
        hideEl(DOM.startOverlay);

        if (typeof NEXORA_SECURITY !== 'undefined' && typeof NEXORA_SECURITY.arm === 'function') {
            NEXORA_SECURITY.arm();
        }
        startTimer();
        startHeartbeat();
    }
});
