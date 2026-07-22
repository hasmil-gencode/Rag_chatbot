# Genia — Senarai Penambahbaikan

Status audit kod (gateway + tenant). Tandaan:
- ✅ Selesai
- ⬜ Belum buat

Terakhir dikemas kini: 2026-07-20

---

## 🔴 Security — kritikal

### ✅ 1. JWT_SECRET ada fallback lemah (tenant)
- **Masalah:** `tenant/server.js` guna `process.env.JWT_SECRET || 'change-this-secret'`. Kalau env tak set, sesiapa boleh forge JWT jadi developer.
- **Fix:** Buang fallback. Sekarang `throw` kalau tak set atau guna placeholder default (`change-this-secret`, `change-this-to-a-long-random-tenant-secret`), tak kira NODE_ENV. Dalam production wajib ≥ 32 aksara. Check berlaku sebelum Mongo connect (fail-fast).
- **Fail:** `tenant/server.js`
- **Nota:** Bila rotate secret, semua JWT & session sedia ada jadi tak sah → user kena login semula.

### ⬜ 2. API keys disimpan plaintext
- **Masalah:** `api_keys.key` (`gk_...`) & `shortKey` disimpan plaintext, lookup guna match terus. Kalau Mongo bocor, semua key terus boleh guna.
- **Cadangan fix:** Simpan hash (SHA-256) key, compare hash. Tunjuk key penuh sekali sahaja masa create.
- **Fail:** `tenant/routes/apiKeys.js`, `tenant/server.js` (`authenticateApiKey`, `verify-api-key`)

### ⬜ 3. Guardrail fail-open
- **Masalah:** `checkGuardrail` return `{ safe: true }` bila API error/timeout → request lepas tanpa semak.
- **Cadangan fix:** Fail-closed untuk input guardrail, atau jadikan configurable.
- **Fail:** `tenant/chatPipeline.js`

### ⬜ 4. Secrets bocor ke frontend
- **Masalah:** `GET /api/settings` pulangkan `s3SecretKey`, `smtpPassword`, `gclasServiceAccount`, provider keys — plaintext. Admin pun boleh baca.
- **Cadangan fix:** Mask (`••••`) atau asingkan jadi endpoint developer-only; jangan hantar nilai secret ke client.
- **Fail:** `tenant/server.js` (`GET /api/settings`)

### ⬜ 5. Secrets plaintext at-rest dalam Mongo
- **Masalah:** `settings` + `provider_keys` simpan API key, service account JSON, S3 secret, SMTP password tanpa encryption.
- **Cadangan fix:** Encrypt at-rest (AES guna master key dari env).
- **Fail:** `tenant/server.js`

### ✅ 6. `trust proxy: true` = IP spoofing
- **Masalah:** `trust proxy: true` percaya `X-Forwarded-For` sepenuhnya. Sebab nginx guna `$proxy_add_x_forwarded_for` + gateway forward header via axios, `req.ip` boleh dipalsukan → bypass login lockout / rate limit.
- **Fix:**
  - Tambah helper `getClientIp(req)` (tenant + gateway) yang guna **`CF-Connecting-IP`** (Cloudflare set, client tak boleh palsu melalui tunnel; nginx + gateway forward utuh). Fallback ke `req.ip` cuma bila takde header CF.
  - Semua keputusan keselamatan guna `getClientIp`: `loginRateLimit` (tenant+gateway), `apiRateLimit`, rate limit public embed chat (2 tempat).
  - Logging/tracking pun guna IP tepat: request logger, `lastLoginIP` (3), `ipAddress` (3), `visitorIp` (2).
  - `trust proxy` jadi configurable via env `TRUST_PROXY` (default `true`).
- **Fail:** `tenant/server.js`, `gateway/server.js`, `tenant/.env.example`, `gateway/.env.example`

### ⬜ 7. SSRF dalam webview-proxy
- **Masalah:** `assertSafeUrl` cuma check DNS resolve pertama; axios ikut sampai 5 redirects tanpa re-validate → boleh reach internal IP (TOCTOU + redirect).
- **Cadangan fix:** Validate setiap redirect hop; blok private IP pada setiap resolve.
- **Fail:** `tenant/server.js` (`/api/webview-check`, `/api/webview-proxy`)

