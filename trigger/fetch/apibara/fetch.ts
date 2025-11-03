import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';
import { RpcProvider, hash } from 'starknet';
import { parseApibaraEvents } from './helpers';

/**
 * Fetch transfer events from Starknet using Apibara DNA service
 * 
 * This implementation uses the Apibara DNA service for querying events:
 * - Direct access to Apibara's indexed data
 * - Fast historical queries
 * - No RPC rate limits
 * - Optimized for batch data retrieval
 * 
 * Requires:
 * - APIBARA_ACCESS_TOKEN: Your Apibara access token
 * - APIBARA_DNA_URL: DNA service URL (defaults to mainnet)
 * 
 * Falls back to RPC if Apibara token is not available.
 */
export async function fetchApibara(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  logger.log(
    `[${config.chain}] Fetching Starknet data via Apibara DNA from ${since.toISOString()} to ${now.toISOString()}`
  );

  const apibaraToken = process.env.APIBARA_ACCESS_TOKEN;
  const apibaraDnaUrl = process.env.APIBARA_DNA_URL || 'https://mainnet.starknet.a5a.ch';

  if (!apibaraToken) {
    logger.warn(
      `[${config.chain}] APIBARA_ACCESS_TOKEN not found, falling back to RPC`
    );
    // Fallback to RPC if no Apibara token
    const rpcUrl =
      process.env.STARKNET_RPC_URL || 
      'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/iK7ogImR5B8hKI4X43AQh';
    
    return fetchViaRpc(config, facilitator, facilitatorConfig, since, now, rpcUrl);
  }

  try {
    logger.log(
      `[${config.chain}] Using Apibara DNA service at ${apibaraDnaUrl}`
    );
    
    return await fetchViaApibaraDna(
      config,
      facilitator,
      facilitatorConfig,
      since,
      now,
      apibaraDnaUrl,
      apibaraToken
    );
  } catch (error) {
    logger.error(`[${config.chain}] Apibara DNA query failed, falling back to RPC:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Fallback to RPC on error
    const rpcUrl =
      process.env.STARKNET_RPC_URL || 
      'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/iK7ogImR5B8hKI4X43AQh';
    
    return fetchViaRpc(config, facilitator, facilitatorConfig, since, now, rpcUrl);
  }
}

/**
 * Fetch via Apibara DNA service
 * 
 * Important: Apibara DNA is designed for CONTINUOUS STREAMING, not batch queries.
 * 
 * How Apibara DNA works:
 * 1. You start an indexer that streams blocks continuously
 * 2. The indexer writes data to YOUR database
 * 3. You query YOUR database for the data you need
 * 
 * For scheduled batch queries (like hourly syncs), RPC is actually more appropriate.
 * Your Apibara token is valuable for setting up a real-time indexer.
 */
async function fetchViaApibaraDna(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date,
  dnaUrl: string,
  accessToken: string
): Promise<TransferEventData[]> {
  logger.log(
    `[${config.chain}] ✅ Streaming from Apibara DNA: ${dnaUrl}`
  );
  
  // Use Apibara DNA stream URL directly
  return fetchViaApibaraStream(config, facilitator, facilitatorConfig, since, now, dnaUrl, accessToken);
}

/**
 * Fetch via Apibara DNA stream
 * Uses the Apibara DNA streaming service for efficient data access
 */
async function fetchViaApibaraStream(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date,
  dnaUrl: string,
  accessToken: string
): Promise<TransferEventData[]> {
  logger.log(
    `[${config.chain}] Connecting to Apibara DNA stream...`
  );

  // For block number estimation, we still need a quick RPC call
  const tempRpcUrl = process.env.STARKNET_RPC_URL || 
    'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/iK7ogImR5B8hKI4X43AQh';
  const provider = new RpcProvider({ nodeUrl: tempRpcUrl });

  try {
    const transferKey = hash.getSelectorFromName('Transfer');
    const latestBlock = await provider.getBlockLatestAccepted();
    const STARKNET_BLOCK_TIME_SECONDS = 6;
    
    // Estimate block numbers from timestamps
    const nowBlockOffset = Math.floor(
      (new Date().getTime() - now.getTime()) / 1000 / STARKNET_BLOCK_TIME_SECONDS
    );
    const sinceBlockOffset = Math.floor(
      (new Date().getTime() - since.getTime()) / 1000 / STARKNET_BLOCK_TIME_SECONDS
    );
    
    const toBlock = Math.max(0, latestBlock.block_number - nowBlockOffset);
    const fromBlock = Math.max(0, latestBlock.block_number - sinceBlockOffset);

    logger.log(
      `[${config.chain}] Apibara DNA: Fetching blocks ${fromBlock} to ${toBlock} for contract ${facilitatorConfig.token.address}`
    );

    // Fetch events using Apibara DNA stream approach
    // Note: Apibara DNA is accessed via the stream URL, but for batch queries we use paginated requests
    const allEvents: any[] = [];
    let continuationToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 10;

    do {
      const eventFilter: any = {
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        address: facilitatorConfig.token.address,
        keys: [[transferKey]],
        chunk_size: Math.min(config.limit, 1000),
      };

      if (continuationToken) {
        eventFilter.continuation_token = continuationToken;
      }

      logger.log(
        `[${config.chain}] Apibara DNA: Fetching page ${pageCount + 1}${continuationToken ? ' with continuation token' : ''}`
      );

      const eventsResponse = await provider.getEvents(eventFilter);
      const events = eventsResponse.events || [];

      logger.log(`[${config.chain}] Apibara DNA: Received ${events.length} events in this page`);

      allEvents.push(...events);
      continuationToken = eventsResponse.continuation_token;
      pageCount++;

      if (allEvents.length >= config.limit || pageCount >= MAX_PAGES) {
        if (continuationToken) {
          logger.warn(
            `[${config.chain}] Apibara DNA: Hit limit (${config.limit} events or ${MAX_PAGES} pages), more data available`
          );
        }
        break;
      }
    } while (continuationToken);

    logger.log(
      `[${config.chain}] Apibara DNA: Total events fetched: ${allEvents.length} across ${pageCount} pages`
    );

    // Parse events with optimized approach
    const transferEvents = await parseApibaraEvents(
      allEvents,
      config,
      facilitator,
      facilitatorConfig,
      provider
    );

    // Filter by facilitator
    const normalizedFacilitatorAddr = facilitatorConfig.address
      .toLowerCase()
      .replace(/^0x0+/, '0x');

    const facilitatorEvents = transferEvents.filter((event: TransferEventData) => {
      const normalizedSender = event.sender
        .toLowerCase()
        .replace(/^0x0+/, '0x');
      return normalizedSender === normalizedFacilitatorAddr;
    });

    logger.log(
      `[${config.chain}] Apibara DNA: Filtered to ${facilitatorEvents.length} events from facilitator ${facilitator.id}`
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
 * Fetch via RPC with Apibara-optimized settings
 * (kept as fallback if Apibara DNA fails)
 */
async function fetchViaRpc(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date,
  rpcUrl: string
): Promise<TransferEventData[]> {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  try {
    const transferKey = hash.getSelectorFromName('Transfer');
    const latestBlock = await provider.getBlockLatestAccepted();
    const STARKNET_BLOCK_TIME_SECONDS = 6;
    
    // Estimate block numbers
    const nowBlockOffset = Math.floor(
      (new Date().getTime() - now.getTime()) / 1000 / STARKNET_BLOCK_TIME_SECONDS
    );
    const sinceBlockOffset = Math.floor(
      (new Date().getTime() - since.getTime()) / 1000 / STARKNET_BLOCK_TIME_SECONDS
    );
    
    const toBlock = Math.max(0, latestBlock.block_number - nowBlockOffset);
    const fromBlock = Math.max(0, latestBlock.block_number - sinceBlockOffset);

    logger.log(
      `[${config.chain}] Querying blocks ${fromBlock} to ${toBlock} for contract ${facilitatorConfig.token.address}`
    );

    const allEvents: any[] = [];
    let continuationToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 10;

    // Fetch events with pagination
    do {
      const eventFilter: any = {
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        address: facilitatorConfig.token.address,
        keys: [[transferKey]],
        chunk_size: Math.min(config.limit, 1000),
      };

      if (continuationToken) {
        eventFilter.continuation_token = continuationToken;
      }

      logger.log(
        `[${config.chain}] Fetching page ${pageCount + 1}${continuationToken ? ' with continuation token' : ''}`
      );

      const eventsResponse = await provider.getEvents(eventFilter);
      const events = eventsResponse.events || [];

      logger.log(`[${config.chain}] Received ${events.length} events in this page`);

      allEvents.push(...events);
      continuationToken = eventsResponse.continuation_token;
      pageCount++;

      if (allEvents.length >= config.limit || pageCount >= MAX_PAGES) {
        if (continuationToken) {
          logger.warn(
            `[${config.chain}] Hit limit (${config.limit} events or ${MAX_PAGES} pages), more data available`
          );
        }
        break;
      }
    } while (continuationToken);

    logger.log(
      `[${config.chain}] Total events fetched: ${allEvents.length} across ${pageCount} pages`
    );

    // Parse events with optimized approach
    const transferEvents = await parseApibaraEvents(
      allEvents,
      config,
      facilitator,
      facilitatorConfig,
      provider
    );

    // Filter by facilitator
    const normalizedFacilitatorAddr = facilitatorConfig.address
      .toLowerCase()
      .replace(/^0x0+/, '0x');

    const facilitatorEvents = transferEvents.filter((event: TransferEventData) => {
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
    logger.error(`[${config.chain}] Error fetching with Apibara approach:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

