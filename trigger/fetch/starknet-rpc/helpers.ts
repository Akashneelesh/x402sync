import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
  StarknetEvent,
} from '../../types';
import { RpcProvider, num, CallData } from 'starknet';
import pLimit from 'p-limit';

/**
 * Retry wrapper for RPC calls with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
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
        // Exponential backoff for rate limits
        const delay = baseDelay * Math.pow(2, attempt);
        logger.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (attempt === maxRetries - 1) {
        // Failed all retries
        logger.warn(`Failed after ${maxRetries} attempts: ${errorMsg.slice(0, 100)}`);
        return null;
      } else {
        // Non-rate-limit error, throw immediately
        throw error;
      }
    }
  }
  return null;
}

/**
 * Parse Starknet events into TransferEventData
 * Uses efficient batching to minimize RPC calls
 */
export async function parseStarknetEvents(
  events: any[],
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  provider: RpcProvider
): Promise<TransferEventData[]> {
  if (events.length === 0) return [];

  logger.log(`[${config.chain}] Parsing ${events.length} events with efficient batching`);

  // Step 1: Get unique block numbers
  const uniqueBlockNumbers = [...new Set(events.map(e => e.block_number))];
  logger.log(`[${config.chain}] Fetching ${uniqueBlockNumbers.length} unique blocks`);

  // Step 2: Batch fetch block data (balanced for Alchemy free tier)
  const blockCache = new Map<number, any>();
  const limit = pLimit(5); // Sweet spot for Alchemy free tier - not too fast, not too slow

  // Process all blocks with controlled concurrency
  await Promise.all(
    uniqueBlockNumbers.map(blockNum =>
      limit(async () => {
        const block = await retryWithBackoff(
          () => provider.getBlockWithTxHashes(blockNum),
          3, // More retries for 429 errors
          1500 // Reasonable delay
        );
        if (block) {
          blockCache.set(blockNum, block);
        }
      })
    )
  );

  logger.log(`[${config.chain}] Successfully cached ${blockCache.size} blocks`);

  // Step 3: Get unique transaction hashes
  const uniqueTxHashes = [...new Set(events.map(e => e.transaction_hash))];
  logger.log(`[${config.chain}] Fetching ${uniqueTxHashes.length} unique transactions`);

  // Step 4: Batch fetch transaction data (balanced for Alchemy free tier)
  const txCache = new Map<string, any>();

  await Promise.all(
    uniqueTxHashes.map(txHash =>
      limit(async () => {
        const tx = await retryWithBackoff(
          () => provider.getTransactionByHash(txHash),
          3, // More retries for 429 errors
          1500 // Reasonable delay
        );
        if (tx) {
          txCache.set(txHash, tx);
        }
      })
    )
  );

  logger.log(`[${config.chain}] Successfully cached ${txCache.size} transactions`);

  // Step 5: Parse all events using cached data (fast, no RPC calls)
  const transferEvents: TransferEventData[] = [];

  for (let index = 0; index < events.length; index++) {
    try {
      const event = events[index];
      const parsedEvent = parseTransferEventWithCache(
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
        `[${config.chain}] Error parsing event ${events[index].transaction_hash}:`,
        { error: String(error) }
      );
    }
  }

  logger.log(`[${config.chain}] Successfully parsed ${transferEvents.length} events`);

  return transferEvents;
}

/**
 * Parse a single Transfer event using cached block and transaction data
 * This is much faster as it doesn't make any RPC calls
 */
function parseTransferEventWithCache(
  event: any,
  eventIndex: number,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  blockCache: Map<number, any>,
  txCache: Map<string, any>
): TransferEventData | null {
  // Starknet Transfer event structure can vary:
  // 
  // Option A (indexed from/to - SNIP-13 compliant):
  // keys[0]: event selector (Transfer)
  // keys[1]: from_address
  // keys[2]: to_address  
  // data[0]: amount_low (u256 low 128 bits)
  // data[1]: amount_high (u256 high 128 bits)
  //
  // Option B (non-indexed - current USDC contract):
  // keys[0]: event selector (Transfer)
  // data[0]: from_address
  // data[1]: to_address
  // data[2]: amount_low (u256 low 128 bits)
  // data[3]: amount_high (u256 high 128 bits)

  if (!event.keys || event.keys.length < 1) {
    logger.warn(
      `[${config.chain}] Event missing keys: ${event.transaction_hash}`
    );
    return null;
  }

  let fromAddress: string;
  let toAddress: string;
  let amountLow: bigint;
  let amountHigh: bigint;

  // Detect which format based on keys length
  if (event.keys.length >= 3) {
    // Option A: indexed from/to in keys
    fromAddress = num.toHex(num.toBigInt(event.keys[1]));
    toAddress = num.toHex(num.toBigInt(event.keys[2]));
    amountLow = num.toBigInt(event.data[0] || '0x0');
    amountHigh = num.toBigInt(event.data[1] || '0x0');
  } else {
    // Option B: from/to in data (non-indexed)
    if (!event.data || event.data.length < 4) {
      logger.warn(
        `[${config.chain}] Event missing data: ${event.transaction_hash}`
      );
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
    : new Date(); // Fallback to current time if block not in cache

  // Get transaction details from cache
  const tx = txCache.get(event.transaction_hash);
  let transactionFrom = facilitatorConfig.address;
  
  if (tx) {
    // @ts-ignore - Different transaction types have different fields
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

/**
 * Convert felt252 to hex address
 */
export function feltToAddress(felt: string): string {
  const bn = num.toBigInt(felt);
  return num.toHex(bn);
}

/**
 * Parse u256 from two felt252 values (low, high)
 */
export function u256FromFelts(low: string, high: string): bigint {
  const lowBn = num.toBigInt(low);
  const highBn = num.toBigInt(high);
  return lowBn + (highBn << BigInt(128));
}

