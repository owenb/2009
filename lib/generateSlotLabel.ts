/**
 * Slot Label Generator
 * Uses GPT-4o-mini to extract concise preview labels from video prompts
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Generate a 2-5 word preview label from a video prompt
 * Examples: "walk to the bedroom", "make cup of tea", "check old phone"
 *
 * @param refinedPrompt - The refined video prompt
 * @returns Short preview label for slot display
 */
export async function generateSlotLabel(refinedPrompt: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not found');
  }

  if (!refinedPrompt || refinedPrompt.trim().length === 0) {
    return 'untitled scene';
  }

  try {
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
            content: `You are a concise text summarizer. Extract a 2-5 word action-oriented preview label from video prompts.

Rules:
- Use present tense verbs
- Focus on the main action
- Keep it under 5 words
- Use lowercase
- No quotes, no punctuation at the end
- Be specific about the action

Examples:
Input: "A close-up cinematic shot follows a desperate man in a weathered green trench coat as he dials a rotary phone..."
Output: call from phone booth

Input: "A medium shot follows a young man in faded jeans and a graphic tee as he cautiously pushes open a weathered wooden door, revealing a dimly lit bedroom..."
Output: enter dark bedroom

Input: "A wide shot of a cozy kitchen. A woman in casual clothes reaches for an old coffee maker on the counter..."
Output: make morning coffee

Input: "POV shot moving down a dimly lit hallway. The camera approaches a closed door at the end..."
Output: approach mysterious door`
          },
          {
            role: 'user',
            content: `Prompt: ${refinedPrompt}\n\nGenerate a 2-5 word label:`
          }
        ],
        temperature: 0.3,
        max_tokens: 20
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to generate slot label:', error);
      // Fallback to simple extraction
      return fallbackLabelExtraction(refinedPrompt);
    }

    const data = await response.json();
    const label = data.choices[0].message.content.trim().toLowerCase();

    // Remove any quotes that might have been added
    const cleanLabel = label.replace(/^["']|["']$/g, '');

    // Ensure it's not too long (max 5 words)
    const words = cleanLabel.split(' ');
    if (words.length > 5) {
      return words.slice(0, 5).join(' ');
    }

    return cleanLabel;

  } catch (error) {
    console.error('Error generating slot label:', error);
    // Fallback to simple extraction
    return fallbackLabelExtraction(refinedPrompt);
  }
}

/**
 * Fallback label extraction if GPT-4o-mini fails
 * Uses simple heuristics to extract action from prompt
 *
 * @param prompt - Video prompt
 * @returns Fallback label
 */
function fallbackLabelExtraction(prompt: string): string {
  // Try to find action verbs in common patterns
  const actionPatterns = [
    // "A man walks to..." → "walks to"
    /(?:person|man|woman|character|figure|they|he|she)\s+(\w+s?\s+(?:to|into|through|towards|down|up|across)\s+\w+)/i,
    // "Someone opens a door" → "opens door"
    /(?:someone|person|character)\s+(\w+s?\s+(?:a|an|the)?\s*\w+)/i,
    // General verb patterns
    /\b(\w+ing\s+\w+)/i
  ];

  for (const pattern of actionPatterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].toLowerCase()
        .replace(/\ba\b|\ban\b|\bthe\b/g, '') // Remove articles
        .trim()
        .split(/\s+/)
        .slice(0, 4)
        .join(' ');

      if (extracted.length > 0) {
        return extracted;
      }
    }
  }

  // Ultimate fallback: first few words
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2) // Filter out very short words
    .slice(0, 3);

  return words.length > 0 ? words.join(' ') : 'new scene';
}

/**
 * Validate a label (ensure it meets requirements)
 *
 * @param label - Label to validate
 * @returns Validated label
 */
export function validateLabel(label: string): string {
  const trimmed = label.trim().toLowerCase();

  // Ensure it's not empty
  if (trimmed.length === 0) {
    return 'untitled scene';
  }

  // Ensure it's not too long (max 5 words)
  const words = trimmed.split(/\s+/);
  if (words.length > 5) {
    return words.slice(0, 5).join(' ');
  }

  // Ensure it's not too short (min 2 characters)
  if (trimmed.length < 2) {
    return 'new scene';
  }

  return trimmed;
}

/**
 * Batch generate labels for multiple prompts
 * Useful for bulk operations or testing
 *
 * @param prompts - Array of prompts
 * @returns Array of labels
 */
export async function batchGenerateLabels(prompts: string[]): Promise<string[]> {
  const labels = await Promise.all(
    prompts.map(prompt => generateSlotLabel(prompt))
  );
  return labels;
}
