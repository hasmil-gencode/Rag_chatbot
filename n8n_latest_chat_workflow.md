{
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "chat_stag",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "16dc684d-78ea-426a-82f8-bc3a5d62da5f",
      "name": "Webhook Chat",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [
        -2768,
        560
      ],
      "webhookId": "chat-webhook"
    },
    {
      "parameters": {
        "jsCode": "const body = $input.item.json.body;\nconst message = body.message || '';\nconst userId = body.userId || '';\nconst currentOrganizationId = body.currentOrganizationId || null;\nconst sessionId = body.sessionId || userId;\nconst fileId = body.fileId || null;\n\nif (!message || !userId) {\n  throw new Error('message and userId are required');\n}\n\nreturn {\n  message: message,\n  userId: userId,\n  currentOrganizationId: currentOrganizationId,\n  sessionId: sessionId,\n  fileId: fileId\n};"
      },
      "id": "2c850012-a770-4472-aaea-9f79c86b28f2",
      "name": "Parse Input",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -2544,
        560
      ]
    },
    {
      "parameters": {
        "sessionIdType": "customKey",
        "sessionKey": "={{ $('Parse Input').first().json.sessionId }}",
        "collectionName": "messages",
        "databaseName": "ragchatbot",
        "contextWindowLength": 50
      },
      "type": "@n8n/n8n-nodes-langchain.memoryMongoDbChat",
      "typeVersion": 1,
      "position": [
        -1296,
        784
      ],
      "id": "e2beec32-ea77-40c7-8b23-2c68399575b8",
      "name": "MongoDB Chat Memory",
      "credentials": {
        "mongoDb": {
          "id": "qAoiLr4Y6fp9QH65",
          "name": "MongoDB account 3"
        }
      }
    },
    {
      "parameters": {
        "collection": "user_assignments",
        "options": {},
        "query": "={\"userId\": \"{{$json.userId}}\"}"
      },
      "type": "n8n-nodes-base.mongoDb",
      "typeVersion": 1.2,
      "position": [
        -2320,
        560
      ],
      "id": "5b2ea767-2c97-4ba7-a607-9589e7c9c6cd",
      "name": "Get User Assignments",
      "credentials": {
        "mongoDb": {
          "id": "qAoiLr4Y6fp9QH65",
          "name": "MongoDB account 3"
        }
      }
    },
    {
      "parameters": {
        "collection": "organizations",
        "options": {
          "projection": "{ \"path\": 1, \"name\": 1 }"
        },
        "query": "={\"_id\": \"{{ $json.organizationId }}\"}"
      },
      "type": "n8n-nodes-base.mongoDb",
      "typeVersion": 1.2,
      "position": [
        -2096,
        560
      ],
      "id": "70d02e5c-06b5-46a9-a776-26783a8ad876",
      "name": "Get Organization Hierarchy",
      "credentials": {
        "mongoDb": {
          "id": "qAoiLr4Y6fp9QH65",
          "name": "MongoDB account 3"
        }
      }
    },
    {
      "parameters": {
        "collection": "organizations",
        "options": {
          "projection": "{ \"_id\": 1 }"
        },
        "query": "={\n  \"path\": { \"$in\": [\"{{ $json.name }}\"] }\n}"
      },
      "type": "n8n-nodes-base.mongoDb",
      "typeVersion": 1.2,
      "position": [
        -1872,
        560
      ],
      "id": "cf458c0c-7704-4cf2-9913-110ee1572311",
      "name": "Get All Child Organizations",
      "credentials": {
        "mongoDb": {
          "id": "qAoiLr4Y6fp9QH65",
          "name": "MongoDB account 3"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const items = $input.all();\n\n// Extract all _id values\nconst hierarchyOrgIds = items.map(item => item.json._id);\n\nreturn [{\n  json: {\n    hierarchyOrgIds: hierarchyOrgIds\n  }\n}];"
      },
      "id": "d905f418-d064-4ad9-936d-defd9c9a3490",
      "name": "Build Hierarchy Array",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -1648,
        560
      ]
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "={{ $('Parse Input').first().json.message }}",
        "options": {
          "systemMessage": "You are Genie from GenCode, a helpful AI assistant with access to a knowledge base from uploaded documents.\n\n## Response Guidelines\n\n**Language**: Always respond in the SAME language as the user's question (English, Malay, Chinese, Tamil, etc.)\n\n**Format**: Use markdown formatting for better readability:\n- **Bold** for important terms\n- *Italic* for emphasis\n- `code` for technical terms\n- Bullet points for lists\n- Numbered lists for steps\n\n## Response Style - IMPORTANT\n\n**Conversational & Interactive Approach:**\n1. **Initial Response**: Provide a brief, concise answer (2-3 sentences max)\n2. **Follow-up Prompt**: End with an engaging question to encourage interaction:\n   - English: \"Would you like me to provide more details?\" / \"Shall I explain further?\" / \"Need more information about this?\"\n   - Malay: \"Nak saya terangkan dengan lebih lanjut?\" / \"Perlukan maklumat tambahan?\"\n   - Chinese: \"需要我提供更多详细信息吗？\" / \"要我进一步解释吗？\"\n   - Tamil: \"மேலும் விவரங்கள் தேவையா?\" / \"இதைப் பற்றி மேலும் விளக்க வேண்டுமா?\"\n\n3. **Detailed Response**: If user asks for more details, then provide comprehensive information with:\n   - Full explanations\n   - Step-by-step instructions\n   - Technical specifications\n   - Examples and use cases\n\n4. **DO NOT mention**:\n   - ❌ Page numbers (e.g., \"page 15\", \"halaman 10\")\n   - ❌ PDF names or document titles\n   - ❌ Source file references\n   - ❌ Tool names or technical details about retrieval\n   - ✅ Just provide the information naturally as if you know it\n\n## Knowledge Base Rules\n\n1. **General Questions**: Answer normally using your general knowledge (greetings, math, general facts, etc.)\n\n2. **Document-Specific Questions**: When users ask about specific information, products, manuals, or technical details:\n   - **ALWAYS** use the \"Search the knowledge base\" tool first\n   - **READ and UNDERSTAND** the retrieved content\n   - **SYNTHESIZE** the information into a natural, conversational response\n   - **DO NOT** just copy-paste or return raw data from the tool\n   - If information is found: Provide brief answer + follow-up question\n   - If NOT found in knowledge base: Respond with:\n     - English: \"I don't have information about that in the uploaded documents. Please upload the relevant document so I can help you better.\"\n     - Malay: \"Saya tidak mempunyai maklumat tentang itu dalam dokumen yang dimuat naik. Sila muat naik dokumen yang berkaitan supaya saya boleh membantu anda dengan lebih baik.\"\n     - Chinese: \"我在已上传的文档中没有找到相关信息。请上传相关文档，以便我能更好地帮助您。\"\n     - Tamil: \"பதிவேற்றப்பட்ட ஆவணங்களில் அதைப் பற்றிய தகவல் என்னிடம் இல்லை. நான் உங்களுக்கு சிறப்பாக உதவ தொடர்புடைய ஆவணத்தைப் பதிவேற்றவும்.\"\n\n3. **CRITICAL**: When you receive results from the knowledge base tool:\n   - Extract the relevant information from the pageContent\n   - Understand and process the content\n   - Respond in a natural, human-like way\n   - DO NOT return raw JSON or technical data\n   - DO NOT mention that you used a tool or searched a database\n\n4. **DO NOT** search external sources or make up information\n5. **DO NOT** answer document-specific questions without checking the knowledge base first\n6. **DO NOT** cite page numbers or document names - just provide the information naturally\n\n## Example Responses\n\n**Good - Initial Response**:\n- \"The **ioLogik E1210** is a Remote Ethernet I/O device with a 2-port Ethernet switch. Would you like me to explain its features in detail?\"\n- \"Model ini mempunyai **16 Digital Inputs**. Nak saya terangkan spesifikasi lain?\"\n- \"这个设备支持**Modbus TCP协议**。需要更多技术细节吗？\"\n\n**Good - Detailed Response (after user asks for more)**:\n- \"Sure! The ioLogik E1210 features:\n  - 16 Digital Inputs with 3000 VDC isolation\n  - 2-port Ethernet switch for daisy-chain topology\n  - Operating temperature: -40°C to 75°C\n  - Supports Modbus TCP and SNMP protocols\n  \n  Anything specific you'd like to know about?\"\n\n**Bad Examples**:\n- ❌ \"According to page 15 of the manual...\" (don't mention page numbers)\n- ❌ \"Based on the ioLogik_E1210_Manual.pdf...\" (don't mention file names)\n- ❌ \"[Used tools: Tool: Vector_Store_Retrieval, Input: ...]\" (don't show tool usage)\n- ❌ Returning raw JSON or pageContent data\n- ❌ Providing full detailed answer immediately without asking if user wants more\n\n## Conversation Flow\n\n```\nUser: \"What is the leave policy?\"\n[You use vector tool internally, get results about leave policy]\nBot: \"The company provides 14 days of annual leave per year. Want to know more about the application process?\"\n\nUser: \"Yes\"\nBot: \"Sure! To apply for leave:\n     - Submit through HR portal at least 7 days in advance\n     - Get department head approval\n     - Maximum 5 days of unused leave can be carried forward\n     \n     Need details about other types of leave?\"\n```\n\nBe helpful, conversational, and always encourage interaction!\n\nRemember: **Always respond in the SAME language as the user's question and NEVER expose technical details about tools or data retrieval!**\n",
          "enableStreaming": false
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [
        -1376,
        560
      ],
      "id": "0f74ce81-fe9b-402c-b270-14cd97aebc9a",
      "name": "AI Agent"
    },
    {
      "parameters": {
        "mode": "retrieve-as-tool",
        "toolDescription": "Search the knowledge base for information from uploaded documents. Use this when users ask questions about uploaded files or need specific information.",
        "mongoCollection": {
          "__rl": true,
          "value": "embedding_files",
          "mode": "name"
        },
        "vectorIndexName": "vector_index",
        "topK": 5,
        "options": {
          "preFilter": "={{ JSON.stringify({\n  sharedWith: { $in: [\"PUBLIC\", ...$json.hierarchyOrgIds] }\n}) }}"
        }
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas",
      "typeVersion": 1.3,
      "position": [
        -1168,
        784
      ],
      "id": "2ee79fce-6c64-48cf-a3dd-795b2af4c43b",
      "name": "Vector Store Retrieval",
      "credentials": {
        "mongoDb": {
          "id": "qAoiLr4Y6fp9QH65",
          "name": "MongoDB account 3"
        }
      }
    },
    {
      "parameters": {
        "options": {
          "maxOutputTokens": 2048,
          "temperature": 0.7
        }
      },
      "type": "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
      "typeVersion": 1,
      "position": [
        -1424,
        784
      ],
      "id": "3c6c166c-3c5f-4c55-b05d-7ddac08ebe75",
      "name": "Gemini 2.0 Flash",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "modelName": "models/gemini-embedding-001"
      },
      "type": "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
      "typeVersion": 1,
      "position": [
        -1088,
        992
      ],
      "id": "f7f3ddac-4329-48a6-a8f7-5f0a72177e5a",
      "name": "Gemini Embeddings",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ {\n  response: $json.output,\n  sessionId: $('Parse Input').first().json.sessionId\n} }}",
        "options": {}
      },
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.5,
      "position": [
        -800,
        560
      ],
      "id": "faa57b19-b2ab-4608-9e51-87136f915305",
      "name": "Respond to Webhook"
    }
  ],
  "connections": {
    "Webhook Chat": {
      "main": [
        [
          {
            "node": "Parse Input",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Parse Input": {
      "main": [
        [
          {
            "node": "Get User Assignments",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "MongoDB Chat Memory": {
      "ai_memory": [
        [
          {
            "node": "AI Agent",
            "type": "ai_memory",
            "index": 0
          }
        ]
      ]
    },
    "Get User Assignments": {
      "main": [
        [
          {
            "node": "Get Organization Hierarchy",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Organization Hierarchy": {
      "main": [
        [
          {
            "node": "Get All Child Organizations",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get All Child Organizations": {
      "main": [
        [
          {
            "node": "Build Hierarchy Array",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Build Hierarchy Array": {
      "main": [
        [
          {
            "node": "AI Agent",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "AI Agent": {
      "main": [
        [
          {
            "node": "Respond to Webhook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Vector Store Retrieval": {
      "ai_tool": [
        [
          {
            "node": "AI Agent",
            "type": "ai_tool",
            "index": 0
          }
        ]
      ]
    },
    "Gemini 2.0 Flash": {
      "ai_languageModel": [
        [
          {
            "node": "AI Agent",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    },
    "Gemini Embeddings": {
      "ai_embedding": [
        [
          {
            "node": "Vector Store Retrieval",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "meta": {
    "templateId": "4484",
    "templateCredsSetupCompleted": true,
    "instanceId": "749afbba9c6a9d23df7b16459183ee0d8cf1112b4ef6282f0b464180cfb645ea"
  }
}