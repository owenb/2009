import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// CORRECT types from OpenAI SDK
export type VideoModel = 'sora-2' | 'sora-2-pro';
export type VideoSeconds = '4' | '8' | '12';
export type VideoSize = '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
export type VideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

// Convenience types for UI
export type AspectRatio = '9:16' | '16:9' | '9:21' | '21:9';

// Map aspect ratio to actual size parameter
const ASPECT_RATIO_TO_SIZE: Record<AspectRatio, VideoSize> = {
  '9:16': '720x1280',    // Portrait
  '16:9': '1280x720',    // Landscape
  '9:21': '1024x1792',   // Tall portrait
  '21:9': '1792x1024',   // Wide landscape
};

// Map duration to seconds parameter (must be strings!)
const DURATION_TO_SECONDS: Record<number, VideoSeconds> = {
  4: '4',
  8: '8',
  12: '12',
};

// Sora content safety - words that trigger moderation blocks
const BANNED_WORDS = [
  // Civil disturbance
  'unrest', 'riot', 'riots', 'rioting', 'protest', 'protests', 'protesting',
  'uprising', 'revolution', 'demonstration', 'demonstrations',
  // Violence
  'chaos', 'violence', 'violent', 'attack', 'attacks', 'attacking',
  'assault', 'fight', 'fighting', 'battle', 'war', 'warfare',
  // News/Politics
  'breaking news', 'emergency broadcast', 'crisis alert',
  // Crowds + danger
  'angry crowd', 'angry mob', 'mob', 'stampede',
  // Weapons
  'gun', 'guns', 'knife', 'knives', 'weapon', 'weapons', 'explosive', 'explosives',
  // Harm
  'blood', 'bloody', 'injury', 'death', 'kill', 'killing', 'hurt', 'hurting',
];

/**
 * Check if prompt contains banned words that will trigger Sora moderation
 */
export function checkPromptSafety(prompt: string): {
  safe: boolean;
  warnings: string[];
  foundWords: string[];
} {
  const lowerPrompt = prompt.toLowerCase();
  const foundWords: string[] = [];

  for (const word of BANNED_WORDS) {
    if (lowerPrompt.includes(word)) {
      foundWords.push(word);
    }
  }

  const warnings: string[] = [];
  if (foundWords.length > 0) {
    warnings.push(
      `Found potentially triggering words: ${foundWords.join(', ')}`,
      'Sora may reject this prompt. Consider using digital/personal stakes instead of violence/unrest.'
    );
  }

  return {
    safe: foundWords.length === 0,
    warnings,
    foundWords,
  };
}

export interface VideoGenerationOptions {
  // Core options
  prompt: string;
  model?: VideoModel;

  // Video format (UI-friendly)
  aspectRatio?: AspectRatio;
  duration?: 4 | 8 | 12; // Will be converted to strings

  // OR use exact API parameters
  size?: VideoSize;
  seconds?: VideoSeconds;

  // Image-to-video: single image file
  inputImage?: File | string; // File object or base64 string
}

export interface VideoGenerationResult {
  id: string;
  status: VideoStatus;
  progress: number; // 0-100

  // Video URLs
  video_url?: string;
  thumbnail_url?: string;

  // Metadata
  model: VideoModel;
  seconds: VideoSeconds;
  size: VideoSize;

  // Timestamps
  created_at: number;
  completed_at: number | null;
  expires_at: number | null;

