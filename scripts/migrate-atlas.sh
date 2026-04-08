#!/bin/bash
# Migrate data from MongoDB Atlas to local MongoDB container.
#
# Prerequisites:
#   - mongodump / mongorestore installed (brew install mongodb-database-tools)
#   - Atlas URI in ATLAS_URI env var
#   - Local MongoDB container running
#
# Usage:
#   ATLAS_URI="mongodb+srv://user:pass@cluster.mongodb.net/ragchatbot_prod" ./scripts/migrate-atlas.sh

set -e

ATLAS_URI="${ATLAS_URI:?Set ATLAS_URI to your Atlas connection string}"
LOCAL_URI="${LOCAL_URI:-mongodb://localhost:27017/ragchatbot}"
DUMP_DIR="./atlas-dump"

echo "=== Step 1: Dump from Atlas ==="
mongodump --uri="$ATLAS_URI" --out="$DUMP_DIR"

echo ""
echo "=== Step 2: Restore to local MongoDB ==="
# Extract db name from Atlas URI
ATLAS_DB=$(echo "$ATLAS_URI" | sed -n 's|.*/\([^?]*\).*|\1|p')
mongorestore --uri="$LOCAL_URI" --nsFrom="${ATLAS_DB}.*" --nsTo="ragchatbot.*" "$DUMP_DIR"

echo ""
echo "=== Migration complete ==="
echo "Data from Atlas ($ATLAS_DB) → local MongoDB (ragchatbot)"
echo ""
echo "You can remove the dump: rm -rf $DUMP_DIR"
