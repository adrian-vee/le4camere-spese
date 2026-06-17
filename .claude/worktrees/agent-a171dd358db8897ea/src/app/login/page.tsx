export const dynamic = "force-dynamic";

import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#1F3326" }} />}>
      <LoginForm />
    </Suspense>
  );
}
