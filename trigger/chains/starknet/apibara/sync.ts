import { createChainSyncTask } from '../../../sync';
import { starknetApibaraConfig } from './config';

export const starknetApibaraSyncTransfers = createChainSyncTask(starknetApibaraConfig);

