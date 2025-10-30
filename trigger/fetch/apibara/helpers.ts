import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';

/**
 * Parse Apibara events into TransferEventData
 * Apibara provides structured event data with block context
 */
export async function parseApibaraEvents(
  events: any[],
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): Promise<TransferEventData[]> {
  if (events.length === 0) return [];

  logger.log(`[${config.chain}] Parsing ${events.length} Apibara events`);

  const transferEvents: TransferEventData[] = [];

  for (let index = 0; index < events.length; index++) {
    try {
      const event = events[index];
      const parsedEvent = parseTransferEvent(
        event,
        index,
        config,
        facilitator,
        facilitatorConfig
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
 * Parse a single Transfer event from Apibara
 */
function parseTransferEvent(
  event: any,
  eventIndex: number,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData | null {
  // Apibara event structure:
  // event.fromAddress: contract address
  // event.keys: event keys (including event selector)
  // event.data: event data
  // event.transaction: transaction details
  // event.block: block details

  if (!event || !event.keys || !event.data) {
    logger.warn(
      `[${config.chain}] Event missing required fields at index ${eventIndex}`
    );
    return null;
  }

  let fromAddress: string;
  let toAddress: string;
  let amountLow: bigint;
  let amountHigh: bigint;

  // Detect event format based on keys length
  if (event.keys.length >= 3) {
    // Format A: indexed from/to in keys (SNIP-13)
    fromAddress = feltToHex(event.keys[1]);
    toAddress = feltToHex(event.keys[2]);
    amountLow = feltToBigInt(event.data[0] || '0x0');
    amountHigh = feltToBigInt(event.data[1] || '0x0');
  } else {
    // Format B: from/to in data (current USDC)
    if (!event.data || event.data.length < 4) {
      logger.warn(
        `[${config.chain}] Event missing data fields at index ${eventIndex}`
      );
      return null;
    }
    fromAddress = feltToHex(event.data[0]);
    toAddress = feltToHex(event.data[1]);
    amountLow = feltToBigInt(event.data[2] || '0x0');
    amountHigh = feltToBigInt(event.data[3] || '0x0');
  }

  // Parse amount (u256)
  const amount = amountLow + (amountHigh << BigInt(128));

  // Get block timestamp
  const blockTimestamp = event.block?.timestamp
    ? new Date(Number(event.block.timestamp) * 1000)
    : new Date();

  // Get transaction sender
  const transactionFrom = event.transaction?.senderAddress
    ? feltToHex(event.transaction.senderAddress)
    : facilitatorConfig.address;

  return {
    address: facilitatorConfig.token.address,
    transaction_from: transactionFrom,
    sender: fromAddress,
    recipient: toAddress,
    amount: Number(amount),
    block_timestamp: blockTimestamp,
    tx_hash: event.transaction?.hash || event.transactionHash || '',
    chain: config.chain,
    provider: config.provider,
    decimals: facilitatorConfig.token.decimals,
    facilitator_id: facilitator.id,
    log_index: eventIndex,
  };
}

/**
 * Convert felt (FieldElement) to hex string
 */
function feltToHex(felt: any): string {
  if (typeof felt === 'string') {
    // Already a string, ensure it has 0x prefix
    return felt.startsWith('0x') ? felt : `0x${felt}`;
  }

  if (typeof felt === 'bigint') {
    return `0x${felt.toString(16)}`;
  }

  // If it's a FieldElement object
  if (felt && felt.toBigInt) {
    return `0x${felt.toBigInt().toString(16)}`;
  }

  // Fallback
  return String(felt);
}

/**
 * Convert felt to BigInt
 */
function feltToBigInt(felt: any): bigint {
  if (typeof felt === 'bigint') {
    return felt;
  }

  if (typeof felt === 'string') {
    return BigInt(felt);
  }

  if (felt && felt.toBigInt) {
    return felt.toBigInt();
  }

  return BigInt(0);
}

