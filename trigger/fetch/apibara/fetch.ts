import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';
import { StreamClient, v1alpha2 } from '@apibara/protocol';
import { Filter, FieldElement } from '@apibara/starknet';
import { hash } from 'starknet';
import Long from 'long';
import { parseApibaraStreamBlock } from './helpers';

/**
 * Fetch transfer events from Starknet using Apibara DNA Stream (gRPC)
 * 
 * This implementation uses Apibara DNA's gRPC streaming for real-time data:
 * - Continuous streaming of blocks as they're finalized
 * - Low latency (< 1 minute from block creation)
 * - Automatic reconnection on errors
 * - No rate limits
 * 
 * Requires:
 * - APIBARA_DNA_URL: DNA service URL (defaults to mainnet)
 * - APIBARA_AUTH_TOKEN: Auth token for DNA service
 * 
 * How it works:
 * 1. Creates a gRPC streaming client
 * 2. Configures filter for Transfer events
 * 3. Streams blocks continuously from starting cursor
 * 4. Processes events in real-time
 * 5. Returns collected events when time window is complete
 */
export async function fetchApibara(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  // gRPC expects hostname without protocol
  const dnaUrl = (process.env.APIBARA_DNA_URL || 'https://mainnet.starknet.a5a.ch')
    .replace('https://', '')
    .replace('http://', '');
  const authToken = process.env.APIBARA_AUTH_TOKEN;
  
  if (!authToken) {
    throw new Error(
      'APIBARA_AUTH_TOKEN is required for DNA streaming. ' +
      'Get your token at https://console.apibara.com'
    );
  }

  logger.log(
    `[${config.chain}] Starting Apibara DNA stream from ${since.toISOString()} to ${now.toISOString()}`
  );
  logger.log(`[${config.chain}] DNA endpoint: ${dnaUrl}`);

  try {
    // Calculate block range from the provided timestamps
    const startingBlock = estimateBlockFromTimestamp(since);
    const endingBlock = estimateBlockFromTimestamp(now);

    logger.log(
      `[${config.chain}] Estimated block range: ${startingBlock} to ${endingBlock} (${since.toISOString()} to ${now.toISOString()})`
    );

    // Stream events from DNA
    const events = await streamFromApibaraDNA(
      dnaUrl,
      authToken,
      facilitatorConfig.token.address,
      startingBlock,
      endingBlock,
      config,
      facilitator,
      facilitatorConfig
    );

    logger.log(`[${config.chain}] DNA stream complete: ${events.length} events`);

    // Filter by facilitator address
    const normalizedFacilitatorAddr = facilitatorConfig.address
      .toLowerCase()
      .replace(/^0x0+/, '0x');

    const facilitatorEvents = events.filter((event: TransferEventData) => {
      const normalizedSender = event.sender
        .toLowerCase()
        .replace(/^0x0+/, '0x');
      return normalizedSender === normalizedFacilitatorAddr;
    });

    logger.log(
      `[${config.chain}] Filtered to ${facilitatorEvents.length} events from facilitator ${facilitator.id}`
    );

    return facilitatorEvents;
  } catch (error) {
    logger.error(`[${config.chain}] Apibara DNA stream error:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Stream events from Apibara DNA using gRPC
 */
async function streamFromApibaraDNA(
  dnaUrl: string,
  authToken: string,
  contractAddress: string,
  startingBlock: number,
  endingBlock: number,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): Promise<TransferEventData[]> {
  logger.log(`[${config.chain}] Creating DNA stream client...`);

  // Create the streaming client
  const client = new StreamClient({
    url: dnaUrl,
    token: authToken,
    // Reconnect automatically on errors
    onReconnect: async (err, retryCount) => {
      logger.warn(`[${config.chain}] DNA stream disconnected, retry ${retryCount}:`, {
        error: err.details,
      });
      
      // Retry up to 5 times
      if (retryCount < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        return { reconnect: true };
      }
      
      return { reconnect: false };
    },
  });

  // Build the filter for Transfer events
  const transferKey = hash.getSelectorFromName('Transfer');
  
  const filter = Filter.create()
    .withHeader({ weak: false })
    .addEvent((ev) =>
      ev
        .withFromAddress(FieldElement.fromBigInt(contractAddress))
        .withKeys([FieldElement.fromBigInt(transferKey)])
        .withIncludeReceipt(true)
        .withIncludeTransaction(true)
    )
    .encode();

  logger.log(`[${config.chain}] Configuring DNA stream filter...`);

  // Configure the stream
  client.configure({
    filter,
    batchSize: 10, // Process 10 blocks at a time
    cursor: {
      orderKey: Long.fromNumber(startingBlock),
      uniqueKey: new Uint8Array(), // Empty unique key for starting cursor
    },
    finality: v1alpha2.DataFinality.DATA_STATUS_ACCEPTED,
  });

  logger.log(`[${config.chain}] Starting DNA stream from block ${startingBlock}...`);

  const allEvents: TransferEventData[] = [];
  let blocksProcessed = 0;
  let eventsProcessed = 0;

  try {
    // Stream blocks as an async iterator
    for await (const message of client) {
      // Handle data messages
      if (message.data) {
        // Cast to the correct type
        const blockData = message.data as any;
        const blockNumber = Number(blockData.cursor?.orderKey || 0);
        
        // Check if we've reached the ending block
        if (blockNumber > endingBlock) {
          logger.log(
            `[${config.chain}] Reached ending block ${endingBlock}, stopping stream`
          );
          break;
        }

        // Parse events from this block
        const blockEvents = parseApibaraStreamBlock(
          blockData,
          config,
          facilitator,
          facilitatorConfig
        );

        allEvents.push(...blockEvents);
        blocksProcessed++;
        eventsProcessed += blockEvents.length;

        // Log progress every 100 blocks
        if (blocksProcessed % 100 === 0) {
          logger.log(
            `[${config.chain}] DNA stream progress: block ${blockNumber}, ` +
            `${blocksProcessed} blocks, ${eventsProcessed} events`
          );
        }

        // Safety limit: stop if we've collected enough events
        if (allEvents.length >= config.limit) {
          logger.warn(
            `[${config.chain}] Hit event limit ${config.limit}, stopping stream`
          );
          break;
        }
      }

      // Handle heartbeat messages (keep-alive)
      if (message.heartbeat) {
        logger.log(`[${config.chain}] DNA heartbeat received`);
      }

      // Handle invalidate messages (chain reorg)
      if (message.invalidate) {
        logger.warn(
          `[${config.chain}] Chain reorg detected, cursor reset to block ${message.invalidate.cursor?.orderKey}`
        );
      }
    }

    logger.log(
      `[${config.chain}] DNA stream finished: ${blocksProcessed} blocks, ${eventsProcessed} events`
    );

    return allEvents;
  } catch (error) {
    logger.error(`[${config.chain}] DNA stream error:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Estimate block number from timestamp
 * 
 * Uses a known recent reference point and calculates from there.
 * This is more accurate than calculating from genesis.
 */
function estimateBlockFromTimestamp(date: Date): number {
  // Known reference point: Nov 3, 2025 08:00 UTC = block 3,354,000 (approximate current)
  const REFERENCE_TIMESTAMP = 1762084800; // Nov 3, 2025 08:00:00 UTC
  const REFERENCE_BLOCK = 3354000;
  const STARKNET_BLOCK_TIME_SECONDS = 6;
  
  // Calculate blocks from reference point
  const timestampSeconds = Math.floor(date.getTime() / 1000);
  const secondsFromReference = timestampSeconds - REFERENCE_TIMESTAMP;
  const blocksFromReference = Math.floor(secondsFromReference / STARKNET_BLOCK_TIME_SECONDS);
  const estimatedBlock = REFERENCE_BLOCK + blocksFromReference;
  
  // Ensure we don't go below 0
  return Math.max(0, estimatedBlock);
}
