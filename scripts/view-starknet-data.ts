import { prisma } from '../db/client';

async function viewStarknetData() {
  console.log('📊 Fetching Starknet transfer data...\n');
  
  try {
    // Get all Starknet transfers
    const transfers = await prisma.transferEvent.findMany({
      where: {
        chain: 'starknet',
      },
      orderBy: {
        block_timestamp: 'desc',
      },
      take: 50, // Limit to 50 most recent
    });

    console.log(`✅ Found ${transfers.length} Starknet transfers\n`);
    
    if (transfers.length === 0) {
      console.log('No Starknet transfers found in database.');
      return;
    }

    // Summary stats
    const totalAmount = transfers.reduce((sum, t) => sum + Number(t.amount), 0);
    const uniqueFacilitators = new Set(transfers.map(t => t.facilitator_id)).size;
    const uniqueSenders = new Set(transfers.map(t => t.sender)).size;
    const uniqueRecipients = new Set(transfers.map(t => t.recipient)).size;

    console.log('📈 Summary:');
    console.log(`  Total transfers: ${transfers.length}`);
    console.log(`  Total amount: ${(totalAmount / 1_000_000).toFixed(2)} USDC`);
    console.log(`  Unique facilitators: ${uniqueFacilitators}`);
    console.log(`  Unique senders: ${uniqueSenders}`);
    console.log(`  Unique recipients: ${uniqueRecipients}`);
    console.log();

    // Show first 10 transfers
    console.log('📋 Recent Transfers (first 10):');
    console.log('─'.repeat(100));
    
    for (let i = 0; i < Math.min(10, transfers.length); i++) {
      const t = transfers[i];
      console.log(`\n${i + 1}. TX: ${t.tx_hash}`);
      console.log(`   Time: ${t.block_timestamp.toISOString()}`);
      console.log(`   From: ${t.sender.slice(0, 10)}...${t.sender.slice(-8)}`);
      console.log(`   To: ${t.recipient.slice(0, 10)}...${t.recipient.slice(-8)}`);
      console.log(`   Amount: ${(Number(t.amount) / 1_000_000).toFixed(6)} USDC`);
      console.log(`   Facilitator: ${t.facilitator_id}`);
    }

    console.log('\n' + '─'.repeat(100));
    
    // Group by facilitator
    console.log('\n📊 By Facilitator:');
    const byFacilitator = transfers.reduce((acc, t) => {
      const id = t.facilitator_id;
      if (!acc[id]) {
        acc[id] = { count: 0, amount: 0 };
      }
      acc[id].count++;
      acc[id].amount += Number(t.amount);
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    for (const [id, stats] of Object.entries(byFacilitator)) {
      console.log(`  ${id}: ${stats.count} transfers, ${(stats.amount / 1_000_000).toFixed(2)} USDC`);
    }

    console.log('\n✅ Done! View more at http://localhost:5555 (Prisma Studio)');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

viewStarknetData();

