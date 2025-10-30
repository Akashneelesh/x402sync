import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';
import { RpcProvider, hash } from 'starknet';
import { parseStarknetEvents } from './helpers.js';

/**
 * Fetch transfer events from Starknet using RPC provider
 */
export async function fetchStarknetRpc(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  logger.log(
    `[${config.chain}] Fetching Starknet RPC data from ${since.toISOString()} to ${now.toISOString()}`
  );

  const rpcUrl =
    process.env.STARKNET_RPC_URL || 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/iK7ogImR5B8hKI4X43AQh';
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  try {
    // Get Transfer events
    // Transfer event key: keccak256("Transfer")
    const transferKey = hash.getSelectorFromName('Transfer');

    // Convert timestamps to approximate block numbers
    // Starknet has ~6 second block time
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
      `[${config.chain}] Querying blocks ${fromBlock} to ${toBlock} (estimated from timestamps) for contract ${facilitatorConfig.token.address}`
    );

    const allEvents: any[] = [];
    let continuationToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 10; // Safety limit for pagination

    // Paginate through all events
    do {
      const eventFilter: any = {
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        address: facilitatorConfig.token.address,
        keys: [[transferKey]], // Filter for Transfer events
        chunk_size: Math.min(config.limit, 1000), // Limit chunk size to avoid timeouts
      };

      if (continuationToken) {
        eventFilter.continuation_token = continuationToken;
      }

      logger.log(
        `[${config.chain}] Fetching page ${pageCount + 1}${continuationToken ? ' with continuation token' : ''}`
      );

      // Fetch events
      const eventsResponse = await provider.getEvents(eventFilter);
      const events = eventsResponse.events || [];

      logger.log(`[${config.chain}] Received ${events.length} events in this page`);

      allEvents.push(...events);
      continuationToken = eventsResponse.continuation_token;
      pageCount++;

      // Stop if we hit the limit or safety max
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

    // Parse and transform events (with efficient batching)
    const transferEvents = await parseStarknetEvents(
      allEvents,
      config,
      facilitator,
      facilitatorConfig,
      provider
    );

    // Normalize facilitator address for comparison (remove leading zeros)
    const normalizedFacilitatorAddr = facilitatorConfig.address
      .toLowerCase()
      .replace(/^0x0+/, '0x');

    // Filter by facilitator address (check if Transfer event sender matches facilitator)
    const facilitatorEvents = transferEvents.filter((event: TransferEventData) => {
      // Normalize event sender address (remove leading zeros)
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
    logger.error(`[${config.chain}] Error fetching from Starknet RPC:`, {
      error: String(error),
    });
    throw error;
  }
}

