# 🔧 Environment Setup Guide

## 📁 Where to Add Environment Variables

Create a `.env` file in the **root** of your project:

```bash
/Users/akashbalasubramani/Desktop/x402sync/.env
```

---

## ✅ Required Environment Variables

### **1. Database** (Required)

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/x402sync"
```

**Options:**
- **Local PostgreSQL**: `postgresql://user:password@localhost:5432/x402sync`
- **Neon**: `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require`
- **Supabase**: `postgresql://postgres:password@db.xxx.supabase.co:5432/postgres`

### **2. Trigger.dev** (Required)

```bash
TRIGGER_SECRET_KEY="tr_dev_xxxxxxxxxxxxxxxxxx"
```

**Get from:** https://cloud.trigger.dev/
- Go to Project Settings > API Keys
- Copy your secret key

---

## 🚀 Apibara Integration (With Your Access Token)

### **Option 1: Use Apibara Token (Your Situation)**

```bash
# Your Apibara access token
APIBARA_ACCESS_TOKEN="apa_xxxxxxxxxxxxxxxxxx"

# Apibara DNA URL (optional, defaults to mainnet)
APIBARA_DNA_URL="https://mainnet.starknet.a5a.ch"

# Still need RPC for historical data queries
STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/YOUR_API_KEY"
```

### **Why Both?**

**Apibara DNA** is a streaming service (real-time indexing):
- ✅ Great for continuous data streaming
- ✅ Low latency for real-time updates
- ❌ Not designed for batch historical queries

**RPC** is needed for batch queries:
- ✅ Query specific time ranges
- ✅ Fetch historical data on demand
- ✅ Works with your existing sync schedule

**Our Integration:**
- Uses your Apibara token when available
- Falls back to optimized RPC for batch queries
- Best of both worlds!

---

## 📝 Complete .env File Example

Create `/Users/akashbalasubramani/Desktop/x402sync/.env`:

```bash
# ================================
# DATABASE
# ================================
DATABASE_URL="postgresql://user:password@localhost:5432/x402sync"

# ================================
# TRIGGER.DEV
# ================================
TRIGGER_SECRET_KEY="tr_dev_xxxxxxxxxxxxxxxxxx"

# ================================
# APIBARA (Your Access Token)
# ================================
APIBARA_ACCESS_TOKEN="apa_xxxxxxxxxxxxxxxxxx"
APIBARA_DNA_URL="https://mainnet.starknet.a5a.ch"

# ================================
# STARKNET RPC (Still needed)
# ================================
STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/YOUR_API_KEY"
```

---

## 🔑 Where to Get Your Keys

### **1. Apibara Access Token** (You have this!)

**You already have:** `APIBARA_ACCESS_TOKEN`

**DNA URLs:**
- **Mainnet**: `https://mainnet.starknet.a5a.ch`
- **Sepolia Testnet**: `https://sepolia.starknet.a5a.ch`

### **2. Starknet RPC (Still needed for batch queries)**

**Option A: Alchemy** (Recommended)
1. Go to https://alchemy.com
2. Sign up / Log in
3. Create app: "Create New App" → Starknet Mainnet
4. Copy API key from dashboard
5. URL format: `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/YOUR_API_KEY`

**Option B: Infura**
1. Go to https://infura.io
2. Create project for Starknet
3. Copy Project ID
4. URL format: `https://starknet-mainnet.infura.io/v3/YOUR_PROJECT_ID`

**Option C: BlastAPI**
1. Go to https://blastapi.io
2. Get API key
3. URL format: `https://starknet-mainnet.blastapi.io/YOUR_API_KEY/rpc/v0_7`

**Option D: Free Public RPC** (Not recommended for production)
```bash
STARKNET_RPC_URL="https://starknet-mainnet.public.blastapi.io/rpc/v0_7"
```

---

## 🧪 Testing Your Setup

### **Step 1: Create .env file**

```bash
cd /Users/akashbalasubramani/Desktop/x402sync
touch .env
nano .env  # or use your favorite editor
```

