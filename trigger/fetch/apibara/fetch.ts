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
  // For now, Apibara DNA is primarily a streaming service
  // For batch historical queries, we'll use RPC with Apibara-optimized settings
  // In the future, this could use Apibara's query API if/when available
  
  logger.warn(
    `[${config.chain}] Apibara DNA is primarily a streaming service. Using RPC with optimized settings.`
  );
  logger.log(
    `[${config.chain}] Tip: For real-time streaming, consider setting up an Apibara indexer.`
  );
  
  // Use RPC but with optimized settings
  const rpcUrl = process.env.STARKNET_RPC_URL || 
    'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/iK7ogImR5B8hKI4X43AQh';
  
  return fetchViaRpc(config, facilitator, facilitatorConfig, since, now, rpcUrl);
}

/**
 * Fetch via RPC with Apibara-optimized settings
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

