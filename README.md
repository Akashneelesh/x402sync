# x402-sync

Real-time blockchain data synchronization for cross-chain USDC transfers.

## Features

- ✅ **Real-time streaming** with Apibara DNA (Starknet)
- ✅ **Multi-chain support** - Starknet, Base, Polygon, Solana
- ✅ **Scheduled syncs** via Trigger.dev
- ✅ **PostgreSQL storage** with Prisma ORM
- ✅ **Production-ready** with error handling and monitoring

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
# Copy example env (if you have one) or create .env
touch .env
```

Add required variables:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/x402sync

# Starknet (Apibara DNA Streaming)
APIBARA_AUTH_TOKEN=apa_your_token_here  # Get from https://console.apibara.com
APIBARA_DNA_URL=https://mainnet.starknet.a5a.ch

# Trigger.dev
TRIGGER_SECRET_KEY=your_trigger_secret
```

### 3. Setup Database

```bash
npm run db:push
```

### 4. Run Development Server

```bash
npm run trigger:dev
```


## Project Structure

```
├── trigger/
│   ├── chains/
│   │   ├── starknet/apibara/    # Apibara DNA streaming
│   │   ├── evm/base/            # Base chain (Coinbase)
│   │   ├── evm/polygon/         # Polygon chain
│   │   └── solana/              # Solana chain
│   ├── fetch/                   # Data fetching logic
│   └── sync.ts                  # Main sync orchestration
├── db/
│   ├── client.ts                # Prisma client
│   └── services.ts              # Database services
├── prisma/
│   └── schema.prisma            # Database schema
└── scripts/
    ├── test-apibara-dna.ts      # Test DNA streaming
    └── view-starknet-data.ts    # View synced data
```

## Available Scripts

```bash
# Development
npm run trigger:dev              # Start Trigger.dev in dev mode
npm run db:studio                # Open Prisma Studio

# Database
npm run db:push                  # Push schema changes
npm run db:migrate:dev           # Create migration
npm run db:generate              # Generate Prisma client

# Testing
npx tsx scripts/test-apibara-dna.ts      # Test DNA streaming
npx tsx scripts/view-starknet-data.ts    # View synced data

# Production
npm run trigger:deploy           # Deploy to Trigger.dev
npm run db:migrate:prod          # Run production migrations
```

