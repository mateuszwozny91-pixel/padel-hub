import { Suspense } from "react";
import MexicanoClient from "./MexicanoClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-600">Ładowanie…</div>}>
      <MexicanoClient />
    </Suspense>
  );
}
