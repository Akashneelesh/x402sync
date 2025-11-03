import { logger } from '@trigger.dev/sdk/v3';
import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';
import { num } from 'starknet';

/**
 * Parse a single block from Apibara DNA stream
 * 
 * DNA streams blocks with all events, transactions, and receipts included.
 * This is much more efficient than RPC which requires separate calls.
 */
export function parseApibaraStreamBlock(
  data: any, // Using any due to complex Apibara protobuf types
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData[] {
  if (!data.events || data.events.length === 0) {
    return [];
  }

  const blockNumber = Number(data.header?.blockNumber || 0);
  const blockTimestamp = data.header?.timestamp 
    ? new Date(Number(data.header.timestamp.seconds) * 1000)
    : new Date();

  const transferEvents: TransferEventData[] = [];

  for (let index = 0; index < data.events.length; index++) {
    try {
      const eventWithTx = data.events[index];
      
      if (!eventWithTx.event) {
        continue;
      }

      const parsedEvent = parseTransferEventFromDNA(
        eventWithTx,
        blockNumber,
        blockTimestamp,
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
        `[${config.chain}] Error parsing event at index ${index} in block ${blockNumber}:`,
        { error: String(error) }
      );
    }
  }

  return transferEvents;
}

/**
 * Parse a single Transfer event from Apibara DNA format
 */
function parseTransferEventFromDNA(
  eventWithTx: any, // Using any due to complex Apibara protobuf types
  blockNumber: number,
  blockTimestamp: Date,
  eventIndex: number,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData | null {
  const event = eventWithTx.event;
  const transaction = eventWithTx.transaction;
  const receipt = eventWithTx.receipt;

  if (!event || !event.keys || event.keys.length === 0) {
    return null;
  }

  let fromAddress: string;
  let toAddress: string;
  let amountLow: bigint;
  let amountHigh: bigint;

  // Detect event format based on keys length
  // DNA returns keys and data as Uint8Array (feltToHex converts them)
  const keys = event.keys.map(k => feltToHex(k));
  const data = event.data?.map(d => feltToHex(d)) || [];

  if (keys.length >= 3) {
    // Format A: indexed from/to in keys (SNIP-13 standard)
    fromAddress = keys[1];
    toAddress = keys[2];
    amountLow = parseBigInt(data[0] || '0x0');
    amountHigh = parseBigInt(data[1] || '0x0');
  } else {
    // Format B: from/to in data (legacy USDC format)
    if (data.length < 4) {
      return null;
    }
    fromAddress = data[0];
    toAddress = data[1];
    amountLow = parseBigInt(data[2] || '0x0');
    amountHigh = parseBigInt(data[3] || '0x0');
  }

  // Parse amount (u256: low + high << 128)
  const amount = amountLow + (amountHigh << BigInt(128));

  // Get transaction sender from DNA data
  let transactionFrom = facilitatorConfig.address;
  if (transaction) {
    // DNA provides different transaction types
    const invokeV1 = (transaction as any).invokeV1;
    const invokeV3 = (transaction as any).invokeV3;
    
    if (invokeV1?.senderAddress) {
      transactionFrom = feltToHex(invokeV1.senderAddress);
    } else if (invokeV3?.senderAddress) {
      transactionFrom = feltToHex(invokeV3.senderAddress);
    }
  }

  // Get transaction hash
  let txHash = '0x0';
  if (receipt?.transactionHash) {
    txHash = feltToHex(receipt.transactionHash);
  } else if (transaction) {
    const meta = (transaction as any).meta;
    if (meta?.hash) {
      txHash = feltToHex(meta.hash);
    }
  }

  return {
    address: facilitatorConfig.token.address,
    transaction_from: transactionFrom,
    sender: fromAddress,
    recipient: toAddress,
    amount: Number(amount),
    block_timestamp: blockTimestamp,
    tx_hash: txHash,
    chain: config.chain,
    provider: config.provider,
    decimals: facilitatorConfig.token.decimals,
    facilitator_id: facilitator.id,
    log_index: eventIndex,
  };
}

/**
 * Convert Apibara felt (Uint8Array) to hex string
 */
function feltToHex(felt: Uint8Array | string | undefined | null): string {
  if (!felt) {
    return '0x0';
  }
  
  if (typeof felt === 'string') {
    return felt.startsWith('0x') ? felt : `0x${felt}`;
  }

  // Convert Uint8Array to hex
  const hex = Array.from(felt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return hex ? `0x${hex}` : '0x0';
}

/**
 * Parse value to BigInt
 */
function parseBigInt(value: any): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    return num.toBigInt(value);
  }
  if (value instanceof Uint8Array) {
    return num.toBigInt(feltToHex(value));
  }
  return BigInt(0);
}
