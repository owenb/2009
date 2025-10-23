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
  viewedByUser: boolean;
  children: SceneNode[];
}

// Cache configuration (tree structure only, not user-specific data)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<number, { tree: SceneNode; timestamp: number; totalScenes: number }>();

/**
 * GET /api/scenes/tree?movieId=1&viewerAddress=0x...
 *
 * Fetches the entire scene tree structure for map visualization.
 * Returns a hierarchical tree starting from the genesis scene.
 * Scoped by movie_id for multi-movie support.
 * Includes viewedByUser flag if viewerAddress provided.
 * Tree structure cached for 5 minutes, but user views always fresh.
 */
export async function GET(request: NextRequest) {
  try {
    // Get params from query
    const { searchParams } = new URL(request.url);
    const movieId = parseInt(searchParams.get('movieId') || '1', 10);
    const viewerAddress = searchParams.get('viewerAddress')?.toLowerCase() || null;

    if (isNaN(movieId) || movieId < 1) {
      return NextResponse.json(
        { error: 'Invalid movieId parameter' },
        { status: 400 }
      );
    }

    // Check cache for tree structure
    const cached = cache.get(movieId);
    const now = Date.now();
    const useCache = cached && (now - cached.timestamp) < CACHE_TTL;

    let treeData: SceneNode;
    let totalScenes: number;

    if (useCache && cached) {
      console.log(`✅ Cache hit for movie ${movieId} tree (${cached.totalScenes} scenes)`);
      // Deep clone to avoid mutating cache
      treeData = JSON.parse(JSON.stringify(cached.tree));
      totalScenes = cached.totalScenes;
    } else {
      // Fetch all scenes from database
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
      totalScenes = scenes.length;

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
            viewedByUser: false,
            children: []
          },
          totalScenes: 0
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
          viewedByUser: false, // Will be set later based on viewer
          children: []
        });
      });

      // Build parent-child relationships
      let rootNode: SceneNode | null = null;
      sceneMap.forEach((scene) => {
        if (scene.parentId === null) {
          rootNode = scene;
        } else {
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

      treeData = rootNode || {
        id: 0,
        parentId: null,
        slot: null,
        slotLabel: 'Intro',
        status: 'completed',
        creatorAddress: null,
        viewCount: 0,
        viewedByUser: false,
        children: []
      };

      // Update cache (without user-specific data)
      cache.set(movieId, {
        tree: JSON.parse(JSON.stringify(treeData)), // Deep clone
        timestamp: now,
        totalScenes
      });
      console.log(`📦 Cached tree for movie ${movieId} (${totalScenes} scenes)`);
    }

    // Fetch user views if viewerAddress provided
    if (viewerAddress) {
      const viewsResult = await pool.query(`
        SELECT DISTINCT scene_id
        FROM scene_views
        WHERE viewer_address = $1
      `, [viewerAddress]);

      const viewedSceneIds = new Set(viewsResult.rows.map(row => row.scene_id));

      // Mark which scenes the user has viewed
      const markViewed = (node: SceneNode) => {
        node.viewedByUser = viewedSceneIds.has(node.id);
        node.children.forEach(markViewed);
      };

      markViewed(treeData);
    }

    return NextResponse.json({
      tree: treeData,
      totalScenes,
      cached: useCache
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
 * Note: Not exported as route files can only export HTTP handlers.
 * Can be used internally or moved to a separate utility file if needed elsewhere.
 */
function _invalidateMovieCache(movieId: number) {
  cache.delete(movieId);
  console.log(`🗑️ Invalidated cache for movie ${movieId}`);
}
