# Plan: License Compliance & Dependency Hygiene

<!-- This plan quotes SPDX tags as examples; the markers keep the REUSE linter from reading them as this file’s license. -->
<!-- REUSE-IgnoreStart -->

- **Branch:** `chore/license-compliance`
- **Dibuat:** 2026-09-18
- **Sumber:** audit dependency & atribusi (sesi Claude Code, 2026-09-18)
- **Target rilis:** 1.0.4

## Tujuan

1. Setiap file yang didistribusikan (`main.js`, `styles.css`, zip rilis) membawa notice lisensi
   dan hak cipta yang benar untuk semua kode pihak ketiga yang dibundel.
2. Pemberitahuan hak cipta upstream akurat dan konsisten di LICENSE, README, `package.json`.
3. File sumber yang diturunkan dari upstream punya header SPDX + atribusi yang dapat ditelusuri.
4. Tidak ada kerentanan high/moderate di devDependencies; build reproducible.

## Non-goals

- Tidak mengubah perilaku plugin (tidak ada perubahan fungsional di views).
- Tidak menulis ulang kode untuk menghindari lisensi upstream.
- Tidak mengadopsi tooling REUSE penuh (`.reuse/dep5`, folder `LICENSES/`) — bisa menyusul.

## Keputusan

| # | Keputusan | Hasil |
| --- | --- | --- |
| D1 | Lisensi keseluruhan proyek | **`GPL-3.0-only`** (diubah pemilik, 2026-09-18; semula `GPL-3.0-or-later`). Planner hanya menyatakan "GPL v3" tanpa klausul "or any later version" (GPL v3 §14), jadi klaim "or later" tidak berlaku untuk kode turunan Planner. Bisa kembali ke "or later" bila Sawyer Rensel memberi izin tertulis. |
| D2 | Blok CSS Frappe di `styles.css` | **Pertahankan + beri notice lisensi.** |

## Bukti provenance (hasil perbandingan baris dengan upstream)

Metode: persentase baris non-trivial (>12 karakter, bukan import/kurung) di file Wise View yang
identik dengan baris di upstream. Upstream: `SawyerRensel/Planner@main`, `lhassa8/obsidian-bases-gantt@main`.
Tidak ada file upstream yang memiliki header hak cipta sendiri.

| File Wise View | Kemiripan | Upstream | Kategori header |
| --- | --- | --- | --- |
| `src/types/frappe-gantt.d.ts` | 99% | lg `src/frappe-gantt.d.ts` | Derived (MIT) |
| `src/types/html.d.ts` | 100% | Planner `src/types/html.d.ts` | Derived (GPL) |
| `src/types/index.ts` | 100% | Planner `src/types/index.ts` | Derived (GPL) |
| `src/types/item.ts` | 100% | Planner `src/types/item.ts` | Derived (GPL) |
| `src/utils/dateUtils.ts` | 100% | Planner `src/utils/dateUtils.ts` | Derived (GPL) |
| `src/services/PropertyTypeService.ts` | 88% | Planner `src/services/PropertyTypeService.ts` | Derived (GPL) |
| `src/views/BasesKanbanView.ts` | 78% | Planner `src/views/BasesKanbanView.ts` | Derived (GPL) |
| `src/utils/colorUtils.ts` | 64% | Planner views (Calendar/Kanban) | Derived (GPL) |
| `src/views/BasesCalendarView.ts` | 56% | Planner `src/views/BasesCalendarView.ts` | Derived (GPL) |
| `src/settings/SettingsTab.ts` | 49% | Planner `src/settings/SettingsTab.ts` | Portions (GPL) |
| `src/utils/ganttUtils.ts` | 43% (+6%) | lg `src/task-mapper.ts`, `src/date-utils.ts` | Portions (MIT) |
| `src/main.ts` | 28% / 11% | Planner `src/main.ts` / lg `src/main.ts` | Portions (GPL + MIT) |
| `src/views/BasesGanttView.ts` | 28% | lg `src/gantt-view.ts` | Portions (MIT) |
| `styles.css` | 43% / 15% | Planner `styles.css` / lg `gantt-overrides.css` + Frappe CSS | Portions (GPL + MIT) |
| `src/types/settings.ts` | 7% | Planner `src/types/settings.ts` (nama & bentuk `PlannerSettings`) | Portions (GPL) |
| `src/services/NoteTemplateService.ts` | 3% | — | Original |
| `src/utils/openFile.ts` | 6% | — | Original |

