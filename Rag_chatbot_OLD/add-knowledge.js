// Script to add knowledge directly to embedding_files collection
// Usage: node add-knowledge.js

import { MongoClient } from 'mongodb';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MONGODB_URI = "mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot";

// Get Gemini API key from settings
async function getGeminiKey() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('ragchatbot');
  const settings = await db.collection('settings').findOne({ _id: 'config' });
  await client.close();
  return settings?.geminiSttApiKey || settings?.geminiTtsApiKey;
}

async function addKnowledge(text, fileName = "Custom Knowledge") {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('ragchatbot');
    
    // Get API key
    const apiKey = await getGeminiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not found in settings');
    }
    
    // Generate embedding
    console.log('Generating embedding...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;
    
    // Insert into MongoDB
    console.log('Inserting into MongoDB...');
    await db.collection('embedding_files').insertOne({
      text: text,
      embedding: embedding,
      fileName: fileName,
      fileId: null,
      organizationId: null,
      departmentId: null,
      uploadedAt: new Date()
    });
    
    console.log('✅ Knowledge added successfully!');
    console.log(`   File name: ${fileName}`);
    console.log(`   Text length: ${text.length} characters`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

// Example knowledge text
const serviceBookingKnowledge = `
Q: How do I book a motor service?
A: To book a motor service, please [click here](/form/booking-service) to fill out the booking form.

Q: What services are available?
A: We offer the following services:
- 1st Free Service
- Regular Service
- Repair
- Inspection

Q: What are your service hours?
A: Our service center is open:
- Monday to Friday: 9:00 AM - 6:00 PM
- Saturday: 9:00 AM - 2:00 PM
- Sunday: Closed

Q: What information do I need to book a service?
A: Please have the following ready:
- Motor model (e.g., NVX, Aerox)
- Plate number
- Current mileage
- IC/Passport number
- Contact phone number

Q: How long does it take to get confirmation?
A: Our team will contact you within 24 hours to confirm your appointment.

Q: Can I book a service now?
A: Yes! Please [click here](/form/booking-service) to book your service appointment.

Q: I want to service my motor
A: Great! You can book a service by [clicking here](/form/booking-service). Please have your motor details ready.
`;

// Run the script
addKnowledge(serviceBookingKnowledge, "Service Booking Knowledge");
