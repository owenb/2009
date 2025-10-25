/**
 * Earnings Balance API
 * GET /api/earnings/balance?address=0x...
 *
 * Gets claimable earnings for a user address from the smart contract
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import VideoAdventureABI from '@/lib/VideoAdventure.abi.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');

    // Validate address
    if (!address || !address.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid address' },
        { status: 400 }
      );
    }

    // Create public client for Base mainnet
    const client = createPublicClient({
      chain: base,
      transport: http()
    });

    // Read earnings from contract
    const earnings = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: VideoAdventureABI,
      functionName: 'earnings',
      args: [address as Address]
    }) as bigint;

    // Convert to ETH (from wei)
    const earningsInEth = Number(earnings) / 1e18;

    return NextResponse.json({
      address,
      earningsWei: earnings.toString(),
      earningsEth: earningsInEth.toFixed(6),
      hasEarnings: earnings > BigInt(0)
    });

  } catch (error) {
    console.error('Error fetching earnings balance:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch earnings balance',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
