# Calendar View

Calendar View menampilkan item dari Obsidian Bases dalam kalender interaktif berbasis
[FullCalendar](https://fullcalendar.io/). View ini membaca properti frontmatter yang sudah ada di
note, lalu memetakannya menjadi event kalender tanpa memaksakan workflow task tertentu.

## Ringkasan fitur

- Menampilkan note berdasarkan properti tanggal dari Bases.
- Mendukung tampilan Year, Month, Week, 3-day, Day, dan List.
- Membuka note dari event kalender dengan sekali klik.
- Mengubah tanggal event lewat drag-and-drop atau resize, jika properti tanggal dapat ditulis.
- Membuat note/event baru dari slot waktu pada tampilan Week, 3-day, atau Day.
- Membuka atau membuat periodical notes (harian sampai tahunan) dari tanggal, minggu, bulan, kuartal,
  dan tahun di kalender.
- Mendukung hover preview Obsidian untuk event dan periodical notes yang sudah ada.
- Mewarnai event berdasarkan properti pilihan, Pretty Properties, atau konfigurasi `valueStyles`.
- Menyesuaikan awal minggu, ukuran teks, default view, dan tinggi baris Year view.

## Cara menggunakan

1. Buka folder sebagai Obsidian Base.
2. Ubah tipe view Bases menjadi **Calendar**.
3. Buka pengaturan view Calendar di Bases.
4. Pilih properti tanggal pada **Date start field**.
5. Opsional: pilih **Date end field**, **Title field**, **All-day field**, dan **Color by**.

Minimal, setiap note yang ingin muncul di kalender harus punya nilai pada properti yang dipilih
sebagai **Date start field**.

Contoh frontmatter:

```yaml
---
title: Website redesign
status: In progress
priority: High
date_start: 2026-03-01T09:00:00+07:00
date_end: 2026-03-01T11:00:00+07:00
---
```

Untuk event sepanjang hari, gunakan tanggal tanpa waktu:

```yaml
---
title: Launch day
date_start: 2026-03-15
date_end: 2026-03-16
---
```

## Pemetaan data

Calendar View menggunakan konfigurasi berikut dari view Bases:

| Opsi | Fungsi |
| --- | --- |
| **Date start field** | Properti tanggal mulai. Wajib agar note tampil sebagai event. |
| **Date end field** | Properti tanggal selesai. Opsional untuk event berdurasi atau multi-day. |
| **Title field** | Properti teks yang dipakai sebagai judul event. Kosong: nama file. |
| **All-day field** | Properti yang menandai event seharian (mis. checkbox). Kosong: event dianggap seharian bila tanggal mulai tidak punya jam. |
| **Color by** | Properti kategori yang menentukan warna event. |
| **Default view** | Tampilan awal saat Calendar dibuka. |
| **Week starts on** | Hari pertama dalam minggu. |
| **Font size** | Ukuran teks event dan label kalender. |
| **Year view row height** | Tinggi sel kalender untuk mode Year continuous dan split. |

Jika **Title field** kosong atau nilainya tidak tersedia, Calendar memakai nama file sebagai fallback.

## Mode tampilan

Toolbar Calendar menyediakan beberapa mode:

| Tombol | Tampilan |
| --- | --- |
| **Y** | Year view. Bisa ditukar antara split by month dan continuous scroll. |
| **M** | Month view. |
| **W** | Week view. |
| **3** | 3-day view. |
| **D** | Day view. |
| **L** | Weekly list view. |

Tombol refresh memuat ulang data kalender. Tombol today membawa kalender kembali ke tanggal hari ini.

## Interaksi event

- Klik event untuk membuka note di tab baru.
- Hover event untuk memicu Page Preview Obsidian, mengikuti pengaturan Page Preview pengguna.
- Klik kanan event untuk membuka menu lokasi file, seperti open in new tab, open to the right, open
  above, open below, open to the left, dan open in new window.
- Drag event untuk memindahkan tanggal mulai dan selesai.
- Resize event untuk mengubah durasi.

Perubahan drag dan resize ditulis kembali ke frontmatter melalui `app.fileManager.processFrontMatter`.
Calendar tidak menulis ke properti `file.*` atau `formula.*` karena properti tersebut tidak dapat
diedit langsung sebagai frontmatter.

## Membuat note dari kalender

Calendar dapat membuat note baru dari seleksi waktu pada tampilan Week, 3-day, dan Day.

Saat pengguna memilih slot waktu:

1. Calendar membuat frontmatter berdasarkan **Date start field** dan **Date end field**.
2. Jika event bukan all-day, tanggal ditulis sebagai ISO lokal dengan offset timezone.
3. Jika event all-day, tanggal ditulis sebagai `YYYY-MM-DD`.
4. Note dibuat lewat Bases, atau langsung ke folder target jika **Target folder** diisi.

Opsi **Note template**:

| Opsi | Fungsi |
| --- | --- |
| **Template note** | File markdown yang dipakai sebagai template isi note. |
| **Target folder** | Folder tujuan. Jika kosong, Calendar mengikuti perilaku pembuatan file dari Bases. |
| **Title format** | Format nama file note baru. Default: `Event {{date}} {{time}}`. |

Token template yang didukung:

| Token | Isi |
| --- | --- |
| `{{title}}` | Judul default dari event baru. |
| `{{date}}` | Tanggal mulai, format `YYYY-MM-DD`. |
| `{{time}}` | Waktu mulai, format `HH:mm`. |
| `{{start}}` | Tanggal mulai lengkap. |
| `{{end}}` | Tanggal selesai lengkap. |

Frontmatter dari template akan digabung dengan frontmatter event. Nilai tanggal dari event menang
jika ada kunci yang sama.

## Periodical notes

Satu file `.base` adalah satu journal: setiap Base mengatur periodical notes-nya sendiri, tanpa
plugin lain. Pengaturannya ada di grup **Daily notes**, **Weekly notes**, **Monthly notes**,
**Quarterly notes**, dan **Yearly notes**. Tiap grup punya dua opsi:

- **Path pattern**: pola folder dan nama file, dipisah `/`, memakai token gaya moment. Placeholder
  menampilkan contoh sesuai periode, misalnya `timeline/YYYY/YYYY-MM/YYYY-MM-DD`. Tambahkan root
  vault sendiri bila perlu, seperti `persona/Karyawan IAT/timeline/YYYY/YYYY-MM/YYYY-MM-DD`.
  Periode tanpa pola dianggap tidak dikonfigurasi dan tidak mendapat link.
- **Template note**: template yang dipakai saat note dibuat.

Token yang didukung: `YYYY YY MMMM MMM MM M DD D dddd ddd Q`, minggu ISO 8601 `GGGG WW W`, minggu
menurut locale `gggg ww w`, dan teks literal dalam `[...]`. Contoh preset ISO (root diisi sendiri):

| Periode | Pola |
|---|---|
| Daily | `timeline/YYYY/YYYY-MM/YYYY-MM-DD` |
| Weekly | `timeline/GGGG/GGGG-[W]WW` |
| Monthly | `timeline/YYYY/YYYY-MM` |
| Quarterly | `timeline/YYYY/YYYY-[Q]Q` |
| Yearly | `timeline/YYYY` |

Penomoran minggu memakai ISO 8601 (Senin, minggu 1 memuat 4 Januari) kecuali opsi **Week numbering**
pada Weekly notes diubah agar mengikuti "Week starts on".

Yang muncul di kalender untuk periode yang dikonfigurasi:

- Angka tanggal membuka atau membuat note harian; angka minggu di Month view membuka note mingguan.
- Judul toolbar menampilkan bulan, tahun, dan kuartal (`September 2026 (Q3)`) sebagai link
  bergaris bawah. Week dan 3-day menampilkan `W39 · September 2026 (Q3)`; Day menambahkan link hari.
- Titik kecil menandai periode yang note-nya sudah ada, dan hover preview aktif.
- Note periodical tidak digambar sebagai event.

Note yang belum ada dibuat lewat Templater (atau core Templates) dengan nama dari tanggal yang
diklik, termasuk tanggal masa depan. Tanpa keduanya, template disalin apa adanya dan Anda diberi
notifikasi. Template sebaiknya membaca tanggal dari nama file (misalnya `tp.file.title`) dan tidak
memindahkan note; jika template memindahkannya, Calendar membuka note yang dipindahkan tetapi tidak
akan menandainya di lokasi baru.

Event lintas hari tetap satu note, disimpan di folder hari mulai (kecuali **Target folder** pada
Note template diisi).

## Pewarnaan event

Calendar memilih warna event dengan urutan berikut:

1. Jika **Color by** mengarah ke properti `color`, nilai hex dari note dipakai langsung.
2. Jika Pretty Properties aktif dan punya warna untuk nilai properti tersebut, warna itu dipakai.
3. Jika ada konfigurasi `valueStyles` untuk field dan nilai tersebut, warna itu dipakai.
4. Jika tidak ada konfigurasi khusus, Calendar membuat warna stabil dari nilai teks.
5. Jika **Color by** kosong atau `none`, Calendar memakai warna fallback abu-abu.

Teks event otomatis memakai hitam atau putih berdasarkan kontras warna background.

## Pengaturan default plugin

Default global Calendar tersedia di pengaturan Unimian:

- **Week starts on**
- **Font size**

Default lain, seperti field tanggal, warna, dan default view, disimpan di `data.json` plugin dan
dipakai sebagai fallback saat opsi tersebut belum diatur pada file `.base`.

## Batasan

- Calendar hanya menampilkan item yang punya **Date start field**.
- Pembuatan note dari seleksi tanggal hanya aktif di Week, 3-day, dan Day view.
- Drag dan resize tidak berlaku untuk properti `file.*` atau `formula.*`.
- Calendar tidak menghitung dependency, recurrence, hierarchy, atau status otomatis.
- Calendar tidak memaksakan schema frontmatter tertentu.
