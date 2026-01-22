import TvView from "@/components/TvView";
import type { Variant } from "@/lib/types";

export default function TvPage({
  searchParams,
}: {
  searchParams: { variant?: string };
}) {
  const v = (searchParams?.variant ?? "AMERICANO").toUpperCase();
  const variant: Variant = v === "MEXICANO" ? "MEXICANO" : "AMERICANO";
  return <TvView variant={variant} />;
}
