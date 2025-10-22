import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

interface SceneNode {
  id: number;
  parentId: number | null;
  slot: 'A' | 'B' | 'C' | null;
  slotLabel: string | null;
  status: string;
  creatorAddress: string | null;
  viewCount: number;
  children: SceneNode[];
}

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<number, { tree: SceneNode; timestamp: number; totalScenes: number }>();

/**
 * GET /api/scenes/tree?movieId=1
 *
 * Fetches the entire scene tree structure for map visualization.
 * Returns a hierarchical tree starting from the genesis scene.
 * Scoped by movie_id for multi-movie support.
 * Cached for 5 minutes to optimize performance for thousands of scenes.
 */
export async function GET(request: NextRequest) {
  try {
    // Get movie_id from query params (default to 1 for "2009" movie)
    const { searchParams } = new URL(request.url);
    const movieId = parseInt(searchParams.get('movieId') || '1', 10);

    if (isNaN(movieId) || movieId < 1) {
      return NextResponse.json(
        { error: 'Invalid movieId parameter' },
        { status: 400 }
      );
    }

    // Check cache
    const cached = cache.get(movieId);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log(`✅ Cache hit for movie ${movieId} tree (${cached.totalScenes} scenes)`);
      return NextResponse.json({
        tree: cached.tree,
        totalScenes: cached.totalScenes,
        cached: true
      });
    }

    // Fetch all scenes (only completed ones for the map), scoped by movie_id
    const result = await pool.query(`
      SELECT
        id,
        parent_id as "parentId",
        slot,
        slot_label as "slotLabel",
        status,
        creator_address as "creatorAddress",
        view_count as "viewCount",
        created_at as "createdAt"
      FROM scenes
      WHERE status = 'completed' AND movie_id = $1
      ORDER BY created_at ASC
    `, [movieId]);

    const scenes = result.rows;

    if (scenes.length === 0) {
      return NextResponse.json({
        tree: {
          id: 0,
          parentId: null,
          slot: null,
          slotLabel: 'Intro',
          status: 'completed',
          creatorAddress: null,
          viewCount: 0,
          children: []
        }
      });
    }

    // Build hierarchical tree structure
    const sceneMap = new Map<number, SceneNode>();

    // Initialize all scenes
    scenes.forEach((scene) => {
      sceneMap.set(scene.id, {
        id: scene.id,
        parentId: scene.parentId,
        slot: scene.slot,
        slotLabel: scene.slotLabel,
        status: scene.status,
        creatorAddress: scene.creatorAddress,
        viewCount: scene.viewCount || 0,
        children: []
      });
    });

    // Build parent-child relationships
    let rootNode: SceneNode | null = null;
    sceneMap.forEach((scene) => {
      if (scene.parentId === null) {
        // This is the root (genesis scene)
        rootNode = scene;
      } else {
        // Add as child to parent
        const parent = sceneMap.get(scene.parentId);
        if (parent) {
          parent.children.push(scene);
        }
      }
    });

    // Sort children by slot (A, B, C)
    const sortBySlot = (a: SceneNode, b: SceneNode) => {
      if (!a.slot || !b.slot) return 0;
      return a.slot.localeCompare(b.slot);
    };

    const sortChildren = (node: SceneNode) => {
      node.children.sort(sortBySlot);
      node.children.forEach(sortChildren);
    };

    if (rootNode) {
      sortChildren(rootNode);
    }

    const treeData = rootNode || {
      id: 0,
      parentId: null,
      slot: null,
      slotLabel: 'Intro',
      status: 'completed',
      creatorAddress: null,
      viewCount: 0,
      children: []
    };

    // Update cache
    cache.set(movieId, {
      tree: treeData,
      timestamp: now,
      totalScenes: scenes.length
    });
    console.log(`📦 Cached tree for movie ${movieId} (${scenes.length} scenes)`);

    return NextResponse.json({
      tree: treeData,
      totalScenes: scenes.length,
      cached: false
    });

  } catch (error) {
    console.error('Error fetching scene tree:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scene tree' },
      { status: 500 }
    );
  }
}

/**
 * Invalidate cache for a specific movie (call when new scene created)
 */
export function invalidateMovieCache(movieId: number) {
  cache.delete(movieId);
  console.log(`🗑️ Invalidated cache for movie ${movieId}`);
}
