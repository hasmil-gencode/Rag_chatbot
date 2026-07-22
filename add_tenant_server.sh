#!/usr/bin/env bash
#
# add_tenant_server.sh — run from your Mac.
# Adds ANOTHER tenant instance on the SAME server (tenant_2, tenant_3, ...),
# each fully isolated (own MongoDB/Qdrant/MySQL via its own compose project).
#
# It will, on the server:
#   1. Require an existing gateway/  (gateway must live on ONE server only —
#      this script never creates a gateway).
#   2. Require an existing tenant/    (base to copy the code from).
#   3. Pick the next free folder name (tenant_2, tenant_3, ...).
#   4. Copy ONLY code (rsync excludes uploads, logos, node-red-data, node_modules,
#      dist) — so existing client files are NEVER copied into the new tenant.
#   5. Pick a free host port, generate fresh JWT_SECRET + INTERNAL_KEY.
#   6. docker compose up -d --build, health-check, then print port + keys.
#   7. Show remaining RAM/disk and remind you about nginx.
#
# Usage:
#   ./add_tenant_server.sh
#   SSH_KEY=~/.ssh/other ./add_tenant_server.sh
#
set -euo pipefail

SERVER_USER="hasmil"
SERVER_IP="10.50.2.38"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/genform_server}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

[ -f "$SSH_KEY" ] || { echo "❌ SSH key not found: $SSH_KEY  (set SSH_KEY=~/.ssh/your_key)"; exit 1; }

echo "🔌 Connecting to $SERVER_USER@$SERVER_IP to add a new tenant server ..."
echo ""

ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" 'bash -s' <<'REMOTE'
set -uo pipefail
ROOT="$HOME/genbot"

# ── 1. Gateway must exist here (gateway = one server only) ──
if [ ! -d "$ROOT/gateway" ]; then
  echo "════════════════════════════════════════════════════════════"
  echo "⚠️  NEW SERVER — no '$ROOT/gateway' found."
  echo ""
  echo "This looks like a fresh server. The GATEWAY must run on ONE server"
  echo "only, so this script will NOT create anything here."
  echo ""
  echo "👉 If this server is meant to host tenants, add the first tenant"
  echo "   folder MANUALLY, then register it in the gateway UI."
  echo "════════════════════════════════════════════════════════════"
  exit 0
fi

# ── 2. Base tenant/ must exist to copy code from ──
if [ ! -d "$ROOT/tenant" ]; then
  echo "❌ No base '$ROOT/tenant' folder to copy from. Aborting (nothing changed)."
  exit 1
fi

cd "$ROOT"

# ── 3. Next free folder name: tenant_2, tenant_3, ... ──
N=2
while [ -d "tenant_$N" ]; do N=$((N+1)); done
NEWDIR="tenant_$N"

# ── 4. Next free host port (scan every tenant*/docker-compose.yml) ──
maxport=0
for f in tenant/docker-compose.yml tenant_*/docker-compose.yml; do
  [ -f "$f" ] || continue
  for pnum in $(grep -hoE '"[0-9]+:3000"' "$f" | sed -E 's/"([0-9]+):3000"/\1/'); do
    if [ "$pnum" -gt "$maxport" ] 2>/dev/null; then maxport="$pnum"; fi
  done
done
[ "$maxport" -eq 0 ] && maxport=1223
PORT=$((maxport + 10))
port_in_use() { ss -ltn 2>/dev/null | grep -qE "[:.]$1 "; }
while port_in_use "$PORT"; do PORT=$((PORT+10)); done

echo "🆕 Creating $NEWDIR on host port $PORT ..."

# ── 5. Copy CODE ONLY (never client data) ──
rsync -a \
  --exclude 'uploads' \
  --exclude 'node-red-data' \
  --exclude 'public/logos/logo-*' \
  --exclude 'public/embed/logos' \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude '.env.staging' \
  --exclude 'docker-compose.staging.yml' \
  --exclude '.git' \
  "tenant/" "$NEWDIR/"
mkdir -p "$NEWDIR/uploads" "$NEWDIR/public/logos" "$NEWDIR/public/embed/logos"

# ── 6. Change host port in the new compose ──
sed -i -E "s/\"[0-9]+:3000\"/\"$PORT:3000\"/" "$NEWDIR/docker-compose.yml"

# ── 7. Fresh secrets (each tenant unique) ──
JWT="$(openssl rand -hex 32)"
IKEY="$(openssl rand -hex 24)"
if grep -q '^JWT_SECRET=' "$NEWDIR/.env" 2>/dev/null; then
  sed -i -E "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" "$NEWDIR/.env"
else
  echo "JWT_SECRET=$JWT" >> "$NEWDIR/.env"
fi
if grep -q '^INTERNAL_KEY=' "$NEWDIR/.env" 2>/dev/null; then
  sed -i -E "s|^INTERNAL_KEY=.*|INTERNAL_KEY=$IKEY|" "$NEWDIR/.env"
else
  echo "INTERNAL_KEY=$IKEY" >> "$NEWDIR/.env"
fi

# ── 8. Build + run (own isolated compose project = own DB/Qdrant/MySQL) ──
echo "🔨 Building & starting $NEWDIR (this can take a few minutes) ..."
if ! ( cd "$NEWDIR" && docker compose up -d --build ); then
  echo "❌ docker compose failed for $NEWDIR."
  echo "   Inspect: cd $ROOT/$NEWDIR && docker compose logs rag-chatbot --tail 50"
  echo "   Remove:  cd $ROOT && docker compose -p $NEWDIR down -v 2>/dev/null; rm -rf $NEWDIR"
  exit 1
fi

# ── 9. Health check (retry while it boots) ──
ok=0
for i in $(seq 1 40); do
  if curl -s -m5 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"status":"ok"'; then ok=1; break; fi
  sleep 3
done

echo ""
if [ "$ok" = "1" ]; then
  echo "════════════════════════════════════════════════════════════"
  echo "✅ $NEWDIR is UP and healthy on port $PORT"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  echo "👉 Register it in the Gateway UI → Servers → Add Server:"
  echo "     Name:         server $N"
  echo "     URL:          http://host.docker.internal:$PORT"
  echo "     Internal Key: $IKEY"
  echo "     Max Tenants:  5   (adjust as you like)"
  echo ""
  echo "   (JWT_SECRET for this tenant: $JWT)"
  echo "   Secrets are saved in: $ROOT/$NEWDIR/.env"
else
  echo "❌ $NEWDIR built but health check on port $PORT failed."
  echo "   Logs: cd $ROOT/$NEWDIR && docker compose logs rag-chatbot --tail 50"
  echo "   (Port=$PORT  INTERNAL_KEY=$IKEY  JWT_SECRET=$JWT)"
fi

# ── 10. Server resources ──
echo ""
echo "── Server resources ──"
free -h 2>/dev/null | awk '/Mem:/{print "   RAM : "$3" used / "$2" total  (available: "$7")"}'
df -h / 2>/dev/null | awk 'NR==2{print "   Disk: "$3" used / "$2" total  ("$5" used, "$4" free)"}'

# ── 11. nginx reminder ──
echo ""
echo "── Reminder ──"
echo "   • Login & chat for this tenant go THROUGH the gateway — works right away"
echo "     once you register the server above (no nginx change needed)."
echo "   • ONLY if this tenant needs DIRECT embed-widget access, add an nginx"
echo "     route to port $PORT (mirror the existing :1223 embed block)."
echo ""
REMOTE
