{
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "chat",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "8c96d490-e935-4d9a-ae08-aa72641861c3",
      "name": "Webhook Chat",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [
        880,
        5792
      ],
      "webhookId": "chat-webhook"
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}",
        "options": {}
      },
      "id": "7cc3fd76-ba95-45ce-9f7d-f4a59ed8f5de",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [
        3872,
        5792
      ]
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "upload",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "ad85420e-fb58-4d69-86f5-82d87eddfd39",
      "name": "Webhook Upload",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [
        880,
        6864
      ],
      "webhookId": "65ffbe5b-834e-4dd2-b1f0-dcc7e9c14604"
    },
    {
      "parameters": {
        "jsCode": "const body = $input.item.json.body;\nconst fileId = body.fileId;\nconst userId = body.userId;\nconst organizationId = body.organizationId || null;\nconst departmentId = body.departmentId || null;\nconst fileName = body.fileName || 'unknown';\nconst fileUrl = body.fileUrl;\n\nif (!fileId || !fileUrl || !userId) {\n  throw new Error('fileId, fileUrl, and userId are required');\n}\n\nlet bucket, key;\nif (fileUrl.startsWith('https://')) {\n  const urlParts = fileUrl.replace('https://', '').split('/');\n  const domain = urlParts[0];\n  if (domain.includes('.s3.')) {\n    bucket = domain.split('.')[0];\n    key = urlParts.slice(1).join('/');\n  }\n}\n\nif (!bucket || !key) {\n  throw new Error('Invalid S3 URL format');\n}\n\nreturn {\n  fileId,\n  userId,\n  organizationId,\n  departmentId,\n  fileName,\n  s3Bucket: bucket,\n  s3Key: key\n};"
      },
      "id": "f379f7fa-54ac-4c12-b56e-b22c41487bb8",
      "name": "Parse S3 URL",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1104,
        6864
      ]
    },
    {
      "parameters": {
        "bucketName": "={{ $json.s3Bucket }}",
        "fileKey": "={{ $json.s3Key }}"
      },
      "id": "19ea8b18-0cdb-498a-8372-81dc96bf3b76",
      "name": "AWS S3 Download",
      "type": "n8n-nodes-base.awsS3",
      "typeVersion": 1,
      "position": [
        1328,
        6864
      ],
      "credentials": {
        "aws": {
          "id": "Enrhl4TtlJcrQyzI",
          "name": "AWS (IAM) account"
        }
      }
    },
    {
      "parameters": {
        "dataType": "binary",
        "textSplittingMode": "custom",
        "options": {
          "splitPages": true,
          "metadata": {
            "metadataValues": [
              {
                "name": "fileId",
                "value": "={{ $('Parse S3 URL').item.json.fileId }}"
              },
              {
                "name": "userId",
                "value": "={{ $('Parse S3 URL').item.json.userId }}"
              },
              {
                "name": "organizationId",
                "value": "={{ $('Parse S3 URL').item.json.organizationId }}"
              },
              {
                "name": "departmentId",
                "value": "={{ $('Parse S3 URL').item.json.departmentId }}"
              },
              {
                "name": "fileName",
                "value": "={{ $('Parse S3 URL').item.json.fileName }}"
              },
              {
                "name": "uploadedAt",
                "value": "={{ $now.toISO() }}"
              }
            ]
          }
        }
      },
      "type": "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
      "typeVersion": 1.1,
      "position": [
        1680,
        7088
      ],
      "id": "8a18bfef-f10f-44dd-9417-7f88e480fb69",
      "name": "Document Loader"
    },
    {
      "parameters": {
        "chunkOverlap": 200,
        "options": {}
      },
      "type": "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
      "typeVersion": 1,
      "position": [
        1760,
        7296
      ],
      "id": "e3d5d228-e369-47ca-9a58-5d00f1c3d861",
      "name": "Text Splitter"
    },
    {
      "parameters": {
        "modelName": "=models/gemini-embedding-001"
      },
      "type": "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
      "typeVersion": 1,
      "position": [
        1552,
        7088
      ],
      "id": "d052bf09-d631-451d-af18-2daa569d6d70",
      "name": "Embeddings",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "mode": "insert",
        "mongoCollection": {
          "__rl": true,
          "value": "embedding_files",
          "mode": "name"
        },
        "vectorIndexName": "rag_vector_search_1",
        "options": {}
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas",
      "typeVersion": 1.3,
      "position": [
        1584,
        6864
      ],
      "id": "ad313b36-4b71-4015-b702-e2e4cd144c64",
      "name": "Vector Store",
      "credentials": {
        "mongoDb": {
          "id": "DTUm7hRi7TfDKEcE",
          "name": "MongoDB account 2"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const chunks = $input.all();\nconst first = $input.first().json;\nreturn {\n  success: true,\n  message: 'File embedded successfully',\n  fileId: first.metadata?.fileId,\n  fileName: first.metadata?.fileName,\n  chunks: chunks.length\n};"
      },
      "id": "7d349c7a-f31f-41b0-96d8-3adc147a1e40",
      "name": "Format Response1",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        2048,
        6864
      ]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}",
        "options": {}
      },
      "id": "53fa80ad-6599-43c1-88ea-dd646fe0f369",
      "name": "Respond1",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [
        2272,
        6864
      ]
    },
    {
      "parameters": {
        "sessionIdType": "customKey",
        "sessionKey": "={{ $json.sessionId }}",
        "collectionName": "messages",
        "databaseName": "ragchatbot",
        "contextWindowLength": 50
      },
      "type": "@n8n/n8n-nodes-langchain.memoryMongoDbChat",
      "typeVersion": 1,
      "position": [
        3152,
        5504
      ],
      "id": "e50d2389-98dd-4068-8364-b2071cf97097",
      "name": "MongoDB Chat Memory1",
      "credentials": {
        "mongoDb": {
          "id": "DTUm7hRi7TfDKEcE",
          "name": "MongoDB account 2"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const body = $input.item.json.body;\nconst message = body.message || '';\nconst userId = body.userId || '';\nconst organizationId = body.organizationId || null;\nconst departmentId = body.departmentId || null;\nconst sessionId = body.sessionId || userId;\nconst fileId = body.fileId || null;\n\nif (!message || !userId) {\n  throw new Error('message and userId are required');\n}\n\nreturn {\n  message: message,\n  userId: userId,\n  organizationId: organizationId,\n  departmentId: departmentId,\n  sessionId: sessionId,\n  fileId: fileId\n};"
      },
      "id": "6c534f89-c587-4982-83e5-9b36c053d53b",
      "name": "Parse Input",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1104,
        5792
      ]
    },
    {
      "parameters": {
        "jsCode": "const aiOutput = $input.item.json.output || $input.item.json.text || 'No response generated';\n\nreturn {\n  response: aiOutput\n};"
      },
      "id": "ba0ab044-b336-47ba-898c-e8c17e74fda5",
      "name": "Format History",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        3648,
        5792
      ]
    },
    {
      "parameters": {
        "jsCode": "const parseData = $input.item.json;\n\n// Build vector search filter\nlet vectorFilter = {};\nlet vectorFilterorg = {};\n\n// Organization filter\n/**if (parseData.organizationId !== null) {\n  vectorFilter['organizationId'] = parseData.organizationId;\n  vectorFilterorg['organizationId'] = parseData.organizationId;\n}**/\nif (parseData.organizationId !== null) {\n  vectorFilter['$or'] = [\n    { organizationId: parseData.organizationId },\n    { organizationId: null }  // Include general knowledge\n  ];\n  vectorFilterorg['$or'] = [\n    { organizationId: parseData.organizationId },\n    { organizationId: null }\n  ];\n}\nif (parseData.departmentId !== null) {\n  vectorFilter['departmentId'] = parseData.departmentId;\n}\n// File filter\nif (parseData.fileId) {\n  vectorFilter['fileId'] = parseData.fileId;\n  vectorFilterorg['fileId'] = parseData.fileId;\n}\n\nreturn {\n  chatInput: parseData.message,\n  userId: parseData.userId,\n  organizationId: parseData.organizationId,\n  departmentId: parseData.departmentId,\n  sessionId: parseData.sessionId,\n  vectorFilter: JSON.stringify(vectorFilter),\n  vectorFilterOrg: JSON.stringify(vectorFilterorg)\n};"
      },
      "id": "b3add33b-e25f-45e8-a8ca-d1a0e21dc617",
      "name": "Format History1",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1328,
        5792
      ]
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "={{ $json.chatInput }}",
        "options": {
          "systemMessage": "You are Genie from GenCode, a helpful AI assistant with access to a knowledge base from uploaded documents.\n\n## Response Guidelines\n\n**Language**: Always respond in the SAME language as the user's question (English, Malay, Chinese, Tamil, etc.)\n\n**Format**: Use markdown formatting for better readability:\n- **Bold** for important terms\n- *Italic* for emphasis\n- `code` for technical terms\n- Bullet points for lists\n- Numbered lists for steps\n\n## Response Style - IMPORTANT\n\n**Conversational & Interactive Approach:**\n1. **Initial Response**: Provide a brief, concise answer (2-3 sentences max)\n2. **Follow-up Prompt**: End with an engaging question to encourage interaction:\n   - English: \"Would you like me to provide more details?\" / \"Shall I explain further?\" / \"Need more information about this?\"\n   - Malay: \"Nak saya terangkan dengan lebih lanjut?\" / \"Perlukan maklumat tambahan?\"\n   - Chinese: \"需要我提供更多详细信息吗？\" / \"要我进一步解释吗？\"\n   - Tamil: \"மேலும் விவரங்கள் தேவையா?\" / \"இதைப் பற்றி மேலும் விளக்க வேண்டுமா?\"\n\n3. **Detailed Response**: If user asks for more details, then provide comprehensive information with:\n   - Full explanations\n   - Step-by-step instructions\n   - Technical specifications\n   - Examples and use cases\n\n4. **DO NOT mention**:\n   - ❌ Page numbers (e.g., \"page 15\", \"halaman 10\")\n   - ❌ PDF names or document titles\n   - ❌ Source file references\n   - ❌ Tool names or technical details about retrieval\n   - ✅ Just provide the information naturally as if you know it\n\n## Knowledge Base Rules\n\n1. **General Questions**: Answer normally using your general knowledge (greetings, math, general facts, etc.)\n\n2. **Document-Specific Questions**: When users ask about specific information, products, manuals, or technical details:\n   - **ALWAYS** use the \"Search the knowledge base\" tool first\n   - **READ and UNDERSTAND** the retrieved content\n   - **SYNTHESIZE** the information into a natural, conversational response\n   - **DO NOT** just copy-paste or return raw data from the tool\n   - If information is found: Provide brief answer + follow-up question\n   - If NOT found in knowledge base: Respond with:\n     - English: \"I don't have information about that in the uploaded documents. Please upload the relevant document so I can help you better.\"\n     - Malay: \"Saya tidak mempunyai maklumat tentang itu dalam dokumen yang dimuat naik. Sila muat naik dokumen yang berkaitan supaya saya boleh membantu anda dengan lebih baik.\"\n     - Chinese: \"我在已上传的文档中没有找到相关信息。请上传相关文档，以便我能更好地帮助您。\"\n     - Tamil: \"பதிவேற்றப்பட்ட ஆவணங்களில் அதைப் பற்றிய தகவல் என்னிடம் இல்லை. நான் உங்களுக்கு சிறப்பாக உதவ தொடர்புடைய ஆவணத்தைப் பதிவேற்றவும்.\"\n\n3. **CRITICAL**: When you receive results from the knowledge base tool:\n   - Extract the relevant information from the pageContent\n   - Understand and process the content\n   - Respond in a natural, human-like way\n   - DO NOT return raw JSON or technical data\n   - DO NOT mention that you used a tool or searched a database\n\n4. **DO NOT** search external sources or make up information\n5. **DO NOT** answer document-specific questions without checking the knowledge base first\n6. **DO NOT** cite page numbers or document names - just provide the information naturally\n\n## Example Responses\n\n**Good - Initial Response**:\n- \"The **ioLogik E1210** is a Remote Ethernet I/O device with a 2-port Ethernet switch. Would you like me to explain its features in detail?\"\n- \"Model ini mempunyai **16 Digital Inputs**. Nak saya terangkan spesifikasi lain?\"\n- \"这个设备支持**Modbus TCP协议**。需要更多技术细节吗？\"\n\n**Good - Detailed Response (after user asks for more)**:\n- \"Sure! The ioLogik E1210 features:\n  - 16 Digital Inputs with 3000 VDC isolation\n  - 2-port Ethernet switch for daisy-chain topology\n  - Operating temperature: -40°C to 75°C\n  - Supports Modbus TCP and SNMP protocols\n  \n  Anything specific you'd like to know about?\"\n\n**Bad Examples**:\n- ❌ \"According to page 15 of the manual...\" (don't mention page numbers)\n- ❌ \"Based on the ioLogik_E1210_Manual.pdf...\" (don't mention file names)\n- ❌ \"[Used tools: Tool: Vector_Store_Retrieval, Input: ...]\" (don't show tool usage)\n- ❌ Returning raw JSON or pageContent data\n- ❌ Providing full detailed answer immediately without asking if user wants more\n\n## Conversation Flow\n\n```\nUser: \"What is the leave policy?\"\n[You use vector tool internally, get results about leave policy]\nBot: \"The company provides 14 days of annual leave per year. Want to know more about the application process?\"\n\nUser: \"Yes\"\nBot: \"Sure! To apply for leave:\n     - Submit through HR portal at least 7 days in advance\n     - Get department head approval\n     - Maximum 5 days of unused leave can be carried forward\n     \n     Need details about other types of leave?\"\n```\n\nBe helpful, conversational, and always encourage interaction!\n\nRemember: **Always respond in the SAME language as the user's question and NEVER expose technical details about tools or data retrieval!**\n",
          "enableStreaming": false
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [
        3088,
        5280
      ],
      "id": "20479e07-57f4-4a00-b734-0497e5265df6",
      "name": "AI Agent1"
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "e3fd5f86-37a0-4a8b-8e9c-9855848517ef",
              "leftValue": "={{ $json.output }}",
              "rightValue": "YES",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        2800,
        5792
      ],
      "id": "45bbd1f1-8fb9-40f4-9f20-d0b006c5ddb2",
      "name": "If"
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
        "vectorIndexName": "rag_vector_search_1",
        "topK": 5,
        "options": {
          "preFilter": "={{ $json.vectorFilter }}"
        }
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas",
      "typeVersion": 1.3,
      "position": [
        3280,
        5504
      ],
      "id": "fa0bd96d-d409-4574-8108-99642d752c97",
      "name": "Vector Store Retrieval1",
      "credentials": {
        "mongoDb": {
          "id": "DTUm7hRi7TfDKEcE",
          "name": "MongoDB account 2"
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
        3360,
        5712
      ],
      "id": "285d025f-6731-45dc-920c-1e9e15e9535d",
      "name": "Gemini Embeddings1",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
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
        3024,
        5504
      ],
      "id": "69d82620-f468-45e6-bd79-aa386676a8d8",
      "name": "Gemini 2.0 Flash2",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "={{ $json.chatInput }}",
        "options": {
          "systemMessage": "You are Genie from GenCode, a helpful AI assistant with access to a knowledge base from uploaded documents.\n\n## Response Guidelines\n\n**Language**: Always respond in the SAME language as the user's question (English, Malay, Chinese, Tamil, etc.)\n\n**Format**: Use markdown formatting for better readability:\n- **Bold** for important terms\n- *Italic* for emphasis\n- `code` for technical terms\n- Bullet points for lists\n- Numbered lists for steps\n\n## Response Style - IMPORTANT\n\n**Conversational & Interactive Approach:**\n1. **Initial Response**: Provide a brief, concise answer (2-3 sentences max)\n2. **Follow-up Prompt**: End with an engaging question to encourage interaction:\n   - English: \"Would you like me to provide more details?\" / \"Shall I explain further?\" / \"Need more information about this?\"\n   - Malay: \"Nak saya terangkan dengan lebih lanjut?\" / \"Perlukan maklumat tambahan?\"\n   - Chinese: \"需要我提供更多详细信息吗？\" / \"要我进一步解释吗？\"\n   - Tamil: \"மேலும் விவரங்கள் தேவையா?\" / \"இதைப் பற்றி மேலும் விளக்க வேண்டுமா?\"\n\n3. **Detailed Response**: If user asks for more details, then provide comprehensive information with:\n   - Full explanations\n   - Step-by-step instructions\n   - Technical specifications\n   - Examples and use cases\n\n4. **DO NOT mention**:\n   - ❌ Page numbers (e.g., \"page 15\", \"halaman 10\")\n   - ❌ PDF names or document titles\n   - ❌ Source file references\n   - ❌ Tool names or technical details about retrieval\n   - ✅ Just provide the information naturally as if you know it\n\n## Knowledge Base Rules\n\n1. **General Questions**: Answer normally using your general knowledge (greetings, math, general facts, etc.)\n\n2. **Document-Specific Questions**: When users ask about specific information, products, manuals, or technical details:\n   - **ALWAYS** use the \"Search the knowledge base\" tool first\n   - **READ and UNDERSTAND** the retrieved content\n   - **SYNTHESIZE** the information into a natural, conversational response\n   - **DO NOT** just copy-paste or return raw data from the tool\n   - If information is found: Provide brief answer + follow-up question\n   - If NOT found in knowledge base: Respond with:\n     - English: \"I don't have information about that in the uploaded documents. Please upload the relevant document so I can help you better.\"\n     - Malay: \"Saya tidak mempunyai maklumat tentang itu dalam dokumen yang dimuat naik. Sila muat naik dokumen yang berkaitan supaya saya boleh membantu anda dengan lebih baik.\"\n     - Chinese: \"我在已上传的文档中没有找到相关信息。请上传相关文档，以便我能更好地帮助您。\"\n     - Tamil: \"பதிவேற்றப்பட்ட ஆவணங்களில் அதைப் பற்றிய தகவல் என்னிடம் இல்லை. நான் உங்களுக்கு சிறப்பாக உதவ தொடர்புடைய ஆவணத்தைப் பதிவேற்றவும்.\"\n\n3. **CRITICAL**: When you receive results from the knowledge base tool:\n   - Extract the relevant information from the pageContent\n   - Understand and process the content\n   - Respond in a natural, human-like way\n   - DO NOT return raw JSON or technical data\n   - DO NOT mention that you used a tool or searched a database\n\n4. **DO NOT** search external sources or make up information\n5. **DO NOT** answer document-specific questions without checking the knowledge base first\n6. **DO NOT** cite page numbers or document names - just provide the information naturally\n\n## Example Responses\n\n**Good - Initial Response**:\n- \"The **ioLogik E1210** is a Remote Ethernet I/O device with a 2-port Ethernet switch. Would you like me to explain its features in detail?\"\n- \"Model ini mempunyai **16 Digital Inputs**. Nak saya terangkan spesifikasi lain?\"\n- \"这个设备支持**Modbus TCP协议**。需要更多技术细节吗？\"\n\n**Good - Detailed Response (after user asks for more)**:\n- \"Sure! The ioLogik E1210 features:\n  - 16 Digital Inputs with 3000 VDC isolation\n  - 2-port Ethernet switch for daisy-chain topology\n  - Operating temperature: -40°C to 75°C\n  - Supports Modbus TCP and SNMP protocols\n  \n  Anything specific you'd like to know about?\"\n\n**Bad Examples**:\n- ❌ \"According to page 15 of the manual...\" (don't mention page numbers)\n- ❌ \"Based on the ioLogik_E1210_Manual.pdf...\" (don't mention file names)\n- ❌ \"[Used tools: Tool: Vector_Store_Retrieval, Input: ...]\" (don't show tool usage)\n- ❌ Returning raw JSON or pageContent data\n- ❌ Providing full detailed answer immediately without asking if user wants more\n\n## Conversation Flow\n\n```\nUser: \"What is the leave policy?\"\n[You use vector tool internally, get results about leave policy]\nBot: \"The company provides 14 days of annual leave per year. Want to know more about the application process?\"\n\nUser: \"Yes\"\nBot: \"Sure! To apply for leave:\n     - Submit through HR portal at least 7 days in advance\n     - Get department head approval\n     - Maximum 5 days of unused leave can be carried forward\n     \n     Need details about other types of leave?\"\n```\n\nBe helpful, conversational, and always encourage interaction!\n\nRemember: **Always respond in the SAME language as the user's question and NEVER expose technical details about tools or data retrieval!**\n",
          "enableStreaming": false
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [
        3088,
        6096
      ],
      "id": "aa78195a-2643-43fc-9eb1-2c26031070f3",
      "name": "AI Agent3"
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
        "vectorIndexName": "rag_vector_search_1",
        "topK": 5,
        "options": {
          "preFilter": "={{ $json.vectorFilterOrg }}"
        }
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas",
      "typeVersion": 1.3,
      "position": [
        3280,
        6320
      ],
      "id": "305ae97b-4cc1-4e83-b71d-e227ae71dfea",
      "name": "Vector Store Retrieval2",
      "credentials": {
        "mongoDb": {
          "id": "DTUm7hRi7TfDKEcE",
          "name": "MongoDB account 2"
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
        3360,
        6528
      ],
      "id": "0ca6b45f-af94-4247-89f9-de1ea87b019e",
      "name": "Gemini Embeddings2",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
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
        3024,
        6320
      ],
      "id": "193935c7-9247-4c64-8365-b026d8f2afc9",
      "name": "Gemini 2.0 Flash3",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const base = $items(\"Format History1\")[0].json;   // data asal: chatInput, vectorFilter, dll\nreturn [\n  {\n    json: {\n      ...base,\n      output: $json.output, // YES/NO dari AI Agent2\n    }\n  }\n];\n"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        2576,
        5792
      ],
      "id": "4762e4fe-6c10-4023-a13b-2988fa9334c0",
      "name": "Attach Context"
    },
    {
      "parameters": {
        "modelName": "models/gemini-embedding-001"
      },
      "type": "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
      "typeVersion": 1,
      "position": [
        1856,
        5776
      ],
      "id": "19f1b03a-14ba-4ace-a4ad-d935318e6f3b",
      "name": "Gemini Embeddings3",
      "credentials": {
        "googlePalmApi": {
          "id": "ZAOAdLszpQe1usS9",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "mode": "load",
        "mongoCollection": {
          "__rl": true,
          "value": "embedding_files",
          "mode": "list",
          "cachedResultName": "embedding_files"
        },
        "vectorIndexName": "rag_vector_search_1",
        "prompt": "={{ $json.chatInput }}",
        "topK": 1,
        "includeDocumentMetadata": false,
        "options": {
          "preFilter": "={{ $json.vectorFilter }}"
        }
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas",
      "typeVersion": 1.3,
      "position": [
        1776,
        5552
      ],
      "id": "b5151694-e06d-4ec4-9f59-b0b3a9519c6e",
      "name": "MongoDB Atlas Vector Store decide",
      "notesInFlow": false,
      "credentials": {
        "mongoDb": {
          "id": "DTUm7hRi7TfDKEcE",
          "name": "MongoDB account 2"
        }
      }
    },
    {
      "parameters": {},
      "type": "n8n-nodes-base.merge",
      "typeVersion": 3.2,
      "position": [
        2128,
        5792
      ],
      "id": "cf7990c5-25cc-4405-ad3d-9b62a32230ab",
      "name": "Merge"
    },
    {
      "parameters": {
        "jsCode": "return [\n  {\n    json: { output: \"NO\" }\n  }\n];\n\n"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1840,
        5952
      ],
      "id": "805bdde9-fac3-4a87-8bb8-d714cad81c6e",
      "name": "NO code dummy"
    },
    {
      "parameters": {
        "jsCode": "const score = $('MongoDB Atlas Vector Store decide').first()?.json?.score;\n\nconst output = (typeof score === \"number\") ? \"YES\" : \"NO\";\n\nreturn [{ json: { output } }];\n\n"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        2352,
        5792
      ],
      "id": "bc4025bb-7fc3-4322-84fe-21db6a0c5388",
      "name": "decide NO/YES"
    },
    {
      "parameters": {
        "sessionIdType": "customKey",
        "sessionKey": "={{ $json.sessionId }}",
        "collectionName": "messages",
        "databaseName": "ragchatbot",
        "contextWindowLength": 50
      },
      "type": "@n8n/n8n-nodes-langchain.memoryMongoDbChat",
      "typeVersion": 1,
      "position": [
        3152,
        6320
      ],
      "id": "81494034-188d-4ce7-b314-32b5fbd107c0",
      "name": "MongoDB Chat Memory",
      "credentials": {
        "mongoDb": {
          "id": "DTUm7hRi7TfDKEcE",
          "name": "MongoDB account 2"
        }
      }
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "form-submission-handler",
        "options": {}
      },
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [
        928,
        6384
      ],
      "id": "91a78479-400c-438b-8586-3c16aca88e64",
      "name": "Webhook form",
      "webhookId": "74e478a7-151d-418b-83ed-31fad6f9ea42"
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
    "Webhook Upload": {
      "main": [
        [
          {
            "node": "Parse S3 URL",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Parse S3 URL": {
      "main": [
        [
          {
            "node": "AWS S3 Download",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "AWS S3 Download": {
      "main": [
        [
          {
            "node": "Vector Store",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Document Loader": {
      "ai_document": [
        [
          {
            "node": "Vector Store",
            "type": "ai_document",
            "index": 0
          }
        ]
      ]
    },
    "Text Splitter": {
      "ai_textSplitter": [
        [
          {
            "node": "Document Loader",
            "type": "ai_textSplitter",
            "index": 0
          }
        ]
      ]
    },
    "Embeddings": {
      "ai_embedding": [
        [
          {
            "node": "Vector Store",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    },
    "Vector Store": {
      "main": [
        [
          {
            "node": "Format Response1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Response1": {
      "main": [
        [
          {
            "node": "Respond1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "MongoDB Chat Memory1": {
      "ai_memory": [
        [
          {
            "node": "AI Agent1",
            "type": "ai_memory",
            "index": 0
          }
        ]
      ]
    },
    "Parse Input": {
      "main": [
        [
          {
            "node": "Format History1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format History": {
      "main": [
        [
          {
            "node": "Respond",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format History1": {
      "main": [
        [
          {
            "node": "MongoDB Atlas Vector Store decide",
            "type": "main",
            "index": 0
          },
          {
            "node": "NO code dummy",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "AI Agent1": {
      "main": [
        [
          {
            "node": "Format History",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "If": {
      "main": [
        [
          {
            "node": "AI Agent1",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "AI Agent3",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Vector Store Retrieval1": {
      "ai_tool": [
        [
          {
            "node": "AI Agent1",
            "type": "ai_tool",
            "index": 0
          }
        ]
      ]
    },
    "Gemini Embeddings1": {
      "ai_embedding": [
        [
          {
            "node": "Vector Store Retrieval1",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    },
    "Gemini 2.0 Flash2": {
      "ai_languageModel": [
        [
          {
            "node": "AI Agent1",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    },
    "AI Agent3": {
      "main": [
        [
          {
            "node": "Format History",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Vector Store Retrieval2": {
      "ai_tool": [
        [
          {
            "node": "AI Agent3",
            "type": "ai_tool",
            "index": 0
          }
        ]
      ]
    },
    "Gemini Embeddings2": {
      "ai_embedding": [
        [
          {
            "node": "Vector Store Retrieval2",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    },
    "Gemini 2.0 Flash3": {
      "ai_languageModel": [
        [
          {
            "node": "AI Agent3",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    },
    "Attach Context": {
      "main": [
        [
          {
            "node": "If",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Gemini Embeddings3": {
      "ai_embedding": [
        [
          {
            "node": "MongoDB Atlas Vector Store decide",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    },
    "MongoDB Atlas Vector Store decide": {
      "main": [
        [
          {
            "node": "Merge",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Merge": {
      "main": [
        [
          {
            "node": "decide NO/YES",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "NO code dummy": {
      "main": [
        [
          {
            "node": "Merge",
            "type": "main",
            "index": 1
          }
        ]
      ]
    },
    "decide NO/YES": {
      "main": [
        [
          {
            "node": "Attach Context",
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
            "node": "AI Agent3",
            "type": "ai_memory",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "749afbba9c6a9d23df7b16459183ee0d8cf1112b4ef6282f0b464180cfb645ea"
  }
}