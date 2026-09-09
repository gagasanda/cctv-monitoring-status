# CCTV Monitor (Prototype)

Prototipe sederhana untuk:
- Mengunggah floor plan / denah dalam bentuk **PDF**
- Menandai lokasi setiap **CCTV** langsung di atas denah
- Mengecek status **online/offline** tiap kamera dengan **ping** ke alamat IP-nya
- Auto-refresh status setiap 10 detik

## Cara Menjalankan

1. Pastikan **Node.js** (versi 16+) sudah terpasang di komputer/server kamu.
2. Buka terminal di folder ini, lalu jalankan:

   ```bash
   npm install
   npm start
   ```

  Saat `npm install` berjalan, aplikasi akan mengecek FFmpeg. Pada server Debian/Ubuntu,
  FFmpeg akan dipasang otomatis menggunakan `apt-get` dan `sudo` bila diperlukan.
  Pada Windows, installer akan mencoba `winget`, lalu Chocolatey (`choco`).
  Pastikan user yang menjalankan instalasi memiliki izin memasang software.

  Jika FFmpeg dipasang melalui Windows, buka terminal baru setelah `npm install` agar
  perubahan PATH terbaca, lalu jalankan `npm start`.

3. Buka browser ke `http://localhost:3000`

## Cara Pakai

1. Di panel kiri, unggah file PDF denah/floor plan.
2. Setelah denah tampil, **klik pada titik di denah** tempat CCTV berada.
3. Isi nama kamera (mis. "Lobby Depan"), alamat IP-nya (mis. `192.168.1.50`), dan opsional URL live view/snapshot kamera (lihat bagian "Live View" di bawah).
4. Marker berbentuk ikon kamera akan muncul: **abu-abu** (belum dicek), **hijau** (online), **merah** (offline).
5. **Klik marker kamera** untuk membuka popup live view.
6. Klik tombol **"Cek Status Sekarang"** untuk memaksa pengecekan ulang, atau tunggu auto-refresh tiap 10 detik.
7. Klik kanan pada marker untuk menghapus kamera tersebut.

## Live View (Popup)

Saat kamu klik marker kamera, popup kecil muncul menampilkan gambar dari URL yang kamu isi saat menambah kamera:

- **Kamera dengan snapshot URL** (mis. `http://192.168.1.50/snapshot.jpg`) — popup akan menampilkan gambar terbaru dari URL tersebut, di-refresh tiap kali popup dibuka.
- **Kamera dengan MJPEG stream URL** (mis. `http://192.168.1.50/video`) — kalau kameramu mendukung MJPEG over HTTP, popup bisa menampilkannya sebagai video langsung (karena elemen `<img>` browser bisa merender stream MJPEG).
- **Kamera dengan RTSP URL** (mis. `rtsp://user:password@192.168.1.50:554/Streaming/Channels/101`) — aplikasi akan menjalankan FFmpeg di server dan mengubahnya menjadi HLS agar bisa diputar di browser.

Untuk mempercepat tampilan, stream H.264 dari kamera di-remux tanpa encoding ulang.
Jika model kamera hanya mengirim codec yang tidak didukung browser, konfigurasi FFmpeg
perlu diubah kembali ke transcoding H.264.
- **Kamera tanpa URL** — popup akan menampilkan pesan bahwa live view belum diset.

**Penting:** Browser modern **tidak bisa** memutar stream RTSP secara langsung (protokol paling umum dipakai CCTV/DVR). Kalau CCTV kamu hanya punya RTSP, kamu perlu:
- Pastikan FFmpeg sudah terpasang di server dan perintah `ffmpeg` tersedia di PATH. Jika lokasinya berbeda, jalankan server dengan `FFMPEG_PATH=/path/ke/ffmpeg npm start`.
- Masukkan URL RTSP kamera pada field URL live view/snapshot, lalu buka marker kamera.
- Untuk Honeywell, format URL RTSP berbeda menurut model. Gunakan URL RTSP dari konfigurasi atau manual perangkat.

## Catatan Penting

- **Ping butuh jaringan yang sama.** Server (yang menjalankan `node server.js`) harus bisa menjangkau IP kamera tersebut secara jaringan (satu LAN, VPN, dsb). Kalau server dijalankan di cloud tapi CCTV di jaringan lokal kamu, ping tidak akan berhasil kecuali ada VPN/tunnel.
- **Izin ping di Linux:** beberapa distro membatasi raw ping untuk user biasa. Kalau ping selalu gagal padahal IP benar, coba jalankan:
  ```bash
  sudo setcap cap_net_raw+ep $(which node)
  ```
  atau jalankan server dengan `sudo` (tidak disarankan untuk produksi).
- **Hanya halaman pertama PDF** yang dirender sebagai denah.
- Data kamera & floor plan disimpan lokal di `data/db.json` dan `uploads/` — bukan database sungguhan, cocok untuk prototipe/testing.
- **Belum ada autentikasi/login.** Untuk pemakaian nyata (apalagi kalau diakses dari luar jaringan lokal), tambahkan dulu login, HTTPS, dan pembatasan akses sebelum dipakai serius.
- Posisi marker disimpan sebagai koordinat relatif (0–1) terhadap ukuran denah, jadi tetap presisi walau ukuran layar browser berbeda.

## Struktur Proyek

```
cctv-monitor/
├── server.js          # Backend Express: upload floorplan, CRUD kamera, ping status
├── package.json
├── public/
│   └── index.html     # Frontend: render PDF + marker kamera
├── data/
│   └── db.json         # Penyimpanan data (auto-generated)
└── uploads/            # File PDF floor plan yang diunggah (auto-generated)
```

## Pengembangan Lanjutan (Ide)

- Ganti `child_process` ping dengan library seperti `net-ping` untuk kontrol timeout lebih presisi.
- Tambah dukungan multi-lantai/multi-denah (saat ini hanya 1 floor plan aktif).
- Tambah notifikasi (Telegram/email/webhook) saat kamera berubah status jadi offline.
- Tambah live stream/snapshot preview saat marker kamera diklik.
- Ganti penyimpanan JSON dengan database sungguhan (SQLite/PostgreSQL) untuk penggunaan jangka panjang.
