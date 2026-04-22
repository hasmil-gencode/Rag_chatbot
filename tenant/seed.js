// Seed script — creates initial developer user
// Run via: docker compose exec rag-chatbot node seed.js

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/ragchatbot';

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db();

const existing = await db.collection('users').findOne({ email: 'developer@gencode.com.my' });
if (existing) {
  console.log('Developer user already exists, skipping.');
} else {
  const hash = await bcrypt.hash('Developer@123', 10);
  await db.collection('users').insertOne({
    email: 'developer@gencode.com.my',
    password: hash,
    role: 'developer',
    status: 'active',
    fullName: 'Developer',
    canUploadFiles: true,
    showSources: true,
    createdAt: new Date()
  });
  console.log('✅ Developer user created: developer@gencode.com.my / Developer@123');
}

await client.close();