## Komponen pihak ketiga yang ikut terdistribusi

| Komponen | Versi | Lisensi | Copyright line (verifikasi di Task 1) | Terbundel di |
| --- | --- | --- | --- | --- |
| Planner | main | GPL-3.0 | Copyright (C) 2025 Sawyer Rensel | `main.js`, `styles.css` |
| obsidian-bases-gantt | main | MIT | Copyright (c) 2026 Lars Tray | `main.js`, `styles.css` |
| FullCalendar (`fullcalendar`, `@full-ui/headless-calendar`, `temporal-polyfill`, `temporal-utils`) | 7.1.0 / 7.1.0 / 1.0.5 / 1.0.3 | MIT | Copyright (c) 2026 Adam Shaw | `main.js`, `styles.css` |
| Preact (dep. FullCalendar) | 10.29.8 | MIT | Copyright (c) 2015-present Jason Miller | `main.js` |
| Frappe Gantt | 1.2.2 | MIT | Copyright (c) 2024 Frappe Technologies Pvt. Ltd. | `main.js`, `styles.css` |

Tabel ini diperbarui setelah migrasi FullCalendar 7 (lihat Status). `tslib` dihapus: esbuild tidak
pernah membundelnya. Sumber kebenaran sekarang `THIRD_PARTY_NOTICES.md`; build produksi gagal bila
paket terbundel tidak tercantum di sana.

## Status (2026-09-18)

| Task | Status |
| --- | --- |
| 1 — `THIRD_PARTY_NOTICES.md` + koreksi LICENSE | Selesai |
| 2 — Konsistensi metadata lisensi | Selesai |
| 3 — CSS Frappe yang dibundel | Selesai (dibuat ulang tiap build, diberi notice) |
| 4 — Notice lisensi di artefak build | Selesai, ditambah cek otomatis paket terbundel |
| 5 — Dokumen lisensi di rilis | Selesai |
| 6 — Header SPDX | Selesai |
| 7 — Update devDependencies | Selesai, diperluas: toolchain terbaru, Node 24 LTS, pnpm 12, FullCalendar 7 |
| 8 — Kebersihan repo | Selesai |
| 9 — Changelog & versi 1.0.4 | **Ditunda** atas permintaan pemilik sampai perbaikan selesai |

Tambahan di luar rencana awal: fixture dan tes Vitest (Calendar view, plugin css-merge, runner),
CI di setiap branch + Windows + ambang coverage.

Masih terbuka (butuh tindakan pemilik):

- (Opsional) Izin tertulis dari Sawyer Rensel bila ingin kembali ke GPL-3.0-or-later (D1).
- Uji manual di Obsidian, terutama Calendar view setelah FullCalendar 7.
- Push branch, buka PR, dan jadikan check CI wajib di branch protection `main`.
- Rilis 1.0.4 (Task 9): `pnpm version patch --tag-version-prefix=""`.
- Tes Kanban & Gantt view (coverage keseluruhan masih ~12%).

---

## Tasks

Urutan disusun agar setiap task = satu commit atomik yang lolos `pnpm run check`.

### Task 1 — `THIRD_PARTY_NOTICES.md` + koreksi LICENSE

**Perubahan:**

- Buat `THIRD_PARTY_NOTICES.md` berisi, per komponen di tabel atas: nama, URL, versi, SPDX,
  copyright line persis dari LICENSE upstream, dan teks lisensi lengkap (MIT/0BSD).
- Ambil copyright line langsung dari file LICENSE di tarball npm (`pnpm install` lalu baca
  `node_modules/<pkg>/LICENSE*`), bukan dari ingatan/README.
- `LICENSE`: ganti `Copyright (C) 2026  lhassa8` → `Copyright (c) 2026 Lars Tray` (verbatim upstream).
- `LICENSE`: terapkan keputusan D1 pada paragraf pembuka (hapus klausul "or any later version" bila `GPL-3.0-only`).

**Acceptance:**

- Setiap copyright line di `THIRD_PARTY_NOTICES.md` cocok verbatim dengan LICENSE upstream.
- LICENSE tidak lagi memuat `lhassa8` sebagai pemegang hak cipta.

