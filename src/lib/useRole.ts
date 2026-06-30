"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { type Role } from "@/lib/permissions";

export type { Role };

export function useRole() {
  const [role, setRole] = useState<Role>("staff");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (data?.role) setRole(data.role as Role);
      setLoading(false);
    })();
  }, []);

  const isAdmin = role === "admin";
  const isManager = role === "admin" || role === "manager";

  return { role, isAdmin, isManager, loading, userId };
}
