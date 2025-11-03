# Starknet Sync Performance Analysis

## Current Performance (as of Nov 3, 2025)

### Sync Duration: ~7-10 minutes per run
- **Frequency**: Every hour (`0 * * * *`)
- **Max Duration**: 15 minutes
- **Time Windows**: 2-day chunks

### Performance Breakdown (per 2-day window)

| Phase | Duration | Details |
|-------|----------|---------|
| Fetch Events | ~5s | 5,000 events via RPC `getEvents()` |
| Fetch Blocks | ~35-50s | ~1,000 blocks via RPC `getBlockWithTxHashes()` |
| Fetch Transactions | ~70-90s | ~1,600-2,100 txs via RPC `getTransactionByHash()` |
| Parse & Save | ~1s | Process and insert to database |
| **Total** | **~2-2.5 min** | Per window |

### Example Run (from logs):

```
07:44:41 - Started
07:44:47 - Window 1: Fetch 5,000 events
07:45:43 - Window 1: Cached 1,146 blocks (51s)
07:47:01 - Window 1: Cached 1,959 transactions (78s)
07:47:01 - Window 1: Saved 599 transfers

07:47:01 - Window 2: Started
07:47:56 - Window 2: Cached 1,184 blocks (50s)
07:49:24 - Window 2: Cached 2,093 transactions (88s)
07:49:24 - Window 2: Saved 834 transfers

07:49:24 - Window 3: Started
07:50:02 - Window 3: Cached 983 blocks (34s)
07:51:14 - Window 3: Cached 1,872 transactions (72s)
07:51:14 - Window 3: Saved 631 transfers

07:51:14 - Window 4: Started (continuing...)
```

**Total for 3 windows**: ~6.5 minutes
**Estimated full run**: ~8-10 minutes (4-5 windows)

## Why So Slow?

### RPC Call Volume
For a typical sync processing 15,000-20,000 events:
- **Block RPC calls**: ~4,000-5,000
- **Transaction RPC calls**: ~7,000-8,000
- **Total RPC calls**: ~11,000-13,000

Even with 20 parallel requests, that's:
- ~250 batches of block fetches
- ~400 batches of transaction fetches
- **~650 sequential network round-trips**

### Comparison to Base CDP

| Metric | Starknet Apibara | Base CDP |
|--------|------------------|----------|
| **Duration** | 7-10 minutes | 9-12 ms |
| **RPC Calls** | ~11,000-13,000 | 0 |
| **API Calls** | 1 (getEvents) | 1 (CDP API) |
| **Data Processing** | Heavy (parse events, fetch blocks/txs) | Light (pre-processed) |
| **Bottleneck** | RPC rate limits + network latency | None |

Base CDP is **~50,000x faster** because it queries a pre-indexed API that returns processed data.

## Optimizations Applied

### 1. Increased Concurrency (v1 - Current)
- Changed from 10 → 20 parallel RPC requests
- Reduced retry delays from 500ms → 300ms
- **Expected improvement**: ~30-40% faster (5-7 min total)

### 2. Progress Logging
- Added timing logs for block/tx fetching phases
- Shows events-per-block ratio for debugging

## Why Not Use "Real" Apibara DNA?

The current implementation is **misleadingly named**. It's not actually using Apibara DNA's streaming architecture.

### What Apibara DNA Actually Is:
```
┌─────────────┐
│ Apibara DNA │ ──streams──> ┌──────────────┐
│  (Indexer)  │              │ Your Database│
└─────────────┘              └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │ Query Your DB│
                              └──────────────┘
```

Apibara DNA is designed for **continuous streaming**:
1. Run an indexer that streams blocks 24/7
2. Indexer writes to YOUR database
3. Query YOUR database (instant, no RPC calls)

### What We're Actually Doing:
```
┌─────────────┐
│ RPC Node    │ ◄── 11,000 calls ── ┌──────────────┐
│ (Alchemy)   │                     │ Trigger Task │
└─────────────┘                     └──────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │   Database   │
                                    └──────────────┘
```

We're using RPC with extra steps:
1. Call `getEvents()` once (fast)
2. Call `getBlockWithTxHashes()` thousands of times (slow)
3. Call `getTransactionByHash()` thousands of times (very slow)

## Recommendations

### Option 1: Accept Current Performance ✅ **RECOMMENDED**
- **Pros**: 
  - Working reliably
  - Syncs hourly (catches up fine)
  - No infrastructure changes needed
  - Successfully saving data (2,000+ transfers)
- **Cons**: 
  - Takes 7-10 minutes per run
  - Uses lots of RPC quota

### Option 2: Switch to Real Apibara DNA Streaming 🔄
- **Pros**:
  - Would be much faster (near-instant queries)
  - No RPC rate limits
  - Real-time data
- **Cons**:
  - Requires running a separate indexer service
  - More complex infrastructure
  - Need to set up streaming pipeline
  - Overkill for hourly syncs

### Option 3: Reduce RPC Calls 🛠️
Potential optimizations:
- Skip fetching transaction details (only need sender_address)
- Use block timestamps from events (skip block fetches)
- Batch RPC calls using multicall
- **Estimated improvement**: 50-70% faster (3-5 min total)

### Option 4: Increase Sync Frequency, Reduce Window Size ⚡
Current: 1 hour interval, 2-day windows
Alternative: 30 min interval, 1-day windows
- Smaller windows = fewer events per run
- More frequent = less catchup needed
- **Trade-off**: More frequent runs, but each run is faster

## Current Status: ✅ Working

The sync is **functioning correctly**:
- ✅ Fetching events successfully
- ✅ Parsing data correctly  
- ✅ Saving to database (no duplicates)
- ✅ Provider correctly set to `apibara`
- ⚠️ Just slower than other chains

**Recommendation**: Keep monitoring. If RPC rate limits become an issue, consider Option 3 optimizations.

