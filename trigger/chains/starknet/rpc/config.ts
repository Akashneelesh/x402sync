import {
  SyncConfig,
  PaginationStrategy,
  QueryProvider,
  Chain,
} from '@/trigger/types';
import { buildQuery, transformResponse } from './query';
import { ONE_DAY_IN_MS, ONE_MINUTE_IN_SECONDS } from '@/trigger/constants';
import { FACILITATORS_BY_CHAIN } from '@/trigger/config';

export const starknetRpcConfig: SyncConfig = {
  cron: '0 * * * *', // Run every hour
  maxDurationInSeconds: ONE_MINUTE_IN_SECONDS * 15,
  chain: 'starknet',
  provider: QueryProvider.STARKNET_RPC,
  apiUrl: 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/iK7ogImR5B8hKI4X43AQh', // Used a burner account 
  paginationStrategy: PaginationStrategy.TIME_WINDOW,
  timeWindowInMs: ONE_DAY_IN_MS * 1, // 1-day windows for initial sync, can increase later
  limit: 2_000, // Conservative limit to ensure fast completion 
  facilitators: FACILITATORS_BY_CHAIN(Chain.STARKNET),
  buildQuery,
  transformResponse,
};

