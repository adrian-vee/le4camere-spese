-- Add edit_history JSONB column to expenses table
-- Each entry: { edited_by, edited_by_name, edited_at, changes: { field: { old, new } } }
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS edit_history jsonb DEFAULT '[]'::jsonb;
