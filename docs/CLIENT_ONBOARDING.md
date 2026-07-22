# Client Onboarding — Genia

Panduan onboarding client baru, struktur department + manager, dan senario billing khas (contoh: department bayar terus ke GenCode).

---

## 1. Konsep asas

**Hierarki peranan** (tinggi → rendah): `developer` > `admin` (org) > `manager` (department) > `user`.

**Hierarki organisasi:** `organization` → `entity` (optional) → `department`.

- **Developer** = GenCode. Cipta organization + admin melalui Gateway, pilih server, assign package.
- **Admin org** = wakil client. Cipta department + manager + user; urus semua bawah dia.
- **Manager dept** = ketua department. Cipta + urus user dalam department dia sahaja.
- **User** = pengguna akhir chatbot.

Gateway = control plane (registry + router), tidak simpan data client. Data sebenar (org, user, chat, file) duduk dalam **tenant server**.

---

## 2. Flow client baru (standard)

### Langkah 1 — Developer cipta tenant (di Gateway)
1. Login Gateway (`https://genia.gencode.com.my` → developer).
2. **Tenants → Create Tenant**.
3. Isi borang:
   - Organization Name (contoh: `Hong Leong Yamaha`)
   - Admin Full Name / Email / Password
   - **Package** (pilih template quota/storage, atau "No package")
   - **Server** — `Auto — first available server` atau pilih server spesifik
   - Public access (optional — untuk embed widget luar)
4. Submit. Gateway:
   - Pilih server tenant (auto/manual), pastikan belum penuh.
   - Panggil tenant server → cipta **1 organization + 1 admin** (admin `mustChangePassword = true`).
   - Simpan pointer dalam registry `tenants`.
5. Hantar **email + password** admin kepada client.

### Langkah 2 — Admin login & bina struktur (di app tenant)
1. Admin login guna creds developer bagi → **wajib tukar password** kali pertama.
2. **Organizations → Add Department** (satu borang):
   - Nama department (contoh: `Sales`)
   - Manager: Nama / Email / Password
   - Submit → department + manager tercipta serentak.
3. (Optional) Butang **Add Manager** pada baris department untuk tambah manager lain ke department sedia ada.
4. Admin juga boleh cipta **user terus untuk org** (Users page).
5. Hantar creds manager kepada ketua department.

### Langkah 3 — Manager login & urus department
1. Manager login → **wajib tukar password** kali pertama.
2. **Users → Create User** → user auto-masuk department manager (tak perlu pilih org).
3. Manager nampak & urus user department dia, dan nampak chat user department dia.

### Langkah 4 — User biasa
1. Login → tukar password → guna chatbot dalam skop dia.

---

## 3. Siapa nampak / boleh buat apa

| Tindakan | Developer | Admin (org) | Manager (dept) | User |
|---|---|---|---|---|
| Cipta org + admin (Gateway) | ✅ | ✗ | ✗ | ✗ |
| Cipta department | ✅ | ✅ (bawah dia) | ✗ | ✗ |
| Cipta manager | ✅ | ✅ (dept dia) | ✗ | ✗ |
| Cipta user | ✅ | ✅ (org + dept) | ✅ (dept dia) | ✗ |
| Assign package | ✅ | ✗ | ✗ | ✗ |
| Lihat chat | semua | user **org-level** dia sahaja | user **department** dia | sendiri |
| Chat / upload | ✅ | ✅ | ✅ | ✅ |

> Nota: Admin **tak** nampak chat setiap department (skop terlalu besar) — chat department diserahkan kepada manager masing-masing. Admin nampak chat user yang di-assign terus ke org node dia.

---

## 4. Senario billing khas — department bayar terus ke GenCode

**Situasi:** Contoh di Yamaha — satu department bayar GenCode terus untuk guna Genia, tidak melalui HLYM (parent org). Package & chat count department itu mesti **berasingan** daripada HLYM.

### Apa yang SUDAH ada dalam sistem
Package (`groups`) di-resolve secara **hierarki**: `resolveEffectivePackageForOrg` naik ke atas cari nod terdekat yang ada `groupId`. Kalau satu department diberi **package sendiri**, sistem **auto-asingkan** quota/storage department itu daripada parent (mekanisme "carve-out" dalam `getPackageScopedOrgIds`).

Kesannya bila department ada package sendiri:
- **Storage** department dikira berasingan (tak dicampur dengan HLYM).
- **Chat quota** department dikira berasingan — `chat_counts` di-key dengan package department itu (owner = department), termasuk `quotaType` (individual/total), `renewDay`, `bonusQuota` tersendiri.
- Package HLYM **mengecualikan** subtree department itu daripada kiraannya.

### Cara buat (Developer)
1. Kekalkan department itu di bawah HLYM dalam hierarki (struktur & laporan kekal utuh).
2. Di app tenant → **Organizations** (paparan developer) → cari department itu → guna **dropdown package** pada baris department → assign package tersendiri.
   - Backend: `PUT /api/organizations/:id/package` (developer sahaja).
3. Selesai — department itu kini "package owner" sendiri; quota + storage terpisah automatik.

### Pilihan alternatif
- **Kekal department + package sendiri** (disyorkan): sesuai bila department masih sebahagian struktur Yamaha tetapi bayar berasingan. Guna keupayaan sedia ada di atas.
- **Jadikan organization berasingan (tenant sendiri)**: kalau department itu benar-benar bebas (admin sendiri, tiada kaitan HLYM). Cipta sebagai tenant baru melalui Gateway. Kehilangan hubungan hierarki dengan HLYM.

### Cadangan ringkas
Untuk kes "department Yamaha bayar direct": **kekalkan sebagai department di bawah HLYM, tetapi assign package tersendiri pada nod department itu.** Sistem sudah menyokong pengasingan quota/storage sepenuhnya — tiada kod tambahan diperlukan. GenCode (developer) yang kawal assignment package, jadi billing kekal di tangan GenCode.

---

## 5. Nota penting
- Email user mesti **unik** merentas semua org pada server tenant yang sama.
- Semua akaun baru (admin/manager/user) **wajib tukar password** kali pertama login.
- Bila package ditukar/di-assign, ia berkuat kuasa serta-merta (storage & quota dikira semula ikut owner baru).
- Kalau semua server penuh (`maxTenants`), tambah server baru dahulu — lihat `ADD_TENANT_SERVER.md`.
