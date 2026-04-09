import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const adminEmail = process.env.APEX_SEED_ADMIN_EMAIL;
const adminPassword = process.env.APEX_SEED_ADMIN_PASSWORD;
const studentEmail = process.env.APEX_SEED_STUDENT_EMAIL;
const studentPassword = process.env.APEX_SEED_STUDENT_PASSWORD;

if (!adminEmail || !adminPassword || !studentEmail || !studentPassword) {
  console.error(
    "Missing seed env. Required: APEX_SEED_ADMIN_EMAIL, APEX_SEED_ADMIN_PASSWORD, APEX_SEED_STUDENT_EMAIL, APEX_SEED_STUDENT_PASSWORD",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser({ email, password, role }) {
  const list = await supabase.auth.admin.listUsers();
  if (list.error) throw list.error;

  const existing = list.data.users.find((u) => u.email === email);
  if (existing) {
    const update = await supabase.auth.admin.updateUserById(existing.id, {
      user_metadata: { ...(existing.user_metadata ?? {}), role },
      password,
    });
    if (update.error) throw update.error;
    console.log(`Updated ${role} user: ${email}`);
    return;
  }

  const create = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (create.error) throw create.error;
  console.log(`Created ${role} user: ${email}`);
}

async function run() {
  await ensureUser({
    email: adminEmail,
    password: adminPassword,
    role: "ADMIN",
  });
  await ensureUser({
    email: studentEmail,
    password: studentPassword,
    role: "STUDENT",
  });
  console.log("Seed test users completed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
