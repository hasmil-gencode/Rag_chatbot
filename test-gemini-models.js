import { GoogleGenerativeAI } from '@google/generative-ai';
import { MongoClient } from 'mongodb';

async function listModels() {
  const client = new MongoClient('mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot');
  
  try {
    await client.connect();
    const db = client.db('ragchatbot');
    const settings = await db.collection('settings').findOne({});
    
    if (!settings?.geminiSttApiKey) {
      console.log('No Gemini API key found in settings.');
      return;
    }

    console.log('Fetching available models from Google AI...\n');
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + settings.geminiSttApiKey);
    const data = await response.json();
    
    if (data.models) {
      console.log('Available models that support generateContent:\n');
      data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .forEach(model => {
          console.log(`- ${model.name.replace('models/', '')}`);
        });
    } else {
      console.log('Error:', data);
    }
  } finally {
    await client.close();
  }
}

listModels();
