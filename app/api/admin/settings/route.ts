import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireAdminFromRequest } from "@/lib/auth/admin-request";

type SettingsPayload = {
  app_name?: string;
  app_tagline?: string;
  wellbeing_minutes?: number;
};

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("app_name, app_tagline, wellbeing_minutes")
      .eq("id", 1)
      .single();

    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }

    const body = (await req.json()) as SettingsPayload;
    const appName = body.app_name?.trim() || "APEX System";
    const appTagline =
      body.app_tagline?.trim() || "Belajar Mandiri, Bersaing Global.";
    const wellbeingMinutes = Math.max(
      10,
      Math.min(120, Number(body.wellbeing_minutes ?? 45)),
    );

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert(
        {
          id: 1,
          app_name: appName,
          app_tagline: appTagline,
          wellbeing_minutes: wellbeingMinutes,
        },
        { onConflict: "id" },
      )
      .select("app_name, app_tagline, wellbeing_minutes")
      .single();

    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
