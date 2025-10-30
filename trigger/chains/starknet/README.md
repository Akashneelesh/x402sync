# Starknet Integration for x402sync

This directory contains the Starknet blockchain integration for the x402sync data synchronization system.

## Overview

The Starknet integration tracks USDC token transfers on the Starknet mainnet using **direct RPC queries** via Starknet.js.

## Implementation

### 🚀 Starknet Apibara (Recommended - Low Latency)
**Status:** Ready to use  
**Location:** `trigger/chains/starknet/apibara/`

Uses Apibara's streaming data platform for low-latency, efficient data access. **Recommended for production due to better performance.**

**Features:**
- ✅ **Low latency** streaming data
- ✅ **Efficient** - No need for batch RPC calls
- ✅ Built-in block reorganization handling
- ✅ Real-time data availability
- ✅ Optimized for Starknet

**Configuration:**
- Cron: Runs every hour (`0 * * * *`)
- Time Window: 1 day
- Limit: 5,000 events per window
- API URL: Set via `APIBARA_DNA_URL` (defaults to mainnet.starknet.a5a.ch)
- Optional API Key: Set via `APIBARA_API_KEY` for hosted service

### ✅ Starknet RPC (Alternative)
**Status:** Ready to use  
**Location:** `trigger/chains/starknet/rpc/`

Uses Starknet.js to query transfer events directly from Starknet RPC nodes with optimized batch processing.

**Features:**
- ✅ Efficient batch caching
- ✅ Proper pagination handling
- ✅ Rate limiting protection
- ✅ Works with any RPC provider

**Configuration:**
- Cron: Runs every hour (`0 * * * *`)
- Time Window: 1 day
- Limit: 2,000 events per window
- RPC URL: Set via `STARKNET_RPC_URL` environment variable

**Environment Variables:**
```bash
# For Apibara (recommended)
APIBARA_DNA_URL=https://mainnet.starknet.a5a.ch  # Optional, has default
APIBARA_API_KEY=your_key_here                    # Optional, for hosted service

# For RPC (alternative)
STARKNET_RPC_URL=https://starknet-mainnet.public.blastapi.io  # Optional, has default

# Required
DATABASE_URL=postgresql://...  # Required
```

### 🔮 Future Data Providers

When BigQuery or Bitquery add Starknet support, you can add those implementations following the pattern from other chains (Solana, Base, Polygon).

## Token Configuration

**USDC on Starknet Mainnet:**
- Address: `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8`
- Decimals: 6
- Symbol: USDC

