# NEXORA EXAM SMPN 44 — Panduan Pemasangan

## 1. Upload ke GitHub

Repository target:
https://github.com/smpn44balam/ujian44

Upload seluruh file:
- index.html
- siswa.html
- ujian.html
- pengawas.html
- config.js
- app.js
- exam-config.js
- exam.js
- security.js
- pengawas.js
- style.css
- manifest.json

File `Code.gs` TIDAK di-upload sebagai bagian website. File tersebut dipasang di Google Apps Script.

## 2. Buat 36 Google Form

Buat:
- 12 Form tingkat VII
- 12 Form tingkat VIII
- 12 Form tingkat IX

Contoh:
- MTK VII
- MTK VIII
- MTK IX

Semua rombel dalam tingkat yang sama menggunakan Form yang sama.

## 3. Hubungkan setiap Form ke Google Spreadsheet

Di Google Forms, buka tab Respons lalu pilih tujuan respons / spreadsheet.
Google Forms memang mendukung penyimpanan respons ke Google Sheets.

## 4. Masukkan 36 link ke config.js

Isi bagian GOOGLE_FORMS.

Contoh:
GOOGLE_FORMS.VII.matematika = "https://docs.google.com/forms/d/e/.../viewform"

Jangan memasukkan link edit Form. Gunakan link untuk responden.

## 5. Google Apps Script monitoring (opsional tetapi disarankan)

Buat satu Google Spreadsheet untuk monitoring.

Extensions > Apps Script.

Tempel isi `Code.gs`.

Deploy sebagai Web app:
- Execute as: Me
- Who has access: Anyone
- Salin URL `/exec`

Masukkan URL tersebut ke:

monitoringEndpoint: "URL_APPS_SCRIPT_ANDA"

Kemudian upload ulang config.js ke GitHub.

## 6. GitHub Pages

Di repository:
Settings > Pages

Pilih:
- Deploy from a branch
- Branch: main
- Folder: / (root)

Simpan.

GitHub Pages akan menerbitkan `index.html`.

## 7. Uji sebelum dipakai siswa

Uji minimal:
1. VII-A + Matematika -> Form Matematika VII
2. VIII-A + Matematika -> Form Matematika VIII
3. IX-A + Matematika -> Form Matematika IX
4. Keluar fullscreen -> indikator bertambah
5. Pindah tab -> indikator bertambah
6. Timer berjalan
7. Respons Google Form masuk ke spreadsheet
8. Monitoring Apps Script menerima event

## Batasan teknis penting

NEXORA adalah web app statis. JavaScript browser tidak dapat menjamin bahwa siswa benar-benar tidak menggunakan perangkat/aplikasi lain. Indikator seperti keluar fullscreen, visibility change, atau kehilangan fokus adalah indikator untuk pemeriksaan, bukan bukti pasti kecurangan.

Google Form juga tetap merupakan sistem terpisah. NEXORA tidak dapat membaca jawaban Google Form secara langsung dari iframe karena batasan keamanan browser.

Untuk pengamanan tingkat tinggi, gunakan perangkat terkelola/native exam browser atau platform ujian khusus.
