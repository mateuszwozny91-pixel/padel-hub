"use client";

import Link from "next/link";

export default function PadelHubPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-green-900 to-emerald-700 flex items-center justify-center px-6">
      {/* Padel ball */}
      <div className="relative w-[320px] h-[320px] sm:w-[420px] sm:h-[420px] rounded-full bg-yellow-400 shadow-2xl flex flex-col items-center justify-center text-center">
        
        {/* Subtle ball texture */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 opacity-60" />
        <div className="absolute inset-4 rounded-full border border-yellow-200 opacity-40" />

        {/* Content */}
        <div className="relative z-10 space-y-6 px-6">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-green-900 tracking-tight">
            PadelHub
          </h1>

          <div className="flex flex-col gap-3">
            <Link
              href="/americano"
              className="block px-6 py-3 rounded-xl bg-green-900 text-white font-semibold hover:bg-green-800 transition"
            >
              Americano
            </Link>

            <Link
              href="/mexicano"
              className="block px-6 py-3 rounded-xl bg-green-900 text-white font-semibold hover:bg-green-800 transition"
            >
              Mexicano
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