  // Error
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Generate a video using Sora 2 Pro
 * CORRECT implementation using actual OpenAI SDK
 */
export async function generateVideo(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  try {
    // Convert UI-friendly options to API parameters
    const size = options.size || (options.aspectRatio ? ASPECT_RATIO_TO_SIZE[options.aspectRatio] : '720x1280');
    const seconds = options.seconds || (options.duration ? DURATION_TO_SECONDS[options.duration] : '8');

    const params: {
      prompt: string;
      model: VideoModel;
      seconds: VideoSeconds;
      size: VideoSize;
      input_reference?: File;
    } = {
      prompt: options.prompt,
      model: options.model || 'sora-2',
      seconds,
      size,
    };

    // Handle image-to-video
    if (options.inputImage) {
      if (options.inputImage instanceof File) {
        params.input_reference = options.inputImage;
      } else if (typeof options.inputImage === 'string') {
        // Convert base64 to File if needed
        const base64Response = await fetch(options.inputImage);
        const blob = await base64Response.blob();
        const file = new File([blob], 'input.jpg', { type: 'image/jpeg' });
        params.input_reference = file;
      }
    }

    console.log('🎬 Starting Sora 2 generation:', {
      prompt: params.prompt.substring(0, 100) + '...',
      model: params.model,
      seconds: params.seconds,
      size: params.size,
      hasImage: !!params.input_reference,
    });

    // CORRECT API call
    const video = await openai.videos.create(params);

    console.log('✅ Video generation started:', video.id);

    return {
      id: video.id,
      status: video.status,
      progress: video.progress || 0,
      model: video.model,
      seconds: video.seconds,
      size: video.size,
      created_at: video.created_at,
      completed_at: video.completed_at,
      expires_at: video.expires_at,
      error: video.error || undefined,
    };
  } catch (error: unknown) {
    console.error('❌ Sora generation error:', error);
    const err = error as { code?: string; message?: string };
    return {
      id: '',
      status: 'failed',
      progress: 0,
      model: 'sora-2',
      seconds: '8',
      size: '720x1280',
      created_at: Date.now() / 1000,
      completed_at: null,
      expires_at: null,
      error: {
        code: err.code || 'unknown_error',
        message: err.message || 'Unknown error occurred',
      },
    };
  }
}

/**
 * Check the status of a video generation
 * CORRECT implementation
 */
export async function checkVideoStatus(videoId: string): Promise<VideoGenerationResult> {
  try {
    // CORRECT API call
    const video = await openai.videos.retrieve(videoId);

    const result: VideoGenerationResult = {
      id: video.id,
      status: video.status,
      progress: video.progress || 0,
      model: video.model,
      seconds: video.seconds,
      size: video.size,
      created_at: video.created_at,
      completed_at: video.completed_at,
      expires_at: video.expires_at,
      error: video.error || undefined,
    };

    // If completed, set URLs to our download proxy endpoints
    if (video.status === 'completed') {
      result.video_url = `/api/video/download/${videoId}?variant=video`;
      result.thumbnail_url = `/api/video/download/${videoId}?variant=thumbnail`;
    }

    return result;
  } catch (error: unknown) {
    console.error('❌ Status check error:', error);
    const err = error as { code?: string; message?: string };
    return {
      id: videoId,
      status: 'failed',
      progress: 0,
      model: 'sora-2',
      seconds: '8',
      size: '720x1280',
      created_at: Date.now() / 1000,
      completed_at: null,
      expires_at: null,
      error: {
        code: err.code || 'unknown_error',
        message: err.message || 'Failed to check status',
      },
    };
  }
}

/**
 * Poll video generation status until completion
 * Polls every 5 seconds
 */
export async function pollVideoGeneration(
  videoId: string,
  onProgress?: (result: VideoGenerationResult) => void,
  maxAttempts: number = 120, // 10 minutes max (120 * 5s)
  intervalMs: number = 5000
): Promise<VideoGenerationResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await checkVideoStatus(videoId);

    // Call progress callback
    if (onProgress) {
      onProgress(result);
    }

    console.log(`📊 Poll ${attempts + 1}/${maxAttempts}: ${result.status} - ${result.progress}%`);

    // Check if terminal state
    if (result.status === 'completed') {
      console.log('✅ Video generation completed!');
      return result;
    }

