import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';
import { RpcProvider, num } from 'starknet';
import pLimit from 'p-limit';

/**
 * Retry wrapper with faster backoff for Apibara-optimized approach
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 500
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = String(error?.message || error);
      const isRateLimit = 
        errorMsg.includes('Rate limit') || 
        errorMsg.includes('-32097') ||
        errorMsg.includes('429') ||
        errorMsg.includes('compute units per second');
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(1.5, attempt); // Faster backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (attempt === maxRetries - 1) {
        return null;
      } else {
        throw error;
      }
    }
  }
  return null;
}

/**
 * Parse Apibara-style events into TransferEventData with aggressive optimization
 * - Higher concurrency (10 parallel)
 * - Faster retries
 * - Minimal delays
 */
export async function parseApibaraEvents(
  events: any[],
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  provider: RpcProvider
): Promise<TransferEventData[]> {
  if (events.length === 0) return [];

  logger.log(`[${config.chain}] Parsing ${events.length} events with Apibara-optimized approach`);

  // Get unique blocks and transactions
  const uniqueBlockNumbers = [...new Set(events.map(e => e.block_number))];
  const uniqueTxHashes = [...new Set(events.map(e => e.transaction_hash))];
  
  logger.log(`[${config.chain}] Fetching ${uniqueBlockNumbers.length} blocks and ${uniqueTxHashes.length} transactions`);

  // Optimized: Higher concurrency for faster fetching
  const blockCache = new Map<number, any>();
  const txCache = new Map<string, any>();
  const limit = pLimit(10); // Aggressive: 10 parallel requests

  // Fetch all blocks in parallel
  await Promise.all(
    uniqueBlockNumbers.map(blockNum =>
      limit(async () => {
        const block = await retryWithBackoff(
          () => provider.getBlockWithTxHashes(blockNum),
          2, // Fewer retries for speed
          500 // Faster initial delay
        );
        if (block) {
          blockCache.set(blockNum, block);
        }
      })
    )
  );

  logger.log(`[${config.chain}] Cached ${blockCache.size} blocks`);

  // Fetch all transactions in parallel
  await Promise.all(
    uniqueTxHashes.map(txHash =>
      limit(async () => {
        const tx = await retryWithBackoff(
          () => provider.getTransactionByHash(txHash),
          2,
          500
        );
        if (tx) {
          txCache.set(txHash, tx);
        }
      })
    )
  );

  logger.log(`[${config.chain}] Cached ${txCache.size} transactions`);

  // Parse all events using cached data
  const transferEvents: TransferEventData[] = [];

  for (let index = 0; index < events.length; index++) {
    try {
      const event = events[index];
      const parsedEvent = parseTransferEvent(
        event,
        index,
        config,
        facilitator,
        facilitatorConfig,
        blockCache,
        txCache
      );

      if (parsedEvent) {
        transferEvents.push(parsedEvent);
      }
    } catch (error) {
      logger.error(
        `[${config.chain}] Error parsing event at index ${index}:`,
        { error: String(error) }
      );
    }
  }

  logger.log(`[${config.chain}] Successfully parsed ${transferEvents.length} events`);

  return transferEvents;
}

/**
 * Parse a single Transfer event with cached block and transaction data
 */
function parseTransferEvent(
  event: any,
  eventIndex: number,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  blockCache: Map<number, any>,
  txCache: Map<string, any>
): TransferEventData | null {
  if (!event || !event.keys) {
    return null;
  }

  let fromAddress: string;
  let toAddress: string;
  let amountLow: bigint;
  let amountHigh: bigint;

  // Detect event format based on keys length
  if (event.keys.length >= 3) {
    // Format A: indexed from/to in keys (SNIP-13)
    fromAddress = num.toHex(num.toBigInt(event.keys[1]));
    toAddress = num.toHex(num.toBigInt(event.keys[2]));
    amountLow = num.toBigInt(event.data[0] || '0x0');
    amountHigh = num.toBigInt(event.data[1] || '0x0');
  } else {
    // Format B: from/to in data (current USDC)
    if (!event.data || event.data.length < 4) {
      return null;
    }
    fromAddress = num.toHex(num.toBigInt(event.data[0]));
    toAddress = num.toHex(num.toBigInt(event.data[1]));
    amountLow = num.toBigInt(event.data[2] || '0x0');
    amountHigh = num.toBigInt(event.data[3] || '0x0');
  }

  // Parse amount (u256)
  const amount = amountLow + (amountHigh << BigInt(128));

  // Get block details from cache
  const block = blockCache.get(event.block_number);
  const blockTimestamp = block 
    ? new Date(block.timestamp * 1000) 
    : new Date();

  // Get transaction details from cache
  const tx = txCache.get(event.transaction_hash);
  let transactionFrom = facilitatorConfig.address;
  
  if (tx) {
    // @ts-ignore
    transactionFrom = tx.sender_address || tx.account_address || transactionFrom;
  }

  return {
    address: facilitatorConfig.token.address,
    transaction_from: num.toHex(num.toBigInt(transactionFrom)),
    sender: fromAddress,
    recipient: toAddress,
    amount: Number(amount),
    block_timestamp: blockTimestamp,
    tx_hash: event.transaction_hash,
    chain: config.chain,
    provider: config.provider,
    decimals: facilitatorConfig.token.decimals,
    facilitator_id: facilitator.id,
    log_index: eventIndex,
  };
}

