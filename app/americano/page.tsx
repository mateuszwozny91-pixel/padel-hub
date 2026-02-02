import { Suspense } from "react";
import AmericanoClient from "./AmericanoClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-600">Ładowanie…</div>}>
      <AmericanoClient />
    </Suspense>
  );
}
