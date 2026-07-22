# Add a New Tenant Server — Genia

Bila server tenant sedia ada penuh (`maxTenants` dicapai) atau kau nak asingkan client ke server lain, ikut panduan ni untuk deploy + daftar server tenant baru dalam Gateway.

---

## 1. Bila perlu tambah server?
- Semua server aktif dah penuh (bilangan org ≥ `maxTenants`, default 5) — Create Tenant di Gateway akan gagal dengan *"All servers are full"*.
- Kau nak isolasi client tertentu (data, beban, atau geografi) ke server berasingan.

Satu **tenant server** = satu instance app (`tenant/`) + MongoDB + Qdrant + MySQL sendiri. Ia boleh hos beberapa organization (had oleh `maxTenants`).

---

## 2. Deploy instance tenant baru

Setiap server tenant perlu: **port host unik**, **volume/data sendiri**, dan **secret sendiri**.

### 2a. Sediakan `.env`
Dalam folder `tenant/` (atau salinannya untuk server baru), sediakan `.env`:

```bash
NODE_ENV=production
MONGODB_URI=mongodb://mongodb:27017/ragchatbot

# WAJIB — jana unik untuk SETIAP server:
#   openssl rand -hex 32   -> JWT_SECRET (min 32 aksara, guard menolak default/pendek)
#   openssl rand -hex 24   -> INTERNAL_KEY (min 24 aksara)
JWT_SECRET=<hex-32-bytes-unik>
INTERNAL_KEY=<hex-24-bytes-unik>

# Optional
TRUST_PROXY=true
MAX_UPLOAD_MB=100
```

> `JWT_SECRET` dan `INTERNAL_KEY` mesti **berbeza** bagi setiap server. Simpan `INTERNAL_KEY` — kau perlukan ia semasa daftar di Gateway.

### 2b. Port host unik
`tenant/docker-compose.yml` map `1223:3000`. Server pertama guna **1223**. Untuk server kedua, guna port lain (contoh **1233**) dan nama projek compose berasingan supaya container/volume tak berlanggar:

```bash
# contoh server kedua pada port 1233
cd tenant
docker compose -p tenant2 up -d --build
# (ubah port mapping ke "1233:3000" dalam compose salinan/override server kedua)
```

Cara paling bersih: **salin folder `tenant/`** untuk setiap server (contoh `tenant2/`), ubah port kepada `1233:3000`, letak `.env` tersendiri, kemudian `docker compose up -d --build` dalam folder itu. Setiap folder = projek compose berasingan dengan volume berasingan.

### 2c. Sahkan ia hidup
```bash
curl -s http://localhost:1233/api/health
# jangkaan: {"status":"ok","version":"1.0","tenantCount":0}
```

---

## 3. Daftar server dalam Gateway

Gateway panggil server tenant **dari dalam container gateway**, jadi URL mesti boleh dicapai dari situ.

- **Docker Desktop / Mac (setup semasa):** guna `http://host.docker.internal:<port>`
  (server sedia ada didaftar sebagai `http://host.docker.internal:1223`).
- **Linux prod:** guna IP host / rangkaian docker kongsi / URL dalaman yang boleh dicapai gateway.

Langkah:
1. Login Gateway → **Servers → Add Server**.
2. Isi:
   - **Name:** contoh `server 2`
   - **URL:** `http://host.docker.internal:1233` (ikut pattern server sedia ada)
   - **Internal Key:** sama dengan `INTERNAL_KEY` server tenant baru (min 24 aksara, bukan nilai default)
   - **Max Tenants:** contoh `5`
3. Submit. Gateway akan **health-check** URL (`GET /api/health` mesti pulang `status: ok`) sebelum simpan. Kalau gagal sambung → semak URL/port/kebolehcapaian.

---

## 4. Selepas daftar
- Server baru muncul dalam senarai **Servers** (status `active`, tenant count 0).
- Semasa **Create Tenant**, dropdown **Server** akan tunjuk server baru (dengan kapasiti `0/5`).
- Kau boleh biar `Auto` (Gateway pilih server pertama yang ada slot) atau pilih server baru secara manual.

---

## 5. Checklist ringkas
- [ ] Deploy instance tenant baru (port host unik, volume sendiri).
- [ ] `.env`: `JWT_SECRET` (hex-32) + `INTERNAL_KEY` (hex-24) unik.
- [ ] `curl /api/health` pulang `status: ok`.
- [ ] URL boleh dicapai dari container gateway (`host.docker.internal:<port>` di Mac).
- [ ] Gateway → Servers → Add Server (URL + internalKey sepadan + maxTenants).
- [ ] Sahkan server muncul `active` dan boleh dipilih semasa Create Tenant.

---

## 6. Nota
- `INTERNAL_KEY` menyokong rotasi: set `INTERNAL_KEY_NEXT` pada tenant, kemas kini rekod server di Gateway, kemudian naik taraf ia jadi `INTERNAL_KEY`.
- Endpoint `/api/internal/*` diblok di nginx untuk trafik awam — hanya Gateway (server-to-server) yang panggil ia.
- Setiap server tenant bebas: settings, provider keys, package (`groups`), users, dan data semua berasingan per server.
