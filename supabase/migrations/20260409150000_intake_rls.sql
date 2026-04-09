-- RLS intake: siswa hanya data miliknya (via join email auth.users ↔ public.users).
-- API server memakai service role dan tetap bypass RLS.

CREATE OR REPLACE FUNCTION public.apex_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  INNER JOIN auth.users au ON au.email = u.email AND au.id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.apex_app_user_id() IS
  'Maps auth.uid() ke public.users.id untuk kebijakan RLS.';

ALTER TABLE public.intake_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_item_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_scenario_responses ENABLE ROW LEVEL SECURITY;

-- Bank & skenario: baca untuk pengguna terautentikasi (kurikulum); tulis hanya service role.
ALTER TABLE public.intake_item_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_scenario_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_interviews_own_select"
  ON public.intake_interviews FOR SELECT TO authenticated
  USING (user_id = public.apex_app_user_id());

CREATE POLICY "intake_interviews_own_insert"
  ON public.intake_interviews FOR INSERT TO authenticated
  WITH CHECK (user_id = public.apex_app_user_id());

CREATE POLICY "intake_interviews_own_update"
  ON public.intake_interviews FOR UPDATE TO authenticated
  USING (user_id = public.apex_app_user_id())
  WITH CHECK (user_id = public.apex_app_user_id());

CREATE POLICY "intake_turns_via_interview"
  ON public.intake_conversation_turns FOR ALL TO authenticated
  USING (
    interview_id IN (
      SELECT id FROM public.intake_interviews WHERE user_id = public.apex_app_user_id()
    )
  )
  WITH CHECK (
    interview_id IN (
      SELECT id FROM public.intake_interviews WHERE user_id = public.apex_app_user_id()
    )
  );

CREATE POLICY "intake_attempts_via_interview"
  ON public.intake_item_attempts FOR ALL TO authenticated
  USING (
    interview_id IN (
      SELECT id FROM public.intake_interviews WHERE user_id = public.apex_app_user_id()
    )
  )
  WITH CHECK (
    interview_id IN (
      SELECT id FROM public.intake_interviews WHERE user_id = public.apex_app_user_id()
    )
  );

CREATE POLICY "intake_scenario_resp_via_interview"
  ON public.intake_scenario_responses FOR ALL TO authenticated
  USING (
    interview_id IN (
      SELECT id FROM public.intake_interviews WHERE user_id = public.apex_app_user_id()
    )
  )
  WITH CHECK (
    interview_id IN (
      SELECT id FROM public.intake_interviews WHERE user_id = public.apex_app_user_id()
    )
  );

CREATE POLICY "intake_item_bank_read_active"
  ON public.intake_item_bank FOR SELECT TO authenticated
  USING (active = true);

CREATE POLICY "intake_scenario_prompts_read_active"
  ON public.intake_scenario_prompts FOR SELECT TO authenticated
  USING (active = true);