    if (result.status === 'failed') {
      console.error('❌ Video generation failed:', result.error);
      return result;
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  // Timeout
  console.error('❌ Video generation timeout');
  return {
    id: videoId,
    status: 'failed',
    progress: 0,
    model: 'sora-2',
    seconds: '8',
    size: '720x1280',
    created_at: Date.now() / 1000,
    completed_at: null,
    expires_at: null,
    error: {
      code: 'timeout',
      message: 'Generation timeout - exceeded maximum polling time (10 minutes)',
    },
  };
}

/**
 * Continue/remix an existing video with a new prompt
 * This is how you do "last frame continuation"
 */
export async function remixVideo(videoId: string, newPrompt: string): Promise<VideoGenerationResult> {
  try {
    console.log('🔄 Remixing video:', videoId, 'with prompt:', newPrompt);

    // CORRECT API call for continuation
    const video = await openai.videos.remix(videoId, {
      prompt: newPrompt,
    });

    console.log('✅ Video remix started:', video.id);

    return {
      id: video.id,
      status: video.status,
      progress: video.progress || 0,
      model: video.model,
      seconds: video.seconds,
      size: video.size,
      created_at: video.created_at,
      completed_at: video.completed_at,
      expires_at: video.expires_at,
      error: video.error || undefined,
    };
  } catch (error: unknown) {
    console.error('❌ Remix error:', error);
    const err = error as { code?: string; message?: string };
    return {
      id: '',
      status: 'failed',
      progress: 0,
      model: 'sora-2',
      seconds: '8',
      size: '720x1280',
      created_at: Date.now() / 1000,
      completed_at: null,
      expires_at: null,
      error: {
        code: err.code || 'unknown_error',
        message: err.message || 'Failed to remix video',
      },
    };
  }
}

export type PromptingMethod = 'auto' | 'production-brief' | 'time-coded';

/**
 * Refine a user prompt using GPT-4o-mini
 * Optimized for Sora 2 Pro video generation following OpenAI's best practices
 *
 * Methods:
 * - 'auto': Let AI choose the best method based on prompt
 * - 'production-brief': For atmospheric scenes with emotional depth (cinematic ads, mini-scenes)
 * - 'time-coded': For fast-paced sequences with precise timing (commercials, montages)
 */
export async function refinePrompt(
  userPrompt: string,
  options?: {
    movieContext?: string;
    videoDuration?: number;
    method?: PromptingMethod;
  }
): Promise<{ refined: string; suggestions: string[] }> {
  const movieContext = options?.movieContext;
  const videoDuration = options?.videoDuration || 8;
  const method = options?.method || 'auto';

  const systemPrompt = `You are an expert at crafting prompts for Sora 2 Pro video generation.

Your goal: Transform user prompts into professional, director-level instructions that unlock Sora 2's full potential.

SORA 2 CORE STRENGTHS:
- Transforms concise, director-level instructions into short, believable video clips with remarkable continuity
- Intuitively understands and executes clear directions for framing, lighting, and complex subject action
- Anything you DON'T specify, the AI will creatively invent for you - this is a feature, not a bug!

🎬 VIDEO DURATION: ${videoDuration} SECONDS - THIS IS ABSOLUTE, NON-NEGOTIABLE 🎬

Your video is EXACTLY ${videoDuration} seconds long.
- First timestamp starts at 0, final timestamp ends at ${videoDuration}
- Timestamps for ${videoDuration}s video: ${videoDuration === 4 ? '[0-2s] then [2-4s]' : videoDuration === 8 ? '[0-2s] [2-4s] [4-6s] [6-8s]' : '[0-3s] [3-6s] [6-9s] [9-12s]'}
- Never use timestamps like [12-15s] or [15-18s] for a ${videoDuration}s video
- Never start timestamps at any number other than 0

PROMPTING METHOD: ${method === 'production-brief' ? 'PRODUCTION BRIEF' : method === 'time-coded' ? 'TIME-CODED SHOTLIST' : 'AUTO (choose best method)'}
${movieContext ? `\n${movieContext}` : ''}

---

⚠️ SORA CONTENT SAFETY - AVOID THESE TRIGGERING WORDS ⚠️

Sora's moderation system will REJECT your prompt if it contains certain words. NEVER use:

BANNED WORDS/PHRASES:
• Civil disturbance: "unrest", "riot", "protest", "uprising", "revolution", "demonstration"
• Violence: "chaos", "violence", "attack", "assault", "fight", "battle", "war"
• News/Politics: "breaking news", "emergency broadcast", "crisis alert"
• Crowds + danger: "angry crowd", "mob", "stampede"
• Weapons: "gun", "knife", "weapon", "explosive"
• Harm: "blood", "injury", "death", "kill", "hurt"

SAFE ALTERNATIVES:
• Instead of "unrest in streets" → "crowded marketplace" or "busy festival"
• Instead of "chaos outside" → "unexpected activity" or "surprising event"
• Instead of "breaking news: crisis" → "notification appears" or "message pops up"
• Instead of "angry crowd" → "excited gathering" or "enthusiastic group"

For tension/conflict, use DIGITAL or PERSONAL stakes:
✅ "Server overload warning"
✅ "Mysterious code appears"
✅ "Unexpected viral success"
✅ "Phone rings urgently"
✅ "Ethical dilemma notification"

SCAN YOUR PROMPT: Before submitting, check if you used any banned words. If yes, REPLACE them with safe alternatives.

---

🚨 CRITICAL REQUIREMENT - READ FIRST 🚨

This video is for a BRANCHING NARRATIVE GAME. The final frame MUST present a REAL CHOICE, not just a paused action.

ABSOLUTE REQUIREMENTS FOR ENDING (LAST 2 SECONDS):

❌ FORBIDDEN - FAKE CLIFFHANGERS (These are NOT real choices):
• "about to sing/join/dance" - This is natural continuation, not a choice
• "about to enter/follow/go with" - No alternative, just delaying the obvious
• "reaches toward X" - If there's only one X, there's no decision
• "smiling/happy/joyful" - Resolved emotion = no tension
• Any ending where ONE path is obvious and natural

✅ REQUIRED - REAL BRANCHING POINTS:
• Multiple visible/mentioned options (paths, doors, characters, objects)
• NEW conflict/information appears in final beat that changes everything
• Character torn between 2-3 specific, incompatible choices
• Something INTERRUPTS the natural flow (warning, sound, discovery)

FORMULA FOR REAL CLIFFHANGERS:
[Setup action] + [SUDDEN NEW ELEMENT or VISIBLE SPLIT] + [Character reacts/freezes] + [FREEZE on moment of choice between A, B, C]

WRONG ENDING #1: "Bunny about to sing with the crowd. FREEZE as she opens her mouth."
→ Singing is the natural next action. No choice. This is FAKE. ❌

WRONG ENDING #2: "Bunny reaches toward the door handle. FREEZE before touching it."
→ Opening the door is obvious. No alternative shown. This is FAKE. ❌

RIGHT ENDING #1: "Bunny steps toward the singing crowd - then freezes as she spots a dark tunnel behind them with a WARNING sign. The crowd gestures her forward while the tunnel pulses with mysterious light. FREEZE as she looks between both, torn."
→ TWO clear options (join crowd vs investigate tunnel). Real choice. ✅

RIGHT ENDING #2: "Bunny's about to enter when suddenly the door SLAMS SHUT. Two other paths appear: a window with rope, a vent in the floor. Alarm sounds growing louder. FREEZE as her eyes dart between the three escape routes."
→ THREE visible options under pressure. Real choice. ✅

MANDATORY FINAL BEAT STRUCTURE:
[Normal action starting] → [SOMETHING DISRUPTS/REVEALS OPTIONS] → [Character sees A AND B AND C] → [FREEZE on internal conflict]

TEST YOUR ENDING:
1. Are there 2-3 SPECIFIC, DIFFERENT options visible or mentioned?
2. Would choosing each option lead to a COMPLETELY different scene?
3. Is there CONFLICT or IMPOSSIBLE CHOICE (can't do both)?

If you answered NO to any question, you wrote a FAKE cliffhanger. REWRITE IT NOW.

---

YOUR JOB AS PROMPT ENGINEER:
If the user's prompt describes a simple, linear action (like "bunny exploring, creatures singing"), you MUST ADD a branching element to the ending:
• Introduce a NEW character/object/path in the final 2 seconds
• Have something INTERRUPT the natural flow
• Reveal multiple options the character must choose between
• Create CONFLICT between what they want to do and what else is possible

Example transformation:
User prompt: "Bunny explores the underground world. Creatures sing to her."
❌ Bad ending: "Bunny about to sing with them"
✅ Good ending: "Bunny steps forward to join - but suddenly spots a glowing exit door and a dark cave, both pulsing. The creatures pull her one way, but her instinct pulls another. FREEZE as she's torn between three paths."

WHEN TO GO SHORT VS. LONG:
Prompt length is strategic. Short prompts invite creative partnership; long prompts give precise directorial control.

For simple scenes: Keep it short and declarative - let Sora creatively interpret the details.
For complex visions: Use structured methods below for maximum control.
BUT ALWAYS: Add real branching elements to the final beat, even if user didn't mention them.

---

${method === 'production-brief' || method === 'auto' ? `
METHOD 1: PRODUCTION BRIEF
Best for: Atmospheric scenes, emotional depth, single rich shots with precise composition, rhythm & sound

STRUCTURE (include only blocks relevant to your video):
• Format & Tone: Specify genre (cinematic ad, UGC reaction, music video, mini-scene)
• Main Subject(s): Briefly describe main characters
• Wardrobe and Props: List clothing and key objects visible in frame
• Location & Framing: Define shot size and angle; anchor foreground, mid-ground, and background elements
• Lighting & Palette: Outline key light sources and 3-7 color anchors
• Continuity Rules: Weather, time of day that must remain consistent
• Actions & Camera Beats: Outline 1–3 timed beats; pair each with one camera movement and one subject action
• Montage Plan: Specify cuts (jump, match), inserts, transitions (whip-pan, flash-frame), and pacing
• Dialogue (if any): Include short, labeled lines of speech
• Sound & Foley: List specific micro-sounds (peel, snap, pour, shoe squeak) plus ambient audio
• Finish: Note film grain, halation, LUT intent, and desired final frame

EXAMPLE:
Format & Tone
Cinematic mini-scene - emotional realism with a soft romantic rhythm and atmospheric intimacy. Tone: nostalgic, tender, immersive.

Main Subject(s)
A young couple standing close under one umbrella in the rain - their chemistry quiet but electric, eyes locked, hesitant smiles.

Wardrobe and Props
She wears a beige trench coat, pearl earrings, and carries a transparent umbrella; he wears a navy jacket, white shirt, and wristwatch reflecting streetlight. Props: umbrella, takeaway coffee cup gently steaming.

Location & Framing
Rain-soaked cobblestone street at dusk outside a softly glowing café.
Foreground: falling raindrops and bokeh reflections.
Midground: the couple framed beneath the umbrella.
Background: café sign glowing amber, blurred city silhouettes.
Camera alternates between gentle dolly-ins, over-shoulder close-ups, and slow ¾ circular arcs.

Lighting & Palette
Warm café light spilling onto cool blue-gray rain.
Light sources: diffused streetlight key from camera left, amber window backlight.
Color anchors: blush pink, amber gold, navy blue, cool gray, and ivory skin tones.
Soft diffusion lens and wet reflections maintain continuity.

Actions & Camera Beats (0-12s)
[0-4s] Wide shot: camera slowly pushes in through rain toward the couple; she adjusts the umbrella, faint smile.
[4-8s] Medium shot: he reaches for her hand; droplets cascade down joined fingers; camera drifts laterally, catching the reflection of neon light across their faces.
[8-12s] Close-up: their foreheads nearly touching, eyes locked, both leaning in; camera holds steady on the anticipation between them. FREEZE as lips are about to meet but haven't yet.

Montage Plan
Three inserts: (raindrop hitting umbrella → fingertip touch → smile).
Smooth match cuts guided by piano rhythm. Final frame holds on the suspended moment.
Transitions use natural lens flares from passing car headlights.

Dialogue
Whisper (female): "Stay a little longer."
He exhales softly, smiling.

Sound & Foley
Soft rainfall, muffled footsteps on wet cobblestone, umbrella fabric tension, faint breath, distant café hum, and soft piano underscore with subtle reverb.

Finish
Light film grain, warm halation on highlights, gentle chromatic bloom around neon reflections.
LUT intent: vintage romance with balanced teal–amber contrast.
Final frame: Hold on anticipation - the moment before the kiss, rain glowing around them, everything suspended.
` : ''}

${method === 'time-coded' || method === 'auto' ? `
METHOD 2: TIME-CODED SHOTLIST
Best for: Fast-paced sequences, commercials, ads, montages where syncing action to specific rhythm is key

STRUCTURE:
Header: An [DURATION]-second [FORMAT] with [TRANSITION STYLE] and [CAMERA STYLE].

[0–A s] — OPEN: [SHOT SIZE and ANGLE] on [SUBJECT] doing [ACTION] + [CAMERA BEHAVIOR & PACE] + [CUT/TRANSITION] + [AUDIO]
[A–B s] — TRANSITION/INSERT: [ACTION] + [CAMERA BEHAVIOR] + [CUT/TRANSITION] + [AUDIO]
[B–C s] — RUN/DEVELOPMENT: [ACTION] + [CAMERA BEHAVIOR] + [CUT/TRANSITION] + [AUDIO]
[C–D s] — IMPACT/REVEAL: [ACTION/VFX] + [CAMERA BEHAVIOR] + [CUT/TRANSITION] + [AUDIO]
[D–E s] — OUTRO/BUTTON: [HERO ANGLE/REACTION/FINAL GESTURE] + [CAMERA LOCK-OFF] + [FINAL IMAGE DESCRIPTION]

DURATION GUIDANCE: 4s ≈ 2–3 beats · 8s ≈ ~5 beats · 12s ≈ 6–7 beats

EXAMPLE FOR 8-SECOND VIDEO:
An 8-second ultra-cinematic video with seamless transitions and dynamic camera motion.

[0-2s]: Extreme close-up of a woman's eye, ultra-detailed iris, reflections of light, camera slowly dolly-ins toward the pupil. Soft ambient hum builds tension.

[2-4s]: The camera flies into the pupil, smooth CG transition as the iris morphs into a mechanical world with gears, oil, and valves moving in slow motion.

[4-6s]: FPV-style flight through the engine interior with sparks, moving pistons, rushing combustion sound. The camera races between metallic tunnels toward a glowing valve gate.

[6-8s]: The camera bursts through the valve into a dark underground parking lot filled with smoke and flashing lights. Two sports cars drift toward each other on collision course, tires screeching, sparks flying. The camera holds between them as they hurtle closer. FREEZE as they're about to collide, headlights filling the frame.

4K cinematic realism, dynamic FPV camera movement, seamless CG transition (eye → engine → parking lot), warm-to-cool color palette, dramatic lighting, slow motion + motion blur, atmospheric smoke, high-octane tone. Hold final frame on suspended collision.
` : ''}

---

OUTPUT REQUIREMENTS:
1. Complete refined prompt
2. Then a blank line
3. Then "IMPROVEMENTS:" on its own line
4. Then 4-6 bullet points explaining improvements made

Example output format:
[Full refined prompt here]

IMPROVEMENTS:
- Improvement 1
- Improvement 2
- Improvement 3

BEFORE YOU SUBMIT - BRUTAL FINAL CHECK:
✅ Do your timestamps start at [0-Xs] and end exactly at the specified duration?
✅ Did you scan for BANNED WORDS (unrest, chaos, riot, violence, breaking news, weapon, blood)?
✅ If you used banned words, did you REPLACE them with safe alternatives?
✅ Does the LAST BEAT mention 2-3 SPECIFIC options/paths/choices?
✅ Did something NEW appear or INTERRUPT in the final beat?
✅ Would each option lead to a COMPLETELY DIFFERENT next scene?
✅ Is there CONFLICT/TENSION between the options (can't have both)?
✅ Did you avoid FAKE cliffhangers: "about to sing", "about to join", "reaches toward [only one thing]"?

If you answered NO to ANY of these, FIX IT NOW:
- Wrong timestamps? Rewrite them to start at 0 and end at the specified duration
- Banned words found? Replace with safe alternatives (digital/personal stakes instead of violence/unrest)
- Fake cliffhanger? Delete your ending and write a NEW final beat with CONFLICT or MULTIPLE OPTIONS

REMEMBER:
- "About to do X" where X is the obvious next thing = FAKE. Players need REAL CHOICES.
- Words like "unrest", "chaos", "breaking news" will get BLOCKED by Sora. Use digital/personal stakes instead.

CORE PRINCIPLES:
• Shot composition: Detail each shot like a storyboard (framing, depth, lighting, palette, action)
• Motion & timing: Pair one specific camera move with one distinct subject action using strong verbs
• Stylistic control: Establish visual style upfront, then maintain consistency
• Multi-shot sequences: Define each shot as distinct block with unique setup, action, and lighting
• Creative partnership: What you don't specify, Sora will creatively invent
• If user prompt is already good and concise, you may keep it short - don't force long formats`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1200, // Increased for detailed production briefs with cliffhanger endings
    });

    const response = completion.choices[0].message.content || '';

    // Parse response - look for "IMPROVEMENTS:" separator
    // Everything before it is the refined prompt, everything after is improvements
    let refined = userPrompt;
    let suggestions: string[] = [];

    // Try to find the separator
    const improvementMarkers = [
      /\n\s*IMPROVEMENTS?:\s*\n/i,
      /\n\s*WHAT CHANGED:\s*\n/i,
      /\n\s*CHANGES MADE:\s*\n/i,
      /\n\s*REFINEMENTS?:\s*\n/i,
    ];

    let splitIndex = -1;
    let usedMarker = '';

    for (const marker of improvementMarkers) {
      const match = response.match(marker);
      if (match && match.index !== undefined) {
        splitIndex = match.index;
        usedMarker = match[0];
        break;
      }
    }

    if (splitIndex > -1) {
      // Found separator - split the content
      refined = response.substring(0, splitIndex).trim();
      const improvementsSection = response.substring(splitIndex + usedMarker.length).trim();

      // Extract bullet points from improvements section
      suggestions = improvementsSection
        .split('\n')
        .map(l => l.replace(/^[-•*]\s*/, '').trim())
        .filter(l => l.length > 0 && !l.match(/^IMPROVEMENTS?:|^WHAT CHANGED:|^CHANGES MADE:|^METHOD USED:/i));
    } else {
      // No separator found - try old parsing method (first line vs rest)
      const lines = response.split('\n').filter(l => l.trim());
      refined = lines[0] || userPrompt;

      suggestions = lines
        .slice(1)
        .map(l => l.replace(/^[-•*]\s*/, '').trim())
        .filter(l => {
          if (l.length === 0) return false;
          const lower = l.toLowerCase();
          return !lower.startsWith('method') &&
                 !lower.startsWith('improvement') &&
                 !lower.startsWith('changes') &&
                 !lower.startsWith('refinement');
        });
    }

    // No artificial character limits - let Sora API enforce its own limits

    // Check for banned words that trigger Sora moderation
    const safetyCheck = checkPromptSafety(refined);
    if (!safetyCheck.safe) {
      console.warn('⚠️ Refined prompt contains triggering words:', safetyCheck.foundWords);
      suggestions.unshift(
        `⚠️ WARNING: Found triggering words: ${safetyCheck.foundWords.join(', ')}`,
        'Sora may reject this prompt. Consider replacing with digital/personal stakes.',
        ...safetyCheck.warnings
      );
    }

    console.log('✨ Prompt refined:', {
      method,
      original: userPrompt.substring(0, 50) + '...',
      refinedLength: refined.length,
      refinedPreview: refined.substring(0, 100) + '...',
      improvements: suggestions.length,
      hadSeparator: splitIndex > -1,
      safe: safetyCheck.safe,
    });

    return { refined, suggestions };
  } catch (error) {
    console.error('Failed to refine prompt:', error);
    return { refined: userPrompt, suggestions: [] };
  }
}

