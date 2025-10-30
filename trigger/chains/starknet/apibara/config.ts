import {
  SyncConfig,
  PaginationStrategy,
  QueryProvider,
  Chain,
} from '@/trigger/types';
import { buildQuery, transformResponse } from './query.js';
import { ONE_DAY_IN_MS, ONE_MINUTE_IN_SECONDS } from '@/trigger/constants';
import { FACILITATORS_BY_CHAIN } from '@/trigger/config';

export const starknetApibaraConfig: SyncConfig = {
  cron: '0 * * * *', // Run every hour
  maxDurationInSeconds: ONE_MINUTE_IN_SECONDS * 15, // 15 minutes max
  chain: 'starknet',
  provider: QueryProvider.APIBARA,
  apiUrl: process.env.APIBARA_DNA_URL || 'https://mainnet.starknet.a5a.ch',
  paginationStrategy: PaginationStrategy.TIME_WINDOW,
  timeWindowInMs: ONE_DAY_IN_MS * 1, // 1-day windows
  limit: 5_000, // 5,000 events per window (Apibara is more efficient)
  facilitators: FACILITATORS_BY_CHAIN(Chain.STARKNET),
  buildQuery,
  transformResponse,
};

