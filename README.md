# HRIS (Google Apps Script Web App)

Aplikasi HRIS berbasis **Google Apps Script Web App** dengan database di **Google Sheets**.

## Fitur

## 1) Authentication & Role

- Admin membuat akun `username/password` untuk setiap user.
- User harus login menggunakan:
  - akun Google Workspace (email kantor), dan
  - `username/password` yang dibuat admin.
- Role:
  - `ADMIN`
  - `EMPLOYEE`

## 2) Attendance (Clock In / Clock Out)

- 1 pasang clock-in/clock-out per hari.
- Geofence **multi lokasi** (radius default 100m, bisa override per lokasi).
- Validasi akurasi GPS: absensi ditolak bila `accuracy_m` lebih buruk dari setting (`min_gps_accuracy_m`).
- Deteksi indikasi fake GPS (flagging):
  - di luar radius geofence
  - speed sanity check (lonjakan perpindahan), setting `max_speed_mps`
- Status otomatis berdasarkan Work Schedule:
  - `OK`
  - `LATE`
  - `EARLY_OUT`
  - `LATE_EARLY_OUT`

## 3) Admin Panel

- Settings utama (toleransi telat, geofence radius, min GPS accuracy, fake GPS threshold, dll)
- Kelola Work Schedule (Mon–Sun)
- Kelola Locations
- Kelola Users
- Review suspicious attendance (Approve/Reject)

## 4) Selfie Attendance (opsional)

- Employee bisa ambil selfie dari kamera HP.
- Selfie di-upload ke Google Drive dan file id disimpan di sheet Attendance.
- Bisa di-set wajib/tidak lewat setting `require_selfie`.

## 5) Asset Management

- Master asset + QR (tampil sebagai gambar untuk dicetak)
- Asset assignment:
  - 1 asset hanya boleh punya 1 assignment aktif
  - bisa Mark Returned

## 6) Payroll (PPh21 + BPJS + export)

- Gross: 
  - `basic_salary`
  - `fixed_allowance`
  - `transport_allowance`
  - `position_allowance`
  - `laptop_allowance`
  - lembur per hari: `overtime_days * overtime_rate_per_day`
- Potongan: absent day (bisa enable/disable)
- BPJS:
  - Kesehatan
  - TK (JHT/JP/JKK/JKM) termasuk plafon (ceiling)
- PPh21 Gross (berdasar PTKP)
- Export:
  - Payroll CSV per periode
  - Slip gaji PDF per karyawan per periode

## 7) Attendance Report

- Admin filter attendance per rentang tanggal
- Lihat selfie link + status suspicious
- Export CSV

---

# Struktur Sheet (Database)

Spreadsheet akan berisi minimal sheet berikut:

- `Settings`
- `WorkSchedule`
- `Locations`
- `Employees`
- `Users`
- `Attendance`
- `AuditLog`
- `PayrollPeriods`
- `Payroll`
- `Overtime`
- `Assets`
- `AssetAssignments`

---

# Setup (Google Sheets)

## 1) Buat Spreadsheet

1. Buat Google Spreadsheet baru.
2. Copy **Spreadsheet ID** dari URL.

Contoh URL:

`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`

---

# Setup (Google Apps Script)

## 1) Buat project Apps Script

1. Buka `https://script.google.com/`.
2. Buat project baru.
3. Buat file-file sesuai workspace ini (copy-paste isi file):
   - `appsscript.json`
   - `Code.gs`
   - `Setup.gs`
   - `Db.gs`
   - `Settings.gs`
   - `Auth.gs`
   - `Attendance.gs`
   - `AdminApi.gs`
   - `Assets.gs`
   - `Overtime.gs`
   - `Payroll.gs`
   - `Drive.gs`
   - `Audit.gs`
   - `Ui_Common.html`
   - `Ui_Login.html`
   - `Ui_Employee.html`
   - `Ui_Admin.html`
   - `Ui_Payslip.html`

## 2) Inisialisasi database sheet

Jalankan function di Apps Script editor:

```js
setupInit("SPREADSHEET_ID_ANDA")
```

Ini akan:
- set `SPREADSHEET_ID` di Script Properties
- membuat semua sheet dan header
- menambahkan default settings
- membuat admin default untuk email Anda:
  - username: `admin`
  - password: `admin123`

> Jika Spreadsheet Anda sudah ada sebelumnya, Anda mungkin perlu menambahkan kolom baru manual di sheet `Employees` dan membuat sheet `Overtime` (lihat bagian Troubleshooting).

---

# Deploy Web App

1. Klik **Deploy** -> **New deployment** -> pilih **Web app**
2. **Execute as**: `User accessing the web app`
3. **Who has access**:
   - disarankan: domain kantor (Google Workspace) / restricted sesuai kebutuhan
4. Klik Deploy dan authorize.

URL Web App bisa diakses dengan parameter:

- `...?page=login`
- `...?page=employee`
- `...?page=admin`

---

# Cara Pakai

## Employee

1. Buka `?page=login`
2. Login (Google Workspace + username/password)
3. (Opsional) `Take Selfie`
4. `Clock In`
5. `Clock Out`

## Admin

1. Buka `?page=admin`
2. Atur:
   - `Settings`
   - `Work Schedule`
   - `Locations`
   - `Users`
   - `Employees`
3. Review suspicious attendance
4. Payroll:
   - set periode
   - input lembur
   - compute
   - export CSV
   - generate slip PDF

---

# Konfigurasi Penting

## Settings (contoh)

- `late_tolerance_minutes`
- `early_out_tolerance_minutes`
- `min_gps_accuracy_m`
- `default_radius_m`
- `max_speed_mps`
- `require_selfie` (`Y`/`N`)
- `selfie_folder_id` (optional)
- `payroll_folder_id` (optional)
- `enable_absent_deduction` (`Y`/`N`)
- `deduction_per_absent_day`
- `overtime_rate_per_day`

---

# Troubleshooting

## 1) Email Google tidak terbaca

Sistem mengandalkan `Session.getActiveUser().getEmail()`.
Pastikan:
- deploy untuk domain Workspace kantor
- user akses menggunakan akun Google Workspace

## 2) Sheet sudah terlanjur ada, header belum update

Jika `Employees` belum punya kolom berikut, tambahkan manual:
- `fixed_allowance`
- `transport_allowance`
- `position_allowance`
- `laptop_allowance`

Jika belum ada sheet `Overtime`, buat manual dengan header:
- `period_id`, `employee_id`, `overtime_days`, `updated_at`

## 3) Kamera tidak bisa dibuka

- Pastikan buka dari browser yang mengizinkan camera (Chrome/Safari)
- Pastikan permission camera diaktifkan

## 4) Tidak bisa upload ke Drive

- Pastikan Anda sudah authorize Apps Script untuk akses Drive.

---

# Catatan Keamanan

- Password disimpan sebagai hash + salt (SHA-256) di sheet `Users`.
- Token session disimpan di `CacheService` (default 8 jam).
- Semua aksi penting dicatat di `AuditLog`.
