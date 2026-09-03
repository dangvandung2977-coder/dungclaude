import React from "react";

export default function LoadingNewChat() {
  return (
    <div className="flex flex-col h-full bg-[#1F1E1D] text-[#ECEBE4] animate-pulse">
      {/* Top Header Placeholder */}
      <div className="h-14 border-b border-white/[0.04] px-4 flex items-center justify-between">
        <div className="h-4 w-28 bg-white/[0.06] rounded-md" />
        <div className="h-7 w-24 bg-white/[0.06] rounded-full" />
      </div>

      {/* Main Center Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-2xl mx-auto w-full space-y-6">
        {/* Asterisk and Greeting Placeholder */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#D97757]/20" />
          <div className="h-8 w-48 bg-white/[0.08] rounded-xl" />
        </div>

        {/* Composer Placeholder */}
        <div className="w-full h-36 bg-[#262523]/80 border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-between">
          <div className="h-4 w-40 bg-white/[0.04] rounded" />
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
            <div className="h-6 w-20 bg-white/[0.04] rounded-lg" />
            <div className="h-8 w-8 bg-white/[0.08] rounded-full" />
          </div>
        </div>

        {/* Action Pills Placeholder */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <div className="h-7 w-20 bg-white/[0.04] rounded-full" />
          <div className="h-7 w-20 bg-white/[0.04] rounded-full" />
          <div className="h-7 w-20 bg-white/[0.04] rounded-full" />
          <div className="h-7 w-24 bg-white/[0.04] rounded-full" />
          <div className="h-7 w-28 bg-white/[0.04] rounded-full" />
        </div>
      </div>
    </div>
  );
}
