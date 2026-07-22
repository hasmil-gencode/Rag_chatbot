#!/usr/bin/env bash
#
# Genbot deploy script — run from your Mac.
# Syncs gateway/ and tenant/ code to the server and rebuilds Docker.
#
# Multi-tenant aware:
#   All tenant instances (tenant, tenant_2, tenant_3, ...) run the SAME code,
#   differing only by port + .env. This script pushes the local tenant/ code to
#   EVERY tenant folder found on the server, while preserving each one's:
#     - .env               (secrets)
#     - docker-compose.yml (its unique host port)   ← only for tenant_2+
#     - uploads/, public/logos/logo-* (uploaded), public/embed/logos/, node-red-data/  (data)
#     - Docker named volumes (mongo/qdrant/mysql databases)
#
#   --delete cleans stale CODE files, but the items above are excluded and so
#   are never overwritten or deleted.
#
# Usage:
#   ./deploy.sh              # gateway + ALL tenants
#   ./deploy.sh gateway      # gateway only
#   ./deploy.sh tenant       # ALL tenant instances (base + tenant_2, tenant_3...)
#   ./deploy.sh tenant_2     # ONE specific tenant instance only
#   DRY_RUN=1 ./deploy.sh    # preview only — no transfer, no rebuild
#   SSH_KEY=~/.ssh/other ./deploy.sh
#
set -euo pipefail

# ---------------- Config ----------------
SERVER_USER="hasmil"
SERVER_IP="10.50.2.38"
SERVER_DIR="/home/hasmil/genbot"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/genform_server}"
# ----------------------------------------

LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"
TARGET="${1:-all}"
DRY_RUN="${DRY_RUN:-0}"

if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found at: $SSH_KEY"
  echo "   Set the right path: SSH_KEY=~/.ssh/your_key ./deploy.sh"
  exit 1
fi
if [[ "$TARGET" != "all" && "$TARGET" != "gateway" && "$TARGET" != "tenant" && ! "$TARGET" =~ ^tenant_[0-9]+$ ]]; then
  echo "❌ Unknown target '$TARGET'. Use: all | gateway | tenant | tenant_N (e.g. tenant_2)"
  exit 1
fi

RSYNC_FLAGS=(-avz --delete)
if [ "$DRY_RUN" = "1" ]; then
  RSYNC_FLAGS+=(--dry-run)
  echo "🧪 DRY RUN — showing what would change, no files transferred, no rebuild."
fi

# Data dirs to preserve on every tenant instance.
TENANT_DATA_EXCLUDES=(
  --exclude 'uploads'
  --exclude 'public/logos/logo-*'
  --exclude 'public/embed/logos'
  --exclude 'node-red-data'
)

# deploy_sync <local_folder> <server_folder> [extra rsync excludes...]
# Source is always LOCAL, destination folder on the server may differ
# (so local tenant/ can be pushed to server tenant_2/, tenant_3/, ...).
deploy_sync() {
  local local_name="$1"; local server_name="$2"; shift 2
  local extra=("$@")

  if [ ! -f "$LOCAL_DIR/$local_name/docker-compose.yml" ]; then
    echo "❌ $local_name/docker-compose.yml not found locally — aborting."
    exit 1
  fi

  echo ""
  echo "════════════════════════════════════════════"
  echo "🚀 Syncing $local_name/  →  server:$server_name/"
  echo "════════════════════════════════════════════"
  rsync "${RSYNC_FLAGS[@]}" \
    -e "ssh $SSH_OPTS" \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude '.DS_Store' \
    --exclude '*.log' \
    "${extra[@]}" \
    "$LOCAL_DIR/$local_name/" "$SERVER_USER@$SERVER_IP:$SERVER_DIR/$server_name/"

  if [ "$DRY_RUN" = "1" ]; then
    echo "🧪 (dry run) skipping rebuild for $server_name"
    return
  fi

  echo "🔨 Rebuilding & restarting $server_name on server ..."
  ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" \
    "cd '$SERVER_DIR/$server_name' && docker compose up -d --build && docker image prune -f && docker compose ps"
}

# Extra tenant folders on the server (tenant_2, tenant_3, ...). Empty if none.
list_extra_tenants() {
  ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" "ls -d '$SERVER_DIR'/tenant_* 2>/dev/null" 2>/dev/null \
    | sed 's#/*$##; s#.*/##' || true
}

# ── Gateway ──
if [ "$TARGET" = "all" ] || [ "$TARGET" = "gateway" ]; then
  deploy_sync "gateway" "gateway" --exclude 'public/logos/logo-*'
fi

# ── All tenant instances ──
if [ "$TARGET" = "all" ] || [ "$TARGET" = "tenant" ]; then
  # Base tenant (canonical — its compose is the source of truth, port 1223).
  deploy_sync "tenant" "tenant" "${TENANT_DATA_EXCLUDES[@]}"

  # Additional tenants: push the SAME code, but keep each one's own compose
  # (its unique port) and .env untouched.
  EXTRA=$(list_extra_tenants)
  if [ -n "$EXTRA" ]; then
    echo ""
    echo "🔎 Found extra tenant instances: $(echo "$EXTRA" | tr '\n' ' ')"
    while IFS= read -r t; do
      [ -z "$t" ] && continue
      deploy_sync "tenant" "$t" "${TENANT_DATA_EXCLUDES[@]}" --exclude 'docker-compose.yml'
    done <<< "$EXTRA"
  fi
fi

# ── One specific tenant instance (e.g. ./deploy.sh tenant_2) ──
if [[ "$TARGET" =~ ^tenant_[0-9]+$ ]]; then
  if ! ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" "[ -d '$SERVER_DIR/$TARGET' ]"; then
    echo "❌ '$TARGET' not found on server at $SERVER_DIR/$TARGET."
    echo "   Create it first with: ./add_tenant_server.sh"
    exit 1
  fi
  deploy_sync "tenant" "$TARGET" "${TENANT_DATA_EXCLUDES[@]}" --exclude 'docker-compose.yml'
fi

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "🧪 Dry run complete. Re-run without DRY_RUN=1 to apply."
  exit 0
fi

echo ""
echo "✅ Deploy complete."
echo "── Health check (gateway + every tenant) ──"
ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" 'bash -s' <<'HC' || true
cd "$HOME/genbot" 2>/dev/null || exit 0
if [ -d gateway ]; then
  printf '   %-16s ' "gateway (:4000)"; curl -s -m5 http://localhost:4000/api/health || echo unreachable; echo
fi
for d in tenant tenant_*; do
  [ -d "$d" ] || continue
  p=$(grep -hoE '"[0-9]+:3000"' "$d/docker-compose.yml" 2>/dev/null | sed -E 's/"([0-9]+):3000"/\1/' | head -1)
  [ -z "$p" ] && continue
  printf '   %-16s ' "$d (:$p)"; curl -s -m5 "http://localhost:$p/api/health" || echo unreachable; echo
done
HC
echo ""
echo "Tip — tail logs:"
echo "  ssh $SSH_OPTS $SERVER_USER@$SERVER_IP \"cd $SERVER_DIR/tenant && docker compose logs rag-chatbot --tail 30\""