### Task 2 — Konsistensi metadata lisensi

**Perubahan:**

- `package.json` `license` → sesuai D1 (`GPL-3.0-only` atau tetap `GPL-3.0-or-later`).
- `README.md` bagian License: sesuaikan blok teks dengan D1.
- `README.md` "Dependency licenses": tambah kolom pemegang hak cipta; tambah Preact & tslib;
  tautkan ke `THIRD_PARTY_NOTICES.md`.
- `README.md` "Gantt code attribution": sebut nama "Lars Tray (lhassa8)".

**Acceptance:**

- `grep -rn "or-later\|any later version"` hanya muncul bila D1 = or-later.
- `pnpm run lint:obsidian` (memeriksa LICENSE & manifest) lolos.

### Task 3 — Investigasi & rapikan CSS Frappe yang dibundel

**Perubahan:**

- Pastikan apakah Gantt masih butuh blok `/* === BUNDLED CSS IMPORTS === */` (tidak ada lagi
  `import '*.css'` di `src/`). Periksa perilaku `cssPlugin` di `esbuild.config.mjs` saat tidak ada
  CSS yang diimpor — apakah blok lama dipertahankan atau terhapus pada build berikutnya.
- Terapkan keputusan D2:
  - **Pertahankan:** pindahkan ke section 6 "VENDOR OVERRIDES" dengan komentar
    `/*! Frappe Gantt v1.2.2 | MIT | (c) 2024 Frappe Technologies Pvt. Ltd. — modified */`.
  - **Impor ulang:** `import 'frappe-gantt/dist/frappe-gantt.css'` di `BasesGanttView.ts` dan
    biarkan `cssPlugin` menulis ulang blok dengan notice otomatis (lihat Task 4).

**Acceptance:**

- Gantt view tampil identik sebelum/sesudah (cek manual di vault uji: bar, header, popup, dark mode).
- Blok CSS Frappe di `styles.css` diawali notice lisensi.

### Task 4 — Notice lisensi di artefak build

**Perubahan:**

- `esbuild.config.mjs`: ganti banner JS dengan banner legal (`/*! ... */` agar tahan minify):

  ```js
  /*! Wise View v<version> | SPDX-License-Identifier: GPL-3.0-or-later
   *  Copyright (C) 2025 Sawyer Rensel; (C) 2026 Parkis Utama
   *  Bundles: FullCalendar (MIT, Adam Shaw), Preact (MIT, Jason Miller),
   *  Frappe Gantt (MIT, Frappe Technologies), obsidian-bases-gantt (MIT, Lars Tray),
   *  tslib (0BSD, Microsoft). Full texts: <repo>/blob/main/THIRD_PARTY_NOTICES.md */
  ```

  Versi dibaca dari `manifest.json` agar tidak basi.
- Tambahkan `banner.css` (atau header statis di baris 1 `styles.css`) dengan notice setara.
- `cssPlugin`: ketika menggabungkan CSS impor, sisipkan baris `/*! <pkg> | <license> */` per file.
- `scripts/verify-build-artifacts.mjs`: gagal bila `main.js` / `styles.css` tidak diawali notice
  yang memuat `SPDX-License-Identifier` dan nama setiap komponen terbundel.

**Acceptance:**

- `pnpm run build` → baris pertama `main.js` (minified) memuat notice lengkap.
- `pnpm run verify:artifacts` gagal jika banner dihapus (uji negatif manual sekali).

### Task 5 — Sertakan dokumen lisensi di rilis

**Perubahan:**

- `.github/workflows/release.yml`: tambahkan `LICENSE` dan `THIRD_PARTY_NOTICES.md` ke
  `wise-view.zip` dan ke daftar aset release.
- `main.js`, `manifest.json`, `styles.css` tetap diunggah terpisah (kebutuhan Obsidian community plugins).

**Acceptance:**

- Dry-run: jalankan perintah `zip` lokal, `unzip -l` menampilkan 5 file.

### Task 6 — Header SPDX & atribusi di file sumber

**Perubahan** — berdasarkan kolom "Kategori header" pada tabel provenance:

- **Derived (GPL)** / **Portions (GPL)**:

  ```ts
  // SPDX-License-Identifier: GPL-3.0-or-later
  // Derived from Planner (https://github.com/SawyerRensel/Planner) — <path upstream>
  // Copyright (C) 2025 Sawyer Rensel
  // Modifications Copyright (C) 2026 Parkis Utama
  ```

  Untuk "Portions" gunakan "Portions adapted from".
