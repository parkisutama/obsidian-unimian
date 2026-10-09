# Gantt native acceptance

Catatan ini memisahkan bukti runtime Obsidian dari hasil tes otomatis.

## Read path — desktop

Tanggal uji: 2026-09-19

Penguji: maintainer

Tema: light dan dark

| Area | Hasil | Catatan |
| --- | --- | --- |
| Start dan End | Lulus | Date dan Date & time tampil sebagai rentang. |
| Parent (phase) | Lulus | Hierarchy property Parent tampil dan dapat di-collapse. |
| Group by Bases | Lulus | Group native menjadi fase tingkat atas bersama hierarchy Parent. |
| Progress | Lulus dengan catatan | Nilai terbaca dan tooltip menunjukkan persentase, tetapi fill kurang terlihat pada sebagian warna. |
| Color by | Lulus | Warna kategori diterapkan pada bar; kontras progress bergantung pada warna. |
| Ctrl/Cmd + wheel | Lulus; perbaikan tersedia | Picker sekarang terlihat, tersinkron, dan memakai nama resolusi Hours/Days/Weeks/Months/Quarters; perlu konfirmasi native build terbaru. |
| Today marker | Gagal; perbaikan tersedia | Marker UTC kini digeser ke wall-clock lokal sesuai offset runtime; perlu konfirmasi native build terbaru. |
| Tooltip | Perlu perbaikan | Tooltip library dan tooltip lain dapat bertumpuk saat hover. |
| Detail panel | Implementasi tersedia; perlu uji ulang terarah | Renderer Wise View menyediakan Start, End, Duration, Progress, dependency, dan properti Base. Temuan mixed precision pada End sudah diperbaiki dan perlu konfirmasi native. |
| Move/resize/dependency drawing | Belum diuji | View masih sengaja dipaksa read-only sampai GBETA-009–GBETA-011 selesai. |

## Follow-up yang diterima

- Toolbar harus menampilkan scale aktif dan picker harus ikut berubah setelah zoom dengan
  Ctrl/Cmd + wheel.
- Progress fill harus tetap terbaca pada warna kategori terang maupun gelap.
- Hover tidak boleh menampilkan dua tooltip yang saling menumpuk.
- Dependency harus memakai satu properti Depends on dan garis chart; pengguna tidak perlu
  menghafal atau menulis FS/SS/FF/SF.

## Write path

Tanggal uji: 2026-09-20

Build yang diuji: `eb907d9` (`008b09d` untuk core cascade)

Status preflight otomatis:

- `main.js`, `manifest.json`, dan `styles.css` berhasil dibangun dan diverifikasi.
- Gate repository lulus: 41 file tes / 417 tes, typecheck, Biome, dan ESLint.
- Bukti di bawah tetap harus berasal dari Obsidian desktop. Host Codex saat persiapan tidak
  menyediakan akses aplikasi native, sehingga hasil manual sengaja tidak diasumsikan.

### Fixture minimum

Gunakan tiga note biasa dan dua phase note. Nama properti boleh berbeda; petakan melalui
Configure view.

```yaml
# Phase A.md
start: 2026-10-01
end: 2026-10-06

# Phase B.md
start: 2026-10-07
end: 2026-10-12

# Task A.md
start: 2026-10-01
end: 2026-10-02
parent: "[[Phase A]]"
order: 10
progress: 25
depends_on: []

# Task B.md
start: 2026-10-04
end: 2026-10-05
parent: "[[Phase A]]"
order: 20
progress: 0
depends_on: []

# Task C.md
start: 2026-10-08
end: 2026-10-09
parent: "[[Phase B]]"
order: 10
progress: 0
depends_on: []
```

Konfigurasi awal: Start=`start`, End=`end`, Parent=`parent`, Order=`order`,
Progress=`progress`, Depends on=`depends_on`; Read only=off; seluruh izin editing=on;
When predecessor moves=`Do not shift automatically`; Write phase dates=off.

### Checklist §3.4

Catat `Lulus`, `Gagal`, atau `Terhalang` beserta nilai frontmatter aktual. Reload view setelah
setiap baris agar hasil sebelumnya tidak menyamarkan hasil berikutnya.

