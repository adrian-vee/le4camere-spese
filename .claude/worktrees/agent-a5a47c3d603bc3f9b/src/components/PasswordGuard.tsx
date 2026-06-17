"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PasswordGuard({ mustChange, children }: { mustChange: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (mustChange && pathname !== "/impostazioni") {
      router.replace("/impostazioni");
    }
  }, [mustChange, pathname, router]);

  if (mustChange && pathname !== "/impostazioni") {
    return <div className="empty">Reindirizzamento...</div>;
  }

  return <>{children}</>;
}
