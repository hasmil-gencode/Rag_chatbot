# Mandatory Fields Setup Guide

## Overview

Mandatory Fields forces AI to collect specific information from users before giving recommendations. This ensures consistent, quality conversations regardless of how the AI "feels" on any given query.

**Location:** Organizations page → Edit org → Mandatory Fields section

---

## How It Works

```
User sends message
  → Code checks: what fields are collected from conversation?
  → Missing required field? → Injects instruction: "ASK THIS NOW, DO NOT RECOMMEND"
  → All collected? → AI responds freely with recommendations
```

AI **cannot skip** mandatory fields — enforced by code, not by hoping AI follows instructions.

---

## Field Configuration

Each field has 3 parts:

| Column | What to fill | Example |
|--------|-------------|---------|
| **Field Name** | Short identifier (no spaces) | `occupation`, `budget`, `house_type` |
| **Description** | What AI should ask for | `job title or industry`, `monthly budget range` |
| **Required For** | When this field is needed | `always`, `find_plan`, `booking,support` |

### Required For values:
- `always` — ask this every time, regardless of intent
- `intent_name` — only ask when user's intent matches
- `intent1,intent2` — ask for multiple intents (comma separated)

---

## Setup Steps

### 1. Define Intents

First field should ALWAYS be `intent` with `always` requirement:

| Field Name | Description | Required For |
|---|---|---|
| intent | what user wants - [list your intents here] | always |

The description tells AI what categories exist. AI classifies user's message into one of these.

### 2. Define Fields Per Intent

Add fields that AI must collect for each intent.

### 3. Write System Prompt

System prompt should complement mandatory fields — tell AI personality, tone, and how to use collected info.

### 4. Enable Broad First Search (Optional)

Turn ON if you want AI to "study" all documents on first message. Good for product catalogs.

---

## Examples

### Insurance Company (HLA)

**Intents:** find new plan, make claim, check policy, general question

| Field Name | Description | Required For |
|---|---|---|
| intent | what user wants - find new plan, make claim, check policy, or general question | always |
| insurance_type | type of insurance - medical, personal accident, life, critical illness, investment | find_plan |
| occupation | job title or industry | find_plan |
| age | how old they are | find_plan |
| smoker | whether they smoke or not | find_plan |

---

### Tiles Company

**Intents:** find tiles, check order, get quote, general question

| Field Name | Description | Required For |
|---|---|---|
| intent | what user wants - find tiles, check order, get quote, or general question | always |
| house_type | type of property - landed house, condo, apartment, commercial | find_tiles |
| theme | design theme - modern, minimalist, classic, rustic, industrial | find_tiles |
| area | which area - living room, kitchen, bathroom, bedroom, outdoor | find_tiles |
| size | preferred tile size - 30x30, 60x60, 60x120, or flexible | find_tiles |
| order_number | order/invoice number | check_order |

---

### Car Dealership

**Intents:** find car, trade-in, service booking, general question

| Field Name | Description | Required For |
|---|---|---|
| intent | what user wants - find car, trade-in valuation, service booking, or general question | always |
| budget | budget range for the car | find_car |
| car_type | preferred type - sedan, SUV, MPV, hatchback, pickup | find_car |
| usage | primary usage - daily commute, family, business, off-road | find_car |
| current_car | what car they currently drive | trade_in |
| preferred_date | preferred date for appointment | service_booking |

---

### Clinic / Healthcare

**Intents:** consultation, book appointment, check results, general question

| Field Name | Description | Required For |
|---|---|---|
| intent | what user wants - consultation, book appointment, check results, or general question | always |
| symptoms | what symptoms they are experiencing | consultation |
| duration | how long symptoms have been present | consultation |
| preferred_doctor | preferred doctor if any | book_appointment |
| preferred_date | preferred date and time | book_appointment |
| ic_number | IC number for record lookup | check_results |

---

### E-commerce / Retail

**Intents:** find product, track order, return/refund, general question

| Field Name | Description | Required For |
|---|---|---|
| intent | what user wants - find product, track order, return/refund, or general question | always |
| category | product category they're looking for | find_product |
| budget | price range | find_product |
| preference | any specific preference - color, brand, material | find_product |
| order_number | order number for tracking | track_order,return_refund |

---

## Tips

1. **Keep fields minimal** — 3-5 fields per intent max. Too many = annoying for users.
2. **Description matters** — AI uses the description to formulate natural questions. Write it clearly.
3. **Intent description** — List ALL possible intents in the intent field description. AI uses this to classify.
4. **Not all intents need fields** — "general question" usually needs zero fields, AI just answers.
5. **Broad First Search** — Enable for product catalog businesses (insurance, retail, tiles). AI needs to know what's available before asking questions.
6. **System prompt** — Still important! Mandatory fields handle WHAT to ask, system prompt handles HOW to ask and HOW to respond.

---

## Broad First Search

| Setting | What it does |
|---|---|
| Toggle ON/OFF | Enable broad document search on first message |
| Chunks (default 40) | How many document chunks AI reads on first message |

**When to enable:**
- Product catalogs (insurance plans, tile collections, car models)
- AI needs to know full inventory before helping

**When to leave OFF:**
- Simple Q&A bots
- Support/helpdesk (user asks specific question, AI searches specific answer)