| Area | Langkah dan hasil yang diharapkan | Hasil | Catatan/bukti |
| --- | --- | --- | --- |
| Move | Geser Task A satu hari. Start dan End maju satu hari; durasi tetap. | Lulus dengan perbaikan UX lanjutan | Tambahan satu hari sudah hilang. Pada scale halus library sempat menampilkan boundary jam/UTC untuk properti Date; callback kini dikanonisasi kembali ke hari penuh dan tooltip Date tidak lagi menyebut UTC. |
| Resize | Tarik ujung kanan Task A satu hari. Hanya End bertambah satu hari. | Lulus dengan perbaikan UX lanjutan | Tambahan satu hari sudah hilang. Gesture Date kini dikanonisasi ke boundary hari penuh sebelum render/cascade. |
| Progress | Tarik progress Task A. `progress` menjadi integer yang terlihat pada chart. | Lulus | Nilai dapat dinaikkan dan diturunkan secara normal. |
| Summary drag | Geser bar Phase A. Task A dan B ikut bergeser; tanggal Phase A tidak ditulis karena Write phase dates=off. | Perlu uji ulang terarah | Task A dan B ikut bergeser dan tambahan satu hari sudah hilang. Temuan Hours: library dapat memberi phase batas sub-hari sementara sehingga validasi Date salah menolak batch. Phase kini di-roll-up ulang dari descendant setelah snapping; uji ulang satu phase pendek dan satu phase multi-hari. |
| Dependency create | Tarik dari endpoint akhir Task A ke endpoint awal Task B. Tepat satu `[[Task A]]` ditambahkan ke `depends_on` Task B dan satu garis tampil. | Lulus dengan regresi lanjutan | Link A→B berhasil dibuat. Setelah A digeser, link sempat hilang dari `depends_on` B; perbaikan kini membatasi perubahan dependency hanya pada gesture create/delete dan perlu uji ulang. |
| Dependency reject | Coba endpoint selain end-to-start. Gesture ditolak dan frontmatter tidak berubah. | Belum diuji | |
| Dependency delete | Pilih/hapus garis A→B. Hanya link Task A di `depends_on` Task B yang hilang. | Lulus | Link dapat dihapus. |
| Reparent | Pindahkan Task B dari Phase A ke Phase B. `parent` menjadi `[[Phase B]]`. Drop ke group sintetis harus ditolak. | Belum diuji | |
| Reorder | Tukar urutan Task A/B dalam phase. `order` sibling menjadi 10, 20; tanpa property Order gesture harus ditolak. | Lulus | Tanpa konfigurasi Order muncul Notice. Nilai 10, 20 memang sengaja diberi jarak agar penyisipan berikutnya dapat memakai nilai di antaranya tanpa selalu menomori ulang semua sibling. |
| Create | Gambar range di area create. Note baru dibuat melalui template dengan Start/End terisi; Parent memang belum diisi karena draft library tidak membawa row target. | Lulus dengan catatan | Gambar di area kosong terbawah membuat note `New note 2026-09-16`; penamaan/template khusus belum dikonfigurasi. |
| Detail edit | Ubah tanggal/progress/durasi dari panel detail. Jalur write sama seperti move/progress. | Perlu uji ulang terarah | Edit dasar lulus. Temuan baru: Start Date & time dengan End Date-only sempat membuat hasil Duration kehilangan jam saat ditulis. End kini dipromosikan ke Date & time ketika End atau Duration diedit; perlu konfirmasi bahwa jam tetap ada setelah panel dibuka ulang. |
| Echo state | Setelah write sukses, horizontal scroll, phase collapse, selection, dan detail panel tetap pada state sebelumnya. | Perlu uji ulang terarah | Cara uji belum jelas bagi penguji; gunakan langkah singkat di bawah tabel. |
| Failure revert | Dengan target property formula/tidak writable, write menampilkan Notice dan chart kembali ke nilai sebelumnya. | Dicakup tes otomatis | Tidak dipaksakan pada vault acceptance karena membutuhkan kegagalan write yang disengaja. Uji unit memverifikasi kegagalan hasil maupun exception mengembalikan baseline dan menampilkan Notice. |

Uji Echo state: scroll horizontal menjauh dari posisi awal, collapse satu phase, pilih task dan
buka detailnya, lalu ubah progress task tersebut. Setelah save, posisi scroll, kondisi collapse,
task terpilih, dan panel detail harus tetap sama.

GBETA-014 kini menyediakan detail panel custom: Date ditampilkan sebagai rentang hari inklusif
(tanpa boundary jam tersembunyi), sedangkan Date & time mempertahankan jam lokal-floating.
Duration dapat diedit dan menghitung End melalui jalur mutation yang sama. Jika Start sudah Date &
time tetapi End masih Date-only, edit End/Duration mempromosikan End ke Date & time karena durasi
sub-hari tidak dapat disimpan secara utuh sebagai Date-only.