### **Step 2: Add your variables**

Paste this and fill in your actual values:

```bash
DATABASE_URL="postgresql://..."
TRIGGER_SECRET_KEY="tr_dev_..."
APIBARA_ACCESS_TOKEN="apa_..."
APIBARA_DNA_URL="https://mainnet.starknet.a5a.ch"
STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/..."
```

### **Step 3: Test it works**

```bash
# Test database connection
npx prisma db pull

# Start Trigger.dev
npm run trigger:dev
```

**You should see:**
```
✅ Database connected
✅ Trigger.dev authenticated
✅ Apibara token detected
✅ Ready to sync!
```

---

## 📊 What Happens When You Run?

### **With Apibara Token:**

```
[starknet] Fetching Starknet data via Apibara DNA
[starknet] Using Apibara DNA service at https://mainnet.starknet.a5a.ch
[starknet] Apibara DNA is primarily a streaming service. Using RPC with optimized settings.
[starknet] Tip: For real-time streaming, consider setting up an Apibara indexer.
[starknet] Querying blocks X to Y for contract 0x053c91...
```

### **Without Apibara Token:**

```
[starknet] APIBARA_ACCESS_TOKEN not found, falling back to RPC
[starknet] Querying blocks X to Y for contract 0x053c91...
```

Both work! The Apibara integration is smart enough to fall back to RPC for batch queries.

---

## 🎯 Recommended Setup for You

Since you have an Apibara access token:

```bash
# Use your Apibara token
APIBARA_ACCESS_TOKEN="apa_your_actual_token"
APIBARA_DNA_URL="https://mainnet.starknet.a5a.ch"

# Get a free Alchemy RPC for batch queries
STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/YOUR_ALCHEMY_KEY"
```

**This gives you:**
- ✅ Apibara token for future streaming features
- ✅ Optimized RPC for current batch syncing
- ✅ Best performance
- ✅ Production-ready

---

## 🚀 Future: Real-Time Streaming with Apibara

If you want **real-time** data streaming (not batch syncing), you can set up an Apibara indexer:

**Create `indexer.ts`:**
```typescript
import { v1alpha2 } from '@apibara/starknet';

export const config = {
  streamUrl: 'https://mainnet.starknet.a5a.ch',
  startingBlock: 900_000,
  network: 'starknet',
  filter: {
    header: { weak: false },
  },
};

export default function transform({ header, events }: any) {
  // Process events in real-time
  console.log('New block:', header.blockNumber);
}
```

**Run with your token:**
```bash
apibara run indexer.ts -A apa_your_token
```

But for now, the batch syncing with your token works great! 🎉

---

## ❓ FAQ

### **Q: Do I need both Apibara AND RPC?**

**A:** For now, yes:
- Apibara DNA = streaming service (real-time)
- RPC = batch queries (scheduled syncs)
- We use RPC for batch historical queries

### **Q: What if I don't have an Apibara token?**

**A:** No problem! Just use RPC:
```bash
STARKNET_RPC_URL="https://..."
# Don't set APIBARA_ACCESS_TOKEN
```

### **Q: What if I don't have an RPC URL?**

**A:** The system has a default Alchemy URL, but it's shared and rate-limited. Get your own free key from Alchemy for better performance.

### **Q: Can I use Apibara token without RPC?**

**A:** Not yet. Apibara DNA is for streaming, not batch queries. We need RPC for the scheduled sync approach.

---

## ✅ Summary

**Your .env file should have:**

```bash
DATABASE_URL="..."              # Required: Your database
TRIGGER_SECRET_KEY="..."        # Required: Trigger.dev key
APIBARA_ACCESS_TOKEN="..."      # Your Apibara token!
APIBARA_DNA_URL="https://mainnet.starknet.a5a.ch"  # Optional (has default)
STARKNET_RPC_URL="..."          # Still needed for batch queries
```

**Save to:** `/Users/akashbalasubramani/Desktop/x402sync/.env`

**Then run:**
```bash
npm run trigger:dev
```

**And you're ready to go!** 🚀

