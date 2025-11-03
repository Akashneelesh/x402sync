/**
 * Test script for Apibara DNA streaming implementation
 * 
 * This script tests the DNA API connection and data fetching
 * without running the full sync task.
 */

import { fetchApibara } from '../trigger/fetch/apibara/fetch';
import { QueryProvider, Chain } from '../trigger/types';
import { FACILITATORS_BY_CHAIN } from '../trigger/config';

async function testApibaraDNA() {
  console.log('🧪 Testing Apibara DNA Streaming Implementation\n');
  
  const dnaUrl = process.env.APIBARA_DNA_URL || 'https://mainnet.starknet.a5a.ch';
  const authToken = process.env.APIBARA_AUTH_TOKEN;
  
  console.log('📋 Configuration:');
  console.log(`  DNA URL: ${dnaUrl}`);
  console.log(`  Auth Token: ${authToken ? '✅ Set' : '❌ Not set (optional)'}`);
  console.log();

  try {
    // Get facilitator config
    const facilitators = FACILITATORS_BY_CHAIN(Chain.STARKNET);
    if (facilitators.length === 0) {
      console.error('❌ No Starknet facilitators configured');
      return;
    }

    const facilitator = facilitators[0];
    const facilitatorConfig = facilitator.addresses.starknet?.[0];
    
    if (!facilitatorConfig) {
      console.error('❌ No Starknet address configured for facilitator');
      return;
    }

    console.log('🎯 Testing with:');
    console.log(`  Facilitator: ${facilitator.id}`);
    console.log(`  Address: ${facilitatorConfig.address}`);
    console.log(`  Token: ${facilitatorConfig.token.address}`);
    console.log();

    // Test fetching last 6 hours of data
    const now = new Date();
    const since = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6 hours ago

    console.log('⏱️  Fetching data:');
    console.log(`  From: ${since.toISOString()}`);
    console.log(`  To: ${now.toISOString()}`);
    console.log();

    const startTime = Date.now();

    const mockConfig = {
      chain: 'starknet',
      provider: QueryProvider.APIBARA,
      apiUrl: dnaUrl,
      limit: 1000,
    };

    const events = await fetchApibara(
      mockConfig as any,
      facilitator,
      facilitatorConfig,
      since,
      now
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log();
    console.log('✅ DNA Fetch Complete!');
    console.log();
    console.log('📊 Results:');
    console.log(`  Events fetched: ${events.length}`);
    console.log(`  Duration: ${duration}s`);
    console.log(`  Rate: ${(events.length / parseFloat(duration)).toFixed(1)} events/sec`);
    console.log();

    if (events.length > 0) {
      console.log('📋 Sample Event:');
      const sample = events[0];
      console.log(`  TX: ${sample.tx_hash}`);
      console.log(`  From: ${sample.sender.slice(0, 10)}...${sample.sender.slice(-8)}`);
      console.log(`  To: ${sample.recipient.slice(0, 10)}...${sample.recipient.slice(-8)}`);
      console.log(`  Amount: ${(sample.amount / 1_000_000).toFixed(6)} USDC`);
      console.log(`  Time: ${sample.block_timestamp.toISOString()}`);
      console.log(`  Provider: ${sample.provider}`);
      console.log();
    }

    console.log('🎉 Test Passed! DNA streaming is working correctly.');
    console.log();
    console.log('💡 Next Steps:');
    console.log('  1. Run the full sync: npm run trigger:dev');
    console.log('  2. Monitor performance improvements');
    console.log('  3. Check data quality with: npx tsx scripts/view-starknet-data.ts');
    
  } catch (error) {
    console.error('❌ Test Failed!');
    console.error();
    console.error('Error:', error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.stack) {
      console.error();
      console.error('Stack trace:');
      console.error(error.stack);
    }
    
    console.error();
    console.error('🔍 Troubleshooting:');
    console.error('  1. Check APIBARA_DNA_URL is correct');
    console.error('  2. Verify network connectivity');
    console.error('  3. Try adding APIBARA_AUTH_TOKEN if you have one');
    console.error('  4. Check DNA service status at status.apibara.com');
    
    process.exit(1);
  }
}

// Run the test
testApibaraDNA();

