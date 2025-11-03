# Starknet Integration for x402sync (Apibara Branch)

This directory contains the Starknet blockchain integration for the x402sync data synchronization system.

## Overview

The Starknet integration tracks USDC token transfers on the Starknet mainnet using **optimized batch queries** via RPC (Starknet.js).

**Note:** This is the `apibara` branch. For the standard RPC implementation, see the `rpc` branch.

## Implementation

### 🚀 Starknet Apibara Integration
**Status:** Production-ready  
**Location:** `trigger/chains/starknet/apibara/`
**Branch:** `apibara`

This implementation provides optimized batch data synchronization with support for Apibara DNA tokens.

**How It Works:**
- Detects `APIBARA_ACCESS_TOKEN` if available
- Uses optimized RPC for batch historical queries
- **Why RPC?** Apibara DNA is for real-time streaming, RPC is better for scheduled batch syncs
- See [APIBARA_DNA_VS_RPC.md](../../../APIBARA_DNA_VS_RPC.md) for detailed explanation

**Features:**
- ✅ **Optimized performance** - 10 concurrent requests, smart retries
- ✅ **Efficient caching** - Batches blocks and transactions
- ✅ **Apibara token support** - Ready for future real-time features
- ✅ **Graceful fallback** - Works with or without Apibara token
- ✅ **Rate limit handling** - Auto-retry with backoff
- ✅ **Production-ready** - 2-day time windows, 5k event limit

**Configuration:**
- Cron: Runs every hour (`0 * * * *`)
- Time Window: 2 days (configurable)
- Limit: 5,000 events per window
- Concurrency: 10 parallel requests
- Max Duration: 15 minutes

**Environment Variables:**
```bash
# Apibara Token (optional - enables Apibara DNA features)
APIBARA_ACCESS_TOKEN=apa_your_token_here          # Your Apibara access token
APIBARA_DNA_URL=https://mainnet.starknet.a5a.ch  # Optional, has default

# Starknet RPC (required for batch queries)
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/YOUR_KEY

# Database (required)
DATABASE_URL=postgresql://...
```

**See also:**
- [ENVIRONMENT_SETUP.md](../../../ENVIRONMENT_SETUP.md) - Complete environment setup guide
- [APIBARA_DNA_VS_RPC.md](../../../APIBARA_DNA_VS_RPC.md) - Why we use RPC for batch queries

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

