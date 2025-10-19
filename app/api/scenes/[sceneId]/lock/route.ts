/**
 * Lock Acquisition API
 * POST /api/scenes/[sceneId]/lock
 *
 * Acquires a 1-minute lock on a slot before payment
 * Note: sceneId in the route is the parent scene ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface LockRequest {
  slot: 'A' | 'B' | 'C';
  userAddress: string;
  fid?: number;
}

interface CurrentLockRow {
  locked_by_address: string;
  locked_until: Date;
  status: string;
}

interface LockResultRow {
  id: number;
  locked_until: Date;
  status: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId: sceneIdParam } = await params;
    const body: LockRequest = await request.json();

    const { slot, userAddress, fid } = body;

    // Validate inputs
    if (!slot || !['A', 'B', 'C'].includes(slot)) {
      return NextResponse.json(
        { error: 'Invalid slot. Must be A, B, or C' },
        { status: 400 }
      );
    }

    if (!userAddress || !userAddress.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid user address' },
        { status: 400 }
      );
    }

    // Parse parent ID (sceneId in route context is the parent scene)
    // Genesis scene is ID 0 in the smart contract
    const parentId = sceneIdParam === 'genesis' || sceneIdParam === 'null'
      ? 0
      : parseInt(sceneIdParam, 10);

    if (isNaN(parentId)) {
      return NextResponse.json(
        { error: 'Invalid parent ID' },
        { status: 400 }
      );
    }

    // Attempt to acquire lock
    // This uses INSERT ... ON CONFLICT to atomically lock the slot
    const lockExpiry = new Date(Date.now() + 60000); // 1 minute from now

    const result = await query<LockResultRow>(`
      INSERT INTO scenes (
        parent_id,
        slot,
        status,
        locked_until,
        locked_by_address,
        locked_by_fid,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'locked', $3, $4, $5, NOW(), NOW())
      ON CONFLICT (parent_id, slot)
      DO UPDATE SET
        status = CASE
          WHEN scenes.locked_until < NOW() OR scenes.status = 'lock_expired' OR scenes.status = 'failed'
            THEN 'locked'
          ELSE scenes.status
        END,
        locked_until = CASE
          WHEN scenes.locked_until < NOW() OR scenes.status = 'lock_expired' OR scenes.status = 'failed'
            THEN $3
          ELSE scenes.locked_until
        END,
        locked_by_address = CASE
          WHEN scenes.locked_until < NOW() OR scenes.status = 'lock_expired' OR scenes.status = 'failed'
            THEN $4
          ELSE scenes.locked_by_address
        END,
        locked_by_fid = CASE
          WHEN scenes.locked_until < NOW() OR scenes.status = 'lock_expired' OR scenes.status = 'failed'
            THEN $5
          ELSE scenes.locked_by_fid
        END,
        updated_at = CASE
          WHEN scenes.locked_until < NOW() OR scenes.status = 'lock_expired' OR scenes.status = 'failed'
            THEN NOW()
          ELSE scenes.updated_at
        END
      WHERE scenes.locked_until < NOW() OR scenes.status = 'lock_expired' OR scenes.status = 'failed'
      RETURNING id, locked_until, status
    `, [parentId, slot, lockExpiry, userAddress.toLowerCase(), fid || null]);

    // Check if lock was acquired
    if (result.rowCount === 0) {
      // Lock was not acquired - slot is already locked by someone else
      // Fetch current lock info
      const currentLock = await query<CurrentLockRow>(`
        SELECT locked_by_address, locked_until, status
        FROM scenes
        WHERE parent_id = $1 AND slot = $2
      `, [parentId, slot]);

      if (currentLock.rows.length > 0) {
        const lock = currentLock.rows[0];

        // Check if it's completed
        if (lock.status === 'completed') {
          return NextResponse.json(
            { error: 'Slot already claimed and completed' },
            { status: 409 }
          );
        }

        // Check if lock is still valid
        const lockExpiry = new Date(lock.locked_until);
        const now = new Date();

        if (lockExpiry > now) {
          const secondsRemaining = Math.ceil((lockExpiry.getTime() - now.getTime()) / 1000);
          return NextResponse.json(
            {
              error: `Slot currently locked by ${lock.locked_by_address}`,
              lockedBy: lock.locked_by_address,
              expiresIn: secondsRemaining
            },
            { status: 409 }
          );
        }
      }

      return NextResponse.json(
        { error: 'Failed to acquire lock. Please try again.' },
        { status: 409 }
      );
    }

    const lockedScene = result.rows[0];

    return NextResponse.json({
      success: true,
      sceneId: lockedScene.id,
      lockExpires: lockedScene.locked_until,
      expiresIn: 60 // seconds
    });

  } catch (error) {
    console.error('Error acquiring lock:', error);
    return NextResponse.json(
      { error: 'Failed to acquire lock' },
      { status: 500 }
    );
  }
}
