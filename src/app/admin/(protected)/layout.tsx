import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { getPlatformAdminUser } from "@/lib/auth/platform-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getPlatformAdminUser();
  if (!user) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) redirect("/login?next=/admin");
    redirect("/admin/forbidden");
  }

  return <AdminShell adminEmail={user.email}>{children}</AdminShell>;
}
