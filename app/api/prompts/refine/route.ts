/**
 * Prompt Refinement API
 * POST /api/prompts/refine
 *
 * Uses GPT-4o-mini to refine user prompts for Sora 2 video generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface RefineRequest {
  attemptId: number;
  promptText: string;
  context?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RefineRequest = await request.json();
    const { attemptId, promptText, context = 'video generation for 2009 Bitcoin era scene' } = body;

    // Validate inputs
    if (!attemptId || isNaN(attemptId)) {
      return NextResponse.json(
        { error: 'Invalid attempt ID' },
        { status: 400 }
      );
    }

    if (!promptText || promptText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt text is required' },
        { status: 400 }
      );
    }

    if (promptText.trim().length > 1000) {
      return NextResponse.json(
        { error: 'Prompt is too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // Verify attempt exists and is still valid
    const attemptResult = await query(`
      SELECT id, scene_id, outcome, retry_window_expires_at
      FROM scene_generation_attempts
      WHERE id = $1
    `, [attemptId]);

    if (attemptResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Generation attempt not found' },
        { status: 404 }
      );
    }

    const attempt = attemptResult.rows[0];

    // Check if attempt is still in progress
    if (attempt.outcome !== 'in_progress') {
      return NextResponse.json(
        { error: `Attempt is ${attempt.outcome}. Cannot refine prompts.` },
        { status: 400 }
      );
    }

    // Check if retry window has expired
    const now = new Date();
    const expiresAt = new Date(attempt.retry_window_expires_at);

    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Retry window has expired' },
        { status: 400 }
      );
    }

    // Refine prompt using GPT-4o-mini
    let refinedPrompt: string;
    let suggestions: string[] = [];

    try {
      const refinementResult = await refinePromptWithGPT(promptText, context);
      refinedPrompt = refinementResult.refined;
      suggestions = refinementResult.suggestions;
    } catch (error) {
      console.error('Error refining prompt:', error);
      return NextResponse.json(
        {
          error: 'Failed to refine prompt',
          details: (error as Error).message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      originalPrompt: promptText,
      refinedPrompt,
      suggestions,
      attemptId,
      retryWindowExpires: attempt.retry_window_expires_at
    });

  } catch (error) {
    console.error('Error in prompt refinement:', error);
    return NextResponse.json(
      { error: 'Failed to refine prompt' },
      { status: 500 }
    );
  }
}

/**
 * Refine prompt using GPT-4o-mini
 */
async function refinePromptWithGPT(
  userPrompt: string,
  context: string
): Promise<{ refined: string; suggestions: string[] }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are an expert video prompt engineer for Sora 2, OpenAI's advanced AI video generation model. Transform user prompts into highly detailed, cinematic prompts optimized for Sora 2.

CONTEXT: This is for a "create your own adventure" game set in 2009 when Bitcoin was just launched. Videos should feel authentic to that era.

CORE ELEMENTS TO INCLUDE (in order):
1. **Camera Motion/Composition**: Start with camera positioning and movement
   - Camera motion: POV shot, aerial view, tracking drone view, dolly shot, pan, zoom, static
   - Composition: Wide shot, close-up, extreme close-up, medium shot, two-shot, eye-level, low angle, high angle
   - Lens effects: Shallow depth of field, deep focus, soft focus, macro lens, wide-angle lens

2. **Subject**: The main focus (person, animal, object, scenery)
   - Be specific about appearance, characteristics, details
   - Include 2009-era clothing, hairstyles, technology if relevant

3. **Action**: What is happening
   - Use active, descriptive verbs
   - Describe movement and motion clearly

4. **Context/Setting**: The environment and background
   - Specify location, time period (2009!), surroundings
   - Include period-accurate details: flip phones, old laptops, CRT monitors, posters, cars, etc.

5. **Style**: Creative direction
   - Film styles: cinematic, documentary, found footage, home video
   - For 2009: slightly grainy, realistic, authentic to that era

6. **Ambiance**: Lighting and color palette
   - Lighting: natural light, sunrise, sunset, golden hour, fluorescent office lighting, dim room light
   - Colors: warm tones, cool blue tones, slightly desaturated (2009 cameras weren't as crisp)
   - Mood: nostalgic, hopeful, uncertain, mysterious

BEST PRACTICES:
✅ Use descriptive adjectives and adverbs
✅ Specify facial details for portraits
✅ Include texture and material details
✅ Describe realistic motion and physics
✅ Use present tense for ongoing action
✅ Keep under 250 words but be comprehensive
✅ Paint a clear, vivid picture
✅ Focus on what you WANT, not what you don't want
✅ Include 2009-specific details to maintain authenticity

❌ AVOID:
❌ Vague descriptions
❌ Negative language ("no walls", "don't show")
❌ Abstract concepts without visual grounding
❌ Overly short prompts lacking detail
❌ Anachronistic elements (no smartphones, no modern tech)

Transform the user's prompt following these guidelines. Maintain their core concept but elevate it to professional, Sora-optimized quality with authentic 2009 details.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Context: ${context}

Original prompt: "${userPrompt}"

Transform this into a professional Sora 2 prompt following the structure:
1. Start with camera motion/composition
2. Describe the subject in detail (include 2009-era details)
3. Specify the action
4. Set the context/environment (authentic to 2009)
5. Define the style
6. Describe ambiance (lighting, colors, mood)

Keep the user's core idea but make it vivid, specific, and cinematic. Return ONLY the improved prompt, no explanations.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to refine prompt');
  }

  const data = await response.json();
  const refinedPrompt = data.choices[0].message.content.trim();

  // Remove any quotes that GPT might have added
  const cleanedPrompt = refinedPrompt.replace(/^["']|["']$/g, '');

  // Generate suggestions for improvement
  const suggestions = generateSuggestions(userPrompt, cleanedPrompt);

  return {
    refined: cleanedPrompt,
    suggestions
  };
}

/**
 * Generate helpful suggestions based on the refinement
 */
function generateSuggestions(original: string, refined: string): string[] {
  const suggestions: string[] = [];

  // Check for camera motion
  if (!original.toLowerCase().match(/camera|shot|view|angle|pov/)) {
    suggestions.push('Added camera movement for cinematic feel');
  }

  // Check for 2009 details
  if (!original.toLowerCase().match(/2009|bitcoin|flip phone|laptop|old/)) {
    suggestions.push('Added period-specific details for 2009 authenticity');
  }

  // Check for lighting
  if (!original.toLowerCase().match(/light|lighting|glow|sunset|sunrise/)) {
    suggestions.push('Specified lighting and mood');
  }

  // Check for detail level
  if (refined.length > original.length * 2) {
    suggestions.push('Enhanced with vivid, specific details');
  }

  return suggestions;
}
