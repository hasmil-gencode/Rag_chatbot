// Initialize fresh ragchatbot_stag database
// Run: node init-fresh-db.js

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = "mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot_stag";

async function initFreshDB() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('ragchatbot_stag');
    
    // 1. Create developer account
    console.log('\n📝 Creating developer account...');
    const hashedPassword = await bcrypt.hash('Developer@123', 10);
    
    await db.collection('users').insertOne({
      email: 'developer@gencode.com.my',
      password: hashedPassword,
      fullName: 'Developer',
      role: 'developer',
      status: 'active',
      createdBy: null, // Self-created
      createdAt: new Date()
    });
    console.log('✅ Developer account created: developer@gencode.com.my');
    
    // 2. Create indexes
    console.log('\n📝 Creating indexes...');
    
    // users indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ status: 1 });
    
    // organizations indexes
    await db.collection('organizations').createIndex({ name: 1 });
    await db.collection('organizations').createIndex({ type: 1 });
    await db.collection('organizations').createIndex({ parentId: 1 });
    
    // user_assignments indexes
    await db.collection('user_assignments').createIndex({ userId: 1 });
    await db.collection('user_assignments').createIndex({ organizationId: 1 });
    await db.collection('user_assignments').createIndex({ userId: 1, organizationId: 1 }, { unique: true });
    
    // files indexes
    await db.collection('files').createIndex({ uploadedBy: 1 });
    await db.collection('files').createIndex({ sharedWith: 1 });
    await db.collection('files').createIndex({ createdAt: -1 });
    
    // sessions indexes
    await db.collection('sessions').createIndex({ userId: 1 });
    await db.collection('sessions').createIndex({ currentOrganizationId: 1 });
    await db.collection('sessions').createIndex({ createdAt: -1 });
    
    // embedding_files indexes (vector search index created in Atlas UI)
    await db.collection('embedding_files').createIndex({ fileId: 1 });
    await db.collection('embedding_files').createIndex({ sharedWith: 1 });
    
    console.log('✅ Indexes created');
    
    // 3. Initialize settings
    console.log('\n📝 Creating default settings...');
    await db.collection('settings').insertOne({
      _id: 'config',
      companyName: 'GenBotChat',
      voiceMode: 'browser',
      voiceLanguage: 'auto',
      googleSttApiKey: '',
      googleTtsApiKey: '',
      geminiSttApiKey: '',
      geminiTtsApiKey: '',
      elevenlabsApiKey: '',
      elevenlabsVoice: 'onwK4e9ZLuTAKqWW03F9',
      gclasServiceAccount: '',
      gclasLanguage: 'auto',
      gclasVoice: 'en-US-Neural2-C',
      geminiVoice: 'Aoede',
      geminiTtsLanguage: 'auto',
      ttsMode: 'browser',
      ttsLanguage: 'en-US',
      chatWebhook: '',
      uploadWebhook: '',
      transcribeWebhook: '',
      formSubmissionWebhook: '',
      s3Bucket: '',
      s3Region: '',
      s3AccessKey: '',
      s3SecretKey: ''
    });
    console.log('✅ Default settings created');
    
    console.log('\n🎉 Fresh database initialized successfully!');
    console.log('\n📋 Summary:');
    console.log('   Database: ragchatbot_stag');
    console.log('   Developer: developer@gencode.com.my');
    console.log('   Password: Developer@123');
    console.log('\n✅ Ready to use!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

initFreshDB();
