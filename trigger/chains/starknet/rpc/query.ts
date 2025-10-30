import {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
  StarknetTransferRow,
} from '@/trigger/types';


export function buildQuery(
  config: SyncConfig,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): string {
  return `Starknet RPC query for USDC transfers on ${config.chain} from ${facilitatorConfig.address} between ${since.toISOString()} and ${now.toISOString()}`;
}


export function transformResponse(
  data: unknown,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData[] {
  // The transformation is done in the fetch layer
  // This function is kept for interface consistency
  return data as TransferEventData[];
}