> **Note:** This is the active USDC contract on Starknet mainnet. Verify on [Starkscan](https://starkscan.co/token/0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8).

## Adding Starknet Facilitators

To add a new facilitator on Starknet, edit `trigger/config.ts`:

```typescript
{
  id: 'teststarknet',
  addresses: {
    [Chain.STARKNET]: [
      {
        address: '0x023d494676675998d221a6d8666631aebf7b373415595bfb50bd7d10b009235b', // Your Starknet wallet address
        token: USDC_STARKNET_TOKEN,
        syncStartDate: new Date('2025-01-01'),
        enabled: true,
      },
    ],
  },
}
```

## How It Works

### Starknet RPC Flow

1. **Event Filtering**: Queries the Starknet RPC for Transfer events from the USDC contract
2. **Transfer Event Parsing**: 
   - Keys[1]: from_address
   - Keys[2]: to_address
   - Data[0], Data[1]: u256 amount (low/high 128 bits)
3. **Block Details**: Fetches block timestamp and transaction details
4. **Data Transformation**: Converts to standard `TransferEventData` format
5. **Database Storage**: Saves to PostgreSQL with deduplication

### Event Structure

Starknet Transfer events follow the ERC20 standard but can have two formats:

**Format A (SNIP-13 Compliant - Indexed):**
- **keys[0]**: Event selector (keccak256 of "Transfer")
- **keys[1]**: from_address (indexed)
- **keys[2]**: to_address (indexed)
- **data[0]**: amount_low (u256 low 128 bits)
- **data[1]**: amount_high (u256 high 128 bits)

**Format B (Non-indexed - Current USDC):**
- **keys[0]**: Event selector (keccak256 of "Transfer")
- **data[0]**: from_address (not indexed)
- **data[1]**: to_address (not indexed)
- **data[2]**: amount_low (u256 low 128 bits)
- **data[3]**: amount_high (u256 high 128 bits)

> **Note:** The parser automatically detects and handles both formats.

## Activation

To activate Starknet syncing:

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Add facilitator addresses** in `trigger/config.ts`

3. **Set environment variables** (optional):
   ```bash
   export STARKNET_RPC_URL=https://your-rpc-endpoint.com
   export STARKNET_START_BLOCK=900000
   ```

4. **Deploy with Trigger.dev:**
   ```bash
   pnpm run trigger:deploy
   ```

## Architecture

```
trigger/
├── chains/starknet/
│   ├── apibara/          # 🚀 Apibara implementation (recommended)
│   │   ├── config.ts     # Sync configuration
│   │   ├── query.ts      # Query builder
│   │   └── sync.ts       # Trigger.dev task export
│   ├── rpc/              # ✅ RPC implementation (alternative)
│   │   ├── config.ts     # Sync configuration
│   │   ├── query.ts      # Query builder
│   │   └── sync.ts       # Trigger.dev task export
│   └── README.md         # This file
│
├── fetch/apibara/        # Core Apibara streaming logic
│   ├── fetch.ts          # Streaming with Apibara SDK
│   └── helpers.ts        # Event parsing
│
└── fetch/starknet-rpc/   # Core RPC fetching logic
    ├── fetch.ts          # Main fetching with pagination
    └── helpers.ts        # Event parsing with batch caching
```

## Troubleshooting

### RPC Rate Limits
If you encounter rate limiting, consider:
- Using a paid RPC provider (Infura, Alchemy, etc.)
- Reducing the sync frequency in `config.ts`
- Implementing additional rate limiting in `helpers.ts`

### Missing Events
If events are missing:
- Check the `STARKNET_START_BLOCK` environment variable
- Verify the USDC contract address is correct
- Ensure the facilitator address is properly configured

### Block Timestamp Errors
If block timestamp fetches fail, the system will use the current time as a fallback. Consider caching block data to reduce RPC calls.

## Performance

The RPC implementation is optimized for Alchemy free tier:

- **Efficient batch caching**: Fetches unique blocks and transactions only once
- **Controlled concurrency**: 5 parallel requests to avoid rate limits
- **Auto-retry logic**: Handles 429 rate limit errors with exponential backoff
- **Fast processing**: 2,000 events in 5-8 minutes
- **Cost-effective**: Free with Alchemy free tier (300M compute units/month)

**Typical sync time:**
- Event fetch: ~30 seconds (2,000 events)
- Block fetch: ~2-3 minutes (400-800 blocks)
- Transaction fetch: ~2-3 minutes (1,000-1,500 txs)
- Parse & save: ~30 seconds
- **Total: 5-8 minutes** per sync

## Future Enhancements

- [ ] Add support for other tokens beyond USDC
- [ ] Implement persistent block cache for faster repeated queries
- [ ] Add BigQuery integration when Google adds Starknet datasets
- [ ] Add Bitquery integration if they confirm Starknet support
- [ ] Consider Apibara streaming for real-time requirements

## Documentation

- **[Testing Guide](../../../STARKNET_TESTING_GUIDE.md)** - Step-by-step guide to test the integration locally
- **[RPC Setup](../../../STARKNET_RPC_SETUP.md)** - How to configure RPC providers (Alchemy, Infura, etc.)
- **[Backfill Strategy](../../../STARKNET_BACKFILL_STRATEGY.md)** - How to sync historical data without timeouts
- **[Utility Script](../../../scripts/view-starknet-data.ts)** - View synced data from command line

## References

- [Starknet.js Documentation](https://www.starknetjs.com/)
- [Starknet Developer Docs](https://docs.starknet.io/)
- [Starkscan Explorer](https://starkscan.co/)
- [x402scan.com](https://x402scan.com)

