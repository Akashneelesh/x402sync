import { createChainSyncTask } from '../../../sync';
import { starknetRpcConfig } from './config';

export const starknetRpcSyncTransfers = createChainSyncTask(starknetRpcConfig);