### ✅ 8. Upload & body tiada had (DoS)
- **Masalah:** `multer({ storage })` takde `limits`; `express.json()` takde limit. Risiko DoS + arbitrary large upload.
- **Fix:**
  - `multer` set `limits: { fileSize: MAX_UPLOAD_MB*1MB (default 100), files: 1 }` — selari dengan nginx `client_max_body_size 100M`.
  - `express.json({ limit: JSON_BODY_LIMIT || '2mb' })` — tenant + gateway.
  - Tambah error handler multer → fail terlalu besar bagi `413 FILE_TOO_LARGE` (JSON kemas, bukan 500 generik).
- **Fail:** `tenant/server.js`, `gateway/server.js`, kedua-dua `.env.example`

---

### ✅ 9b. Authorization scoping gap (user/org management)
- **Masalah:** Endpoint "developer-only" guna `hasPermission()` tanpa arg, yang sebenarnya benarkan **admin** lepas tanpa semak skop. Admin boleh urus user/org di luar hierarki dia (contoh `POST /api/user-assignments` assign mana-mana user ke mana-mana org; `PUT/DELETE /api/users/:id`, reset-password, `PUT/DELETE /api/organizations/:id` tanpa semak skop) — risiko cross-tenant + privilege escalation.
- **Fix:** Tambah helper `actorCanAccessOrg` / `actorCanManageOrg` / `actorCanManageUser` (developer bypass; selainnya terhad kepada subtree sendiri; guna `ROLE_RANK` supaya actor cuma boleh urus role lebih rendah). Dikuatkuasakan pada: user-assignments, users PUT/DELETE/reset-password, organizations PUT/DELETE, system-prompt, ai-roles. Admin kini tak boleh sentuh org/user luar subtree, tak boleh urus admin lain, tak boleh padam org root sendiri.
- **Fail:** `tenant/server.js`
- **Nota:** Dibuat sebagai prasyarat untuk role `manager` (delegasi department).

## 🟠 Reliability & correctness

### ⬜ 9. Rate limit in-memory tak scale
- **Masalah:** `loginAttempts`, `apiRateLimits`, `accountLockouts`, `publicChatRateLimit` guna `Map` dalam memori — hilang bila restart / tak kongsi antara container. Default `RATE_LIMIT_STORE=memory`.
- **Cadangan fix:** Default ke Mongo (macam gateway dah buat untuk login), atau Redis.
- **Fail:** `tenant/server.js`

### ⬜ 10. TOCTOU pada quota & storage
- **Masalah:** Storage limit check (`/api/upload`) dan chat quota (`enforceChatQuota` → `incrementChatUsage`) buat check-then-write berasingan → upload/chat serentak boleh lepas had.
- **Cadangan fix:** Atomic update dengan condition.
- **Fail:** `tenant/server.js`

### ⬜ 11. Empty catch telan error senyap
- **Masalah:** Banyak `catch {}` (contoh `logAudit`, `logAiCall`, sync roleId) — susah debug production.
- **Cadangan fix:** Sekurangnya `console.error` dengan requestId.
- **Fail:** `tenant/server.js`, `tenant/chatPipeline.js`

### ⬜ 12. Missing MongoDB indexes
- **Masalah:** `ensureMongoIndexes` tak cover `guardrail_logs`, `audit_logs`, `ai_api_logs`, `download_tracking`, `notifications`, `chat_counts` — aggregation lambat bila data besar.
- **Cadangan fix:** Tambah index pada field yang di-query/aggregate.
- **Fail:** `tenant/server.js` (`ensureMongoIndexes`)

---

## 🟡 Architecture & maintainability

### ⬜ 13. `tenant/server.js` monolith (~3500 baris)
- **Masalah:** Satu fail besar — semua route, middleware, helper campur.
- **Cadangan fix:** Pecah ikut domain: `routes/auth.js`, `routes/files.js`, `routes/chat.js`, `routes/organizations.js`, `routes/dataSources.js`, `routes/embed.js`, `routes/internal.js` + `lib/` untuk helper.

