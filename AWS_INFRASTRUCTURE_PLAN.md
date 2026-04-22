# Genia RAG Chatbot — AWS Infrastructure Plan

**Prepared by:** Engineering Team  
**Date:** 22 April 2026  
**Product:** Genia AI Assistant (Multi-Tenant SaaS)

---

## 1. Architecture Overview

```
                    ┌─────────────────────┐
   Users ──────►   │   Cloudflare Tunnel  │   (Free)
                    │  genia.gencode.com.my│
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Gateway Server     │   (AWS EC2)
                    │   - Routing          │
                    │   - Auth Proxy       │
                    │   - Tenant Registry  │
                    └──────────┬──────────┘
                               │ Internal Network
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
         ┌────────────┐ ┌────────────┐ ┌────────────┐
         │  Tenant     │ │  Tenant     │ │  Tenant     │
         │  Server 1   │ │  Server 2   │ │  Server 3   │
         │  (5-15      │ │  (5-15      │ │  (5-15      │
         │   tenants)  │ │   tenants)  │ │   tenants)  │
         └────────────┘ └────────────┘ └────────────┘
```

- **Gateway Server** — Single entry point. Routes all user traffic to the correct tenant server. No direct public access to tenant servers.
- **Tenant Server** — Runs the AI chatbot application, MongoDB, and Qdrant vector database per server. Each server hosts multiple tenants (clients).
- **Cloudflare Tunnel** — Provides HTTPS and domain binding without exposing server IPs. Free tier.

---

## 2. Gateway Server Specification

The gateway is lightweight — it only proxies requests and manages the tenant registry.

| Component       | Detail                |
|-----------------|-----------------------|
| **Instance**    | t3.small              |
| **vCPU**        | 2                     |
| **RAM**         | 2 GB                  |
| **Storage**     | 20 GB (gp3 SSD)      |
| **OS**          | Amazon Linux 2023     |
| **Services**    | Node.js, MongoDB      |

**Estimated Monthly Cost: ~USD 15–18**

---

## 3. Tenant Server Specifications

Each tenant server runs the full application stack per client. The required specs depend on the number of tenants hosted per server.

### Services per Tenant Server

| Service         | Purpose                          | RAM Usage        |
|-----------------|----------------------------------|------------------|
| Node.js App     | Chat API, file processing        | ~50–100 MB/tenant |
| MongoDB         | User data, chat history, settings| ~200–500 MB/tenant|
| Qdrant          | Vector search for RAG            | ~100–300 MB/tenant|
| n8n (optional)  | Workflow automation              | ~200 MB (shared)  |

### Recommended Instance by Tenant Count

| Tenants/Server | Instance     | vCPU | RAM    | Storage     | Est. Monthly Cost |
|----------------|-------------|------|--------|-------------|-------------------|
| 5              | t3.medium   | 2    | 4 GB   | 50 GB gp3   | ~USD 30–35        |
| 10             | t3.large    | 2    | 8 GB   | 100 GB gp3  | ~USD 60–70        |
| 15             | m6i.large   | 2    | 8 GB   | 150 GB gp3  | ~USD 70–80        |
| 50             | m6i.xlarge  | 4    | 16 GB  | 300 GB gp3  | ~USD 140–160      |

> **Note:** RAM is the primary constraint, not CPU. AI processing (LLM, embedding) is handled by external APIs (Google Gemini, Mistral), not on the server.

---

## 4. Total Infrastructure Cost Estimates

### Scenario A: 5 Tenants (Starter)

| Resource              | Spec          | Monthly Cost  |
|-----------------------|---------------|---------------|
| Gateway Server        | t3.small      | USD 18        |
| Tenant Server × 1     | t3.medium     | USD 35        |
| Cloudflare Tunnel     | Free tier     | USD 0         |
| **Total**             |               | **~USD 53**   |

### Scenario B: 10 Tenants

| Resource              | Spec          | Monthly Cost  |
|-----------------------|---------------|---------------|
| Gateway Server        | t3.small      | USD 18        |
| Tenant Server × 1     | t3.large      | USD 70        |
| Cloudflare Tunnel     | Free tier     | USD 0         |
| **Total**             |               | **~USD 88**   |

### Scenario C: 15 Tenants

| Resource              | Spec          | Monthly Cost  |
|-----------------------|---------------|---------------|
| Gateway Server        | t3.small      | USD 18        |
| Tenant Server × 1     | m6i.large     | USD 80        |
| Cloudflare Tunnel     | Free tier     | USD 0         |
| **Total**             |               | **~USD 98**   |

### Scenario D: 50 Tenants

| Resource              | Spec          | Monthly Cost  |
|-----------------------|---------------|---------------|
| Gateway Server        | t3.small      | USD 18        |
| Tenant Server × 3     | m6i.xlarge    | USD 480       |
| Cloudflare Tunnel     | Free tier     | USD 0         |
| **Total**             |               | **~USD 498**  |

---

## 5. Additional Costs to Consider

| Item                          | Cost                          | Notes                              |
|-------------------------------|-------------------------------|------------------------------------|
| **Gemini API** (LLM + Embed) | Pay-per-use                   | ~USD 0.01–0.05 per chat session    |
| **Mistral API** (OCR)        | Pay-per-use                   | ~USD 0.01–0.03 per document page   |
| **Data Transfer (AWS)**       | First 100 GB/month free       | Minimal for text-based chat        |
| **Elastic IP**                | Free if attached to instance  | 1 per server                       |
| **Backups (EBS Snapshots)**   | ~USD 0.05/GB/month            | Recommended for production         |
| **Domain (Cloudflare)**       | Existing                      | genia.gencode.com.my               |

---

## 6. Cost Optimization Strategies

| Strategy                    | Savings       | Detail                                      |
|-----------------------------|---------------|----------------------------------------------|
| **Reserved Instances (1yr)**| 30–40%        | Commit to 1-year term for predictable usage  |
| **Savings Plans (1yr)**     | ~30%          | More flexible than Reserved Instances        |
| **gp3 Storage**             | 20% vs gp2    | Better performance at lower cost             |
| **Start Small, Scale Up**   | —             | Begin with t3.medium, resize when needed     |
| **Spot Instances (dev/test)**| Up to 90%    | For non-production environments only         |

---

## 7. Scaling Strategy

```
Phase 1 (Launch):     1 Gateway + 1 Tenant Server     →  5–10 tenants
Phase 2 (Growth):     1 Gateway + 2 Tenant Servers    →  15–25 tenants
Phase 3 (Scale):      1 Gateway + 3–5 Tenant Servers  →  50+ tenants
```

- Adding new tenant servers requires **zero downtime** — just add a new EC2 instance and register it in the gateway admin panel.
- Tenants can be migrated between servers if needed.
- Gateway server does not need to scale — a single t3.small handles hundreds of concurrent users.

---

## 8. Summary

| Question                        | Answer                                              |
|---------------------------------|-----------------------------------------------------|
| Minimum to start?               | 2 servers (1 gateway + 1 tenant) — ~USD 53/month    |
| Can we scale without downtime?  | Yes, add new tenant servers anytime                  |
| What's the biggest cost?        | Tenant server RAM (MongoDB + Qdrant)                 |
| AI API costs?                   | Pay-per-use, scales with actual usage                |
| Can we reduce costs later?      | Yes, Reserved Instances save 30–40%                  |

---

*All prices are estimates based on AWS ap-southeast-1 (Singapore) region pricing as of April 2026. Actual costs may vary. Refer to [AWS Pricing Calculator](https://calculator.aws.amazon.com/) for exact figures.*
