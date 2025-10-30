import {
  SyncConfig,
  Facilitator,
  FacilitatorConfig,
  TransferEventData,
} from '@/trigger/types';

/**
 * Build Apibara query
 * Apibara uses filter-based queries instead of string-based queries
 * The actual filtering is done in the fetch logic
 */
export function buildQuery(
  config: SyncConfig,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): string {
  // Apibara doesn't use string queries like BigQuery
  // Return a descriptive string for logging purposes
  return `Apibara query for USDC transfers on ${config.chain} from ${facilitatorConfig.address} between ${since.toISOString()} and ${now.toISOString()}`;
}

/**
 * Transform Apibara response
 * This is a pass-through since the fetch logic already returns TransferEventData[]
 */
export function transformResponse(
  data: unknown,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData[] {
  // Data is already transformed in the fetch logic
  return data as TransferEventData[];
}

