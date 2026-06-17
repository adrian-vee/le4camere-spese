-- Shift swap requests table
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id),
  target_id uuid NOT NULL REFERENCES profiles(id),
  request_date date NOT NULL,
  request_shift text,
  target_date date,
  target_shift text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;

-- Users see their own requests (sent or received), admins see all
CREATE POLICY "Users see own swap requests"
  ON shift_swap_requests FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid()
    OR target_id = auth.uid()
    OR is_admin()
  );

-- Users can create requests
CREATE POLICY "Users can create swap requests"
  ON shift_swap_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Target user or admin can update (accept/reject)
CREATE POLICY "Target or admin can update swap requests"
  ON shift_swap_requests FOR UPDATE
  TO authenticated
  USING (
    target_id = auth.uid()
    OR is_admin()
  )
  WITH CHECK (
    target_id = auth.uid()
    OR is_admin()
  );

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_swap_requests_target ON shift_swap_requests(target_id, status);
CREATE INDEX IF NOT EXISTS idx_swap_requests_requester ON shift_swap_requests(requester_id, status);