Catatan snapping build terbaru: Date selalu bergerak per hari. Date & time hanya mengubah jam
pada resolusi Hours; Days/Weeks/Months/Quarters mempertahankan jam dan durasi sambil membulatkan
pergeseran ke unit kalender picker sebelum cascade dijalankan. Preview pointer masih berasal dari
library, sedangkan nilai final terlihat setelah pointer dilepas.

### Checklist dependency schedule dan phase dates

| Mode | Langkah dan hasil yang diharapkan | Hasil | Catatan/bukti |
| --- | --- | --- | --- |
| None | Dengan A→B, geser A melewati awal B. B tidak bergeser; garis memperlihatkan konflik. | Lulus | Do not shift automatically mempertahankan tanggal successor. |
| Overlap | Pilih Shift only when dates overlap lalu geser A melewati awal B. B maju minimum sampai start B = end A dan durasi B tetap. | Gagal, perbaikan tersedia | Successor bergeser terlalu jauh ketika callback Date membawa jam internal. Input kini dikanonisasi ke boundary hari sebelum cascade; perlu uji ulang build terbaru. |
| Maintain gap | Pilih Shift and maintain time lalu geser A dua hari. B dan successor berikutnya maju dua hari; seluruh durasi tetap. | Belum diuji | |
| Phase dates off | Geser descendant. Bar phase roll-up berubah, tetapi frontmatter phase tidak berubah. | Belum diuji | |
| Phase dates on | Aktifkan Write phase dates dan geser descendant. Start/End phase ditulis sesuai roll-up. Ulangi pada phase Date & time untuk memastikan jam tidak hilang. | Belum diuji | |

### Persetujuan maintainer

- [x] Seluruh kegagalan/penyimpangan di atas sudah dicatat.
- [x] Maintainer menyetujui Gate 2 dan GBETA-012 dapat ditutup (2026-09-20: “saat ini sudah bisa lanjut”).

## Persetujuan akhir (GBETA-017)

Tanggal: 2026-09-20

Keputusan maintainer: uji native dinyatakan cukup untuk melanjutkan. Maintainer melaporkan sebagian
besar alur sudah dicek di desktop dan tidak menemukan ketidaknyamanan atau ketidaksesuaian. Hasil per
alur tidak dirinci satu per satu di sini.

Belum diverifikasi dan sengaja ditunda oleh maintainer (bukan lulus):

| Area | Status | Risiko |
| --- | --- | --- |
| Mobile (sentuhan, tahan 400 ms untuk menggeser, toolbar) | Belum diuji | Perilaku di layar sentuh tidak diketahui |
| Popout window | Belum diuji | Library memakai `document` global; drag mungkin tidak jalan (lihat spec §5) |
| Navigasi dan edit lewat keyboard | Belum diuji | Aksesibilitas keyboard tidak terbukti |
| Konsol (warning atau error) | Belum diperiksa | Ada peringatan yang tidak terlihat |
| Arsiran hari libur dan snap ke hari kerja | Belum dikonfirmasi | Opsi kalender kerja belum terbukti |
| Warna progress di kedua tema setelah perbaikan kontras | Belum dilihat | Kontras terburuk terhitung 2.62, belum dilihat langsung |

Tidak ada bug kehilangan atau kerusakan data yang diketahui terbuka. Dua bug penyimpanan yang ditemukan
(zona waktu pada Date & time, dan kurung wikilink yang terus bertambah) sudah diperbaiki dan punya
test regresi.

## Follow-up native (2026-09-21 s.d. 2026-09-23)

- **Toolbar dan header timeline tidak sticky saat scroll** — diperbaiki. Penyebabnya `height: 100%`
  di elemen root tidak pernah resolve ke nilai pasti pada pembungkus Bases milik Obsidian (leluhurnya
  auto-sized mengikuti isi), sehingga seluruh pane ikut membesar dan scroll, membawa toolbar dan
  header ikut naik-turun. `BasesGanttView.onload()` kini menyalin `clientHeight` leluhur scroll asli
  ke `style.height` lewat `ResizeObserver`, teknik yang sama dengan `BasesTimelineView`. Dikonfirmasi
  maintainer: sudah sticky (commit `29fdfab`, `8497792`).
- **Ctrl/Cmd + wheel zoom "tidak berfungsi"** — bukan bug. Toggle **Zoom with Ctrl/Cmd + wheel** di
  pengaturan view defaultnya mati; setelah dinyalakan, zoom bekerja normal. Dikonfirmasi maintainer
  2026-09-23.
- Performa dirasakan maintainer sedikit membaik dibanding sebelumnya (konsisten dengan perbaikan
  scan kuadratik di GBETA-016).

Ditutup sementara oleh maintainer 2026-09-23: cukup untuk saat ini, lanjut nanti kalau ada temuan baru.
