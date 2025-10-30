-- CreateIndex
CREATE INDEX "TransferEvent_block_timestamp_facilitator_id_idx" ON "TransferEvent"("block_timestamp", "facilitator_id");

-- CreateIndex
CREATE INDEX "TransferEvent_chain_block_timestamp_facilitator_id_idx" ON "TransferEvent"("chain", "block_timestamp", "facilitator_id");

-- CreateIndex
CREATE INDEX "TransferEvent_sender_idx" ON "TransferEvent"("sender");

-- CreateIndex
CREATE INDEX "TransferEvent_recipient_idx" ON "TransferEvent"("recipient");
