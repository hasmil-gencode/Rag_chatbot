const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Get input from AI Agent
const input = $input.item.json;
const query = input.query || input.chatInput;
const organizationId = input.organizationId;
const departmentId = input.departmentId;
const fileId = input.fileId;

// Generate embedding for query
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
const result = await model.embedContent(query);
const queryEmbedding = result.embedding.values;

// Connect to MongoDB
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('ragchatbot');

// Build filter with proper $or logic
let matchStage = {};

// If specific file selected, only search that file
if (fileId) {
  matchStage.fileId = fileId;
} else {
  // Search in user's org files OR general knowledge (null org)
  if (organizationId) {
    matchStage.$or = [
      { organizationId: organizationId },
      { organizationId: null }  // Include general knowledge
    ];
  }
  
  // Department filter: match user's dept OR null (all depts)
  if (departmentId) {
    if (!matchStage.$or) {
      matchStage.$or = [];
    }
    // Combine with department filter
    matchStage.$and = [
      { $or: matchStage.$or },
      { 
        $or: [
          { departmentId: departmentId },
          { departmentId: null }
        ]
      }
    ];
    delete matchStage.$or;
  }
}

// Vector search aggregation pipeline
const pipeline = [
  {
    $vectorSearch: {
      index: 'rag_vector_search_1',
      path: 'embedding',
      queryVector: queryEmbedding,
      numCandidates: 100,
      limit: 5
    }
  },
  {
    $match: matchStage  // Post-filter after vector search
  },
  {
    $project: {
      text: 1,
      fileName: 1,
      departmentId: 1,
      organizationId: 1,
      score: { $meta: 'vectorSearchScore' },
      _id: 0
    }
  }
];

const results = await db.collection('embedding_files').aggregate(pipeline).toArray();

await client.close();

// Format results for AI Agent
return results.map(r => ({
  pageContent: r.text,
  metadata: { 
    fileName: r.fileName,
    score: r.score,
    departmentId: r.departmentId,
    organizationId: r.organizationId
  }
}));