- **Derived (MIT)** / **Portions (MIT)**:

  ```ts
  // SPDX-License-Identifier: GPL-3.0-or-later
  // Portions adapted from obsidian-bases-gantt (https://github.com/lhassa8/obsidian-bases-gantt)
  // Copyright (c) 2026 Lars Tray — MIT License, see THIRD_PARTY_NOTICES.md
  // Modifications Copyright (C) 2026 Parkis Utama
  ```

- **Original**: hanya `// SPDX-License-Identifier: GPL-3.0-or-later` + `// Copyright (C) 2026 Parkis Utama`.
- `styles.css`: header komentar di baris 1 (gabung dengan banner Task 4).
- Pastikan header tidak bentrok dengan blok JSDoc yang sudah ada (`BasesGanttView.ts`,
  `ganttUtils.ts`, `frappe-gantt.d.ts`) — letakkan di atasnya.

**Acceptance:**

- `grep -L "SPDX-License-Identifier" src -r` kosong.
- `pnpm run lint` & `lint:obsidian` lolos (Biome tidak mengeluh soal komentar header).

### Task 7 — Update devDependencies yang rentan

**Perubahan:**

- `vitest` → `>=4.1.11` (menutup vitest, @vitest/mocker, vite, postcss, nanoid).
- `esbuild` → `>=0.28.1`.
- `pnpm update` untuk eslint & plugin; bila `brace-expansion`, `js-yaml`, `fast-uri` masih rentan,
  tambahkan `pnpm.overrides` dengan versi patched minimum.
- Pin `obsidian` dari `latest` ke versi eksplisit yang saat ini terpasang di lockfile.

**Acceptance:**

- `pnpm audit` → 0 high, 0 moderate (low boleh bila tidak ada patch).
- `pnpm audit --prod` tetap 0.
- `pnpm run check:ci` lolos.

### Task 8 — Kebersihan repo

**Perubahan:**

- `git rm --cached lint-output.json .claude/settings.local.json` (sudah ada di `.gitignore`;
  `lint-output.json` memuat path lokal `C:\GitHub\...`).

**Acceptance:**

- `git ls-files | grep -E "lint-output|settings.local"` kosong.

### Task 9 — Changelog & versi

**Perubahan:**

- Catat perubahan di catatan rilis 1.0.4: koreksi atribusi, notice lisensi di artefak, D1, update devDeps.
- `pnpm version patch` (menjalankan `version-bump.mjs`).

---

## Verifikasi akhir

```bash
pnpm install --frozen-lockfile
pnpm run check:ci
pnpm audit
```

- Baca 10 baris pertama `main.js` dan `styles.css` hasil build produksi.
- Uji manual di vault: Calendar, Kanban, Gantt (light & dark).
- Review diff LICENSE dan `THIRD_PARTY_NOTICES.md` baris per baris terhadap sumber upstream.

## Risiko

| Risiko | Mitigasi |
| --- | --- |
| Update vitest/esbuild mayor memecah test/build | Task 7 terpisah dan terakhir sebelum rilis; revert commit bila perlu. |
| Blok CSS Frappe hilang saat build (Task 3) sehingga Gantt rusak | Investigasi dulu, uji visual sebelum commit. |
| Beralih ke `GPL-3.0-only` dianggap perubahan lisensi | Hanya mempersempit klaim agar sesuai upstream; catat di changelog. |
| Copyright line salah ketik | Salin dari file LICENSE upstream, bukan manual. |

## Commit plan

1. `docs: add license compliance plan`
2. `docs(legal): add third-party notices and fix upstream copyright line`
3. `docs(legal): align license metadata across README and package.json`
4. `fix(styles): annotate bundled Frappe Gantt CSS with license notice`
5. `build: emit license banner in main.js and styles.css`
6. `ci(release): ship LICENSE and third-party notices in release zip`
7. `chore: add SPDX headers and upstream attribution to source files`
8. `chore(deps): bump vitest and esbuild, patch vulnerable transitive deps`
9. `chore: untrack local lint output and Claude settings`
10. `chore: release 1.0.4`

<!-- REUSE-IgnoreEnd -->
