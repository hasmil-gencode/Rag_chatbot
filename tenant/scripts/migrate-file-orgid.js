// One-time migration: backfill organizationId on existing files
// Run: node migrate-file-orgid.js
// Safe to run multiple times — skips files that already have organizationId

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const files = await db.collection('files').find({ organizationId: { $exists: false } }).toArray();
  console.log(`Found ${files.length} files without organizationId`);

  let updated = 0;
  for (const file of files) {
    let orgId = null;

    // Try 1: get org from uploader's assignment
    if (file.userId) {
      const uid = typeof file.userId === 'string' ? new ObjectId(file.userId) : file.userId;
      const assignment = await db.collection('user_organization_assignments').findOne({ userId: uid });
      if (assignment) orgId = assignment.organizationId;
    }

    // Try 2: use first sharedWith org
    if (!orgId && file.sharedWith?.length > 0) {
      orgId = file.sharedWith[0];
    }

    if (orgId) {
      await db.collection('files').updateOne({ _id: file._id }, { $set: { organizationId: orgId } });
      updated++;
    } else {
      console.log(`  Skipped: ${file.name} (no org found)`);
    }
  }

  console.log(`Done. Updated ${updated}/${files.length} files.`);

  // Migrate chat_counts — backfill organizationId from user assignments
  const counts = await db.collection('chat_counts').find({ organizationId: { $exists: false } }).toArray();
  console.log(`\nFound ${counts.length} chat_counts without organizationId`);

  let countUpdated = 0;
  for (const c of counts) {
    const uid = typeof c.userId === 'string' ? new ObjectId(c.userId) : c.userId;
    const assignment = await db.collection('user_organization_assignments').findOne({ userId: uid });
    if (assignment) {
      await db.collection('chat_counts').updateOne({ _id: c._id }, { $set: { organizationId: assignment.organizationId } });
      countUpdated++;
    }
  }

  console.log(`Done. Updated ${countUpdated}/${counts.length} chat_counts.`);
  await client.close();
}

migrate().catch(e => { console.error(e); process.exit(1); });
