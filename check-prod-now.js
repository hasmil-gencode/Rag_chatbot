import { MongoClient } from 'mongodb';

const uri = 'mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot_prod';

async function checkCollections() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('📊 ragchatbot_prod Collections:\n');
    
    const collections = await db.listCollections().toArray();
    
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      console.log(`📁 ${coll.name}: ${count} documents`);
      
      if (count > 0 && count <= 10) {
        const docs = await db.collection(coll.name).find({}).limit(5).toArray();
        docs.forEach(doc => {
          if (coll.name === 'users') {
            console.log(`   - ${doc.email} (${doc.role})`);
          } else if (coll.name === 'organizations') {
            console.log(`   - ${doc.name} (${doc.type}) - Parent: ${doc.parentId || 'None'}`);
          } else if (coll.name === 'groups') {
            console.log(`   - ${doc.name} - Quota: ${doc.chatQuota} (${doc.quotaType})`);
          } else if (coll.name === 'user_organization_assignments') {
            console.log(`   - User: ${doc.userId} → Org: ${doc.organizationId}`);
          }
        });
      }
    }
    
    console.log(`\n📦 Total collections: ${collections.length}`);
    
  } finally {
    await client.close();
  }
}

checkCollections();
