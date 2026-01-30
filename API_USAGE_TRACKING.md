// API Usage Tracking Example
// Add this to track API calls internally

// Track API usage
async function trackApiUsage(apiType, endpoint, tokensUsed = 0) {
  await db.collection('api_usage').insertOne({
    apiType, // 'gemini-stt', 'gemini-tts', 'gemini-chat'
    endpoint,
    tokensUsed,
    timestamp: new Date(),
    date: new Date().toISOString().split('T')[0]
  });
}

// Get usage stats
app.get('/api/usage-stats', auth, async (req, res) => {
  try {
    // Only developer can view
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }

    const { startDate, endDate } = req.query;
    
    const matchQuery = {};
    if (startDate && endDate) {
      matchQuery.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await db.collection('api_usage')
      .aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              apiType: '$apiType',
              date: '$date'
            },
            count: { $sum: 1 },
            totalTokens: { $sum: '$tokensUsed' }
          }
        },
        { $sort: { '_id.date': -1 } }
      ]).toArray();

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example usage in TTS endpoint:
app.post('/api/tts', auth, async (req, res) => {
  try {
    // ... existing TTS code ...
    
    // Track usage
    await trackApiUsage('gemini-tts', '/api/tts', req.body.text.length);
    
    // ... rest of code ...
  } catch (error) {
    // ...
  }
});
