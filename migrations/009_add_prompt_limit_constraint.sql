-- Migration: Add 3-prompt limit per scene generation attempt
-- Prevents users from consuming unlimited video generation credits

-- Function to check prompt count before insertion
CREATE OR REPLACE FUNCTION check_prompt_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
BEGIN
    -- Count existing prompts for this attempt
    SELECT COUNT(*)
    INTO current_count
    FROM prompts
    WHERE attempt_id = NEW.attempt_id;

    -- Enforce limit of 3 prompts per attempt
    IF current_count >= 3 THEN
        RAISE EXCEPTION 'Maximum 3 prompt attempts allowed per scene generation. Please confirm your scene or request a refund.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce limit on INSERT
CREATE TRIGGER enforce_prompt_limit
    BEFORE INSERT ON prompts
    FOR EACH ROW
    EXECUTE FUNCTION check_prompt_limit();

-- Add comment for documentation
COMMENT ON FUNCTION check_prompt_limit() IS 'Enforces maximum 3 prompts per scene_generation_attempt to control video API costs';