### ⬜ 14. Duplikasi besar dalam `chatPipeline.js`
- **Masalah:** `processBrowserChat` dan `processBrowserChatStream` hampir 100% sama (~500 baris tiap satu). Bug kena fix dua kali.
- **Cadangan fix:** Satukan jadi satu core function dengan callback streaming optional.
- **Fail:** `tenant/chatPipeline.js`

### ⬜ 15. `validateRequestBody` guna tak konsisten
- **Masalah:** Ada helper validation tapi banyak endpoint (ai-roles, embed-widgets, organizations, groups) tak guna.
- **Cadangan fix:** Guna secara konsisten pada semua endpoint yang terima body.
- **Fail:** `tenant/server.js`

---

## 🟢 DX / testing

### ⬜ 16. Zero tests
- **Masalah:** Takde satu pun test / test framework.
- **Cadangan fix:** Mula dengan integration test flow kritikal: login/routing gateway, quota enforcement, org access scoping, grounding gate.

### ⬜ 17. Dead code
- **Masalah:** `cleanupOldData` ada blok `if (...) {}` kosong; komen `REMOVED DUPLICATE` sisa refactor.
- **Cadangan fix:** Buang.
- **Fail:** `tenant/server.js`

---

## Kerja lain yang dah selesai (di luar senarai asal)

### ✅ Buang staging sepenuhnya
- Padam: `gateway/.env.staging`, `gateway/docker-compose.staging.yml`, `tenant/.env.staging`, `tenant/docker-compose.staging.yml`, `nginx_stag.txt`.
- Bersihkan rujukan staging dalam: `gateway/.env.example`, `tenant/.env.example`, `cloudflared.txt` (ingress `genia-stag`), `scripts/embed-widget-tester.html`.

### ✅ Gateway: pilih tenant server semasa create tenant
- Backend `POST /api/gateway/tenants` terima `serverId` optional (validate active + tak penuh); kalau kosong kekal auto.
- Frontend `TenantsPage.tsx`: dropdown Server (Auto / senarai server dengan kapasiti, disable yang penuh/offline).

### ✅ Role delegasi "manager" (department-level)
- **Model:** developer > admin (org) > manager (department) > user. Hanya developer cipta admin; admin cipta manager + user; manager cipta user dalam dept dia sahaja.
- **Backend (`tenant/server.js`):** `hasPermission` manager branch (user:manage sahaja); `POST /api/create-department` (dept + manager satu call, admin/developer); `POST /api/organizations/:id/managers` (tambah manager ke dept sedia ada); `createManagerForOrg` helper (role manager, mustChangePassword, canUploadFiles); `POST /api/users` auto-assign user manager ke dept dia + validasi skop; `GET /api/messages` + `/api/sessions` — admin & manager nampak chat semua user dalam subtree mereka.
- **Frontend:** OrganizationsPage — form "Add Department" admin ada medan Manager (satu form); butiran "Add Manager" untuk dept sedia ada. UsersPage + ChatSidebar sedar-manager (Users scoped, auto-assign ke dept).
- **Nota tingkah laku:** manager nampak chat semua user dalam department dia; admin nampak chat user yang di-assign terus ke org node dia sahaja (bukan user dalam department — itu skop manager).

---

## Cadangan urutan seterusnya
1. **#2** hash API keys + **#4/#5** secrets exposure/encryption
2. **#7** SSRF webview-proxy
3. **#14** satukan chatPipeline (kurangkan risiko bug)
4. **#9 + #12** rate limit persistent + indexes (sebelum scale)
5. **#13** pecah monolith + **#16** tests

### Ringkasan status
- Selesai: #1, #6, #8, #9b (scoping gap) — (+ buang staging, gateway server-picker, role manager delegasi)
- Belum: #2, #3, #4, #5, #7, #9, #10, #11, #12, #13, #14, #15, #16, #17
