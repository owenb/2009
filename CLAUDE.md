# 2009: A Create Your Own Adventure Game

## Concept

A first-of-its-kind "create your own adventure" game set in the year 2009 when Bitcoin has just been launched. This interactive experience combines video storytelling with generative AI to create an infinitely extensible world/movie/game.

## How It Works

### Core Mechanics

1. **Initial Scene**: Users watch a quick intro video (8-second clip/scene)

2. **Extension Slots**: After each scene, three opportunities (slots) appear to extend the narrative
   - Users can purchase a slot to extend the scene with their own AI prompt
   - Once a slot is purchased, it's gone forever
   - Only two slots remain after the first purchase, then one, then none

3. **Infinite Extension**: Once all three slots for a scene are filled:
   - Users must extend another clip further down the timeline
   - This creates an infinitely branching narrative structure
   - The world/movie/game grows organically through user contributions

### Technical Foundation

Built as a Base mini app following the Base platform specifications: https://docs.base.org/llms.txt

### Scene Structure

- Each scene is an 8-second video clip
- Scenes can branch into multiple paths based on user-generated extensions
- Each scene has exactly 3 extension slots (no more, no less)
- Slots are permanently claimed once purchased

### User Journey

1. Watch intro video (8 seconds)
2. See 3 available extension slots
3. Purchase a slot (if available)
4. Submit a generative AI prompt to extend the story
5. AI generates the next scene based on the prompt
6. New scene appears with its own 3 extension slots
7. Repeat infinitely

## Key Features

- **Permanent Choices**: Once a slot is taken, the decision is permanent
- **Collaborative Storytelling**: Multiple users contribute to different branches
- **2009 Setting**: Themed around the launch of Bitcoin and that era
- **AI-Powered Generation**: Uses generative AI to create new scenes from user prompts
- **Infinite Scalability**: The narrative can grow indefinitely in any direction
