"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function DismissAlertLink({
  keys,
  href,
  children,
  style,
}: {
  keys: string[];
  href: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const router = useRouter();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase.from("profiles").select("dismissed_alerts").eq("id", user.id).single();
      const current: string[] = Array.isArray(prof?.dismissed_alerts) ? prof.dismissed_alerts : [];
      const merged = [...new Set([...current, ...keys])];
      await supabase.from("profiles").update({ dismissed_alerts: merged }).eq("id", user.id);
    }
    router.push(href);
  };

  return (
    <a href={href} onClick={handleClick} style={style}>
      {children}
    </a>
  );
}
