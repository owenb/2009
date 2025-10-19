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

/**
 * GET /api/scenes/tree
 *
 * Fetches the entire scene tree structure for map visualization.
 * Returns a hierarchical tree starting from the genesis scene.
 */
export async function GET(_request: NextRequest) {
  try {
    // Fetch all scenes (only completed ones for the map)
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
      WHERE status = 'completed' OR id = 1
      ORDER BY created_at ASC
    `);

    const scenes = result.rows;

    if (scenes.length === 0) {
      return NextResponse.json({
        tree: {
          id: 1,
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

    return NextResponse.json({
      tree: rootNode || {
        id: 1,
        parentId: null,
        slot: null,
        slotLabel: 'Intro',
        status: 'completed',
        creatorAddress: null,
        viewCount: 0,
        children: []
      },
      totalScenes: scenes.length
    });

  } catch (error) {
    console.error('Error fetching scene tree:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scene tree' },
      { status: 500 }
    );
  }
}
