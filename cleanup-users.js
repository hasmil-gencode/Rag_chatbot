import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot';
const client = new MongoClient(MONGODB_URI);

async function cleanup() {
  try {
    await client.connect();
    const db = client.db('ragchatbot');
    
    console.log('🔍 Current users:');
    const users = await db.collection('users').find({}, { projection: { email: 1, fullName: 1 } }).toArray();
    users.forEach(u => console.log(`   - ${u.email} (${u.fullName})`));
    
    console.log('\n🗑️  Deleting all users except developer@gencode.com.my...');
    const result = await db.collection('users').deleteMany({ 
      email: { $ne: 'developer@gencode.com.my' } 
    });
    
    console.log(`✅ Deleted ${result.deletedCount} users`);
    
    console.log('\n✅ Remaining users:');
    const remaining = await db.collection('users').find({}, { projection: { email: 1, fullName: 1 } }).toArray();
    remaining.forEach(u => console.log(`   - ${u.email} (${u.fullName})`));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

cleanup();