/**
 * Estimate generation cost
 * Sora 2 Pro pricing varies, this is approximate
 */
export function estimateGenerationCost(seconds: VideoSeconds): number {
  const costs = {
    '4': 0.80,
    '8': 1.60,
    '12': 2.40,
  };
  return costs[seconds] || 1.60;
}

/**
 * Validate generation options
 */
export function validateGenerationOptions(options: VideoGenerationOptions): string[] {
  const errors: string[] = [];

  if (!options.prompt || options.prompt.trim().length === 0) {
    errors.push('Prompt is required');
  }

  // No character limit validation - let Sora API enforce its own limits

  return errors;
}

/**
 * Convert aspect ratio to size
 */
export function aspectRatioToSize(aspectRatio: AspectRatio): VideoSize {
  return ASPECT_RATIO_TO_SIZE[aspectRatio];
}

/**
 * Convert duration to seconds string
 */
export function durationToSeconds(duration: number): VideoSeconds {
  return DURATION_TO_SECONDS[duration] || '8';
}

/**
 * Download video content from OpenAI
 * Returns the binary content as a Response object
 */
export async function downloadVideoContent(
  videoId: string,
  variant: 'video' | 'thumbnail' | 'spritesheet' = 'video'
): Promise<Response> {
  try {
    console.log(`📥 Downloading ${variant} for video:`, videoId);
    const response = await openai.videos.downloadContent(videoId, { variant });
    console.log(`✅ Downloaded ${variant} successfully`);
    return response;
  } catch (error: unknown) {
    console.error(`❌ Failed to download ${variant}:`, error);
    throw error;
  }
}

/**
 * Download Sora video and return as Blob
 * Wrapper around downloadVideoContent for easier usage
 */
export async function downloadSoraVideo(videoId: string): Promise<Blob> {
  const response = await downloadVideoContent(videoId, 'video');
  return await response.blob();
}
