# Catatan Revisi (hari ke-2 ujian)

## Yang berubah
- **ujian.html**: bar atas jadi satu baris 40px (nama | sisa waktu | ⚠ n/3 | Selesai).
  Dihapus: logo/brand, jam, tanggal, tombol layar penuh, baris "Peserta Ujian".
  Form Google tampil penuh tanpa margin/bingkai. Zoom jari diizinkan. style.css tidak dimuat di halaman ini.
- **Tombol Selesai** kini 2 langkah: konfirmasi dengan tombol "Kembali ke form". Kalau sistem mendeteksi form
  belum berpindah halaman (kemungkinan belum KIRIM), muncul peringatan merah + tombol dikunci 8 detik.
  Hasilnya dicatat ke monitoring sebagai `FINISH_OK` / `FINISH_TANPA_KIRIM_TERDETEKSI`.
- **Waktu habis**: form tetap tampil selama `graceAfterTimeUpSeconds` (default 120 dtk); kunci penalti dilepas.
  Peringatan di sisa 5 menit dan 1 menit.
- **Sesi basi** (beda hari / lewat durasi+30 menit) dibuang otomatis.
- **Login ulang** (nama+kelas+mapel sama) melanjutkan sisa waktu (`resumeKeepsTimer`), penalti berjalan ikut terbawa.
- **Heartbeat**: 60 dtk, timeout 8 dtk, tidak menumpuk, berhenti saat offline.
- **Blur palsu**: jeda deteksi 150 ms -> 700 ms.
- **HP lama**: sintaks `?.` dihapus dari exam.js (menyebabkan seluruh skrip mati di Chrome/WebView < 80).
- **Bug lama**: reload halaman saat penalti membuat timer & heartbeat tidak pernah jalan lagi. Sudah diperbaiki.

- **Tombol ⟳ (muat ulang form)** di bar atas: me-refresh hanya Google Form di iframe. Timer jalan terus,
  bukan pelanggaran, fullscreen tidak terganggu. Jika form belum termuat sama sekali -> langsung muat ulang;
  jika sudah termuat -> konfirmasi (jawaban belum terkirim bisa hilang). Dicatat sebagai `FORM_RELOAD`.

## Pengaturan (config.js)
graceAfterTimeUpSeconds, heartbeatSeconds, sessionExtraMinutes, resumeKeepsTimer

## Menguji deteksi "sudah KIRIM"
Buka `ujian.html?debug=1` pada sesi uji, mulai ujian, lalu kirim satu jawaban percobaan ke Form asli.
Banner kecil menampilkan `formLoadCount`. Harus 1 saat form baru terbuka dan naik jadi 2 setelah KIRIM.
Form multi-halaman: angka juga naik tiap "Berikutnya", jadi deteksi hanya petunjuk, bukan kepastian.

## Naikkan versi cache
ujian.html memuat config.js?v=14, security.js?v=13, exam.js?v=14; index.html memuat config.js?v=14, app.js?v=12.
