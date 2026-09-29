# Timeline View

Timeline View menampilkan rentang tanggal note Obsidian Bases dalam garis waktu horizontal yang
interaktif. View ini memakai properti yang Anda pilih sendiri dan tidak mengharuskan `status`,
`priority`, atau schema task tertentu.

## Cara menggunakan

1. Buka folder sebagai Obsidian Base.
2. Pilih tipe view **Timeline**.
3. Buka pengaturan view dan pilih **Start date**.
4. Opsional: pilih **End date**, **Title**, dan **Color by**. Gunakan kontrol grouping
   bawaan Bases bila ingin membagi Timeline menjadi section.
5. Pilih zoom Day, Week, Two weeks, Month, Quarter, Year, atau Five years.

Contoh frontmatter berikut hanya contoh; nama propertinya bebas:

```yaml
---
project_start: 2026-03-01
project_end: 2026-03-31
caption: Website redesign
team: Web
category: Research
---
```

Konfigurasikan `project_start` sebagai **Start date**, `project_end` sebagai **End date**, dan
properti lain sesuai kebutuhan. Nilai tanggal harus berbentuk ISO `YYYY-MM-DD` atau datetime ISO.
Timeline sengaja tidak menebak tanggal lokal seperti `tomorrow` atau `31/03/2026`.

## Pemetaan properti

| Opsi | Fungsi |
| --- | --- |
| **Start date** | Tanggal mulai. Note tanpa nilai valid masuk bagian Unscheduled. |
| **End date** | Tanggal selesai inklusif. Kosong berarti rentang satu unit dari tanggal mulai. |
| **Title** | Label bar. Kosong atau tidak tersedia memakai nama file. |
| **Color by** | Nilai kategori yang dipetakan melalui color resolver bersama. |
| **Zoom** | Tujuh skala dari Day sampai Five years. |

Grouping, urutan group, dan urutan note mengikuti konfigurasi native Bases. Timeline tidak
menyimpan opsi grouping tersendiri.

Nilai akhir `ongoing` didukung dan diselesaikan terhadap tanggal hari ini untuk visualisasi.
Rentang terbalik dinormalisasi untuk tampilan tanpa menulis perubahan ke note.

## Interaksi

- Klik atau tekan Enter/Space pada judul atau bar untuk membuka note.
- Modifier Obsidian pada klik tetap menentukan tab, split, atau window tujuan.
- Hover mengikuti Page Preview Obsidian.
- Klik kanan membuka menu lokasi file bersama Unimian.
- Klik heading group untuk collapse atau expand.
- Tombol **Today** membawa posisi horizontal ke hari ini.
- `Ctrl/Cmd+wheel` atau pinch dua jari mengganti zoom dengan tanggal di bawah pointer tetap terjangkar.
- Hover pada row Unscheduled menampilkan ghost bar beserta rentang tanggal; klik ghost untuk menulis properti start/end yang dikonfigurasi.
- Drag bar untuk menggeser seluruh rentang; drag handle kiri/kanan untuk mengubah start atau end.
- Pilihan zoom dan posisi scroll dipertahankan saat data Base diperbarui.

Timeline tidak menyediakan status/priority workflow, recurrence, dependency editing, atau perubahan
group. Write Timeline dibatasi pada quick scheduling serta drag/resize start/end yang dipilih
pengguna, melalui mutation gateway Unimian.

## Unscheduled dan data tidak valid

Jika start date belum dikonfigurasi, view menampilkan panduan konfigurasi. Note ditampilkan di
section **Unscheduled** bila start date kosong/tidak valid, atau bila end date yang terisi tidak valid. Ini mempertahankan visibilitas data bermasalah
tanpa menebak atau membuang note secara diam-diam.

## Responsif dan kumpulan besar

Sidebar dan permukaan timeline memakai identitas serta urutan row virtual yang sama. Hanya row di
sekitar viewport yang dipasang ke DOM. Tes integrasi mencakup 5.000 note; penerimaan visual native
desktop/mobile/popout tetap dicatat terpisah dalam acceptance matrix proyek.

Pada panel sempit, sidebar dan chart mengecil tanpa mengganti urutan atau anchor scroll. Animasi
hover dinonaktifkan saat sistem meminta reduced motion.

## Perbedaan dari referensi upstream

Bagian kontrol, header/grid temporal, today indicator, scroll anchoring, dan styling terkait
diadaptasi secara selektif dari
[obsidian-project-manager](https://github.com/mmattia09/obsidian-project-manager) pada commit
`2c6ee7ca2ab881f5557df5a042a377b0139b8608` (MIT), dengan notice dipertahankan pada file yang
diadaptasi dan di `THIRD_PARTY_NOTICES.md`.

Unimian mengadopsi perilaku Timeline upstream secara penuh untuk navigasi temporal dan penempatan
item yang belum terjadwal, tetapi tetap memisahkan workflow task yang tidak agnostik:

- tidak memiliki status atau urutan priority bawaan;
- melakukan quick scheduling dan bar drag/resize hanya ke properti start/end yang dikonfigurasi;
- tidak menulis group, status, priority, recurrence, atau dependency;
- memakai Temporal Core, navigation service, dan virtualization platform Unimian;
- memisahkan model murni, renderer DOM, dan adapter Obsidian Bases.

## Batas verifikasi

Tes otomatis membuktikan mapping, geometry, interaksi, cleanup, sinkronisasi state, registrasi, dan
batas mounted DOM. Tes tersebut bukan pengganti native visual acceptance di Obsidian desktop,
mobile, atau popout window.
