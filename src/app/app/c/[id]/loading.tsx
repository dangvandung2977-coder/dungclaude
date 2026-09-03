import React from "react";

export default function LoadingChat() {
  return (
    <div className="flex flex-col h-full bg-[#1F1E1D] text-[#ECEBE4] animate-pulse">
      {/* Top Chat Header Placeholder */}
      <div className="h-14 border-b border-white/[0.04] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-36 bg-white/[0.08] rounded-md" />
          <div className="h-3 w-16 bg-white/[0.04] rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-20 bg-white/[0.06] rounded-full" />
          <div className="h-7 w-7 bg-white/[0.06] rounded-lg" />
        </div>
      </div>

      {/* Messages Scroll Area Placeholder */}
      <div className="flex-1 overflow-hidden px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
        {/* User message placeholder */}
        <div className="flex justify-end">
          <div className="max-w-md w-3/4 space-y-2">
            <div className="h-4 w-20 bg-white/[0.04] rounded ml-auto" />
            <div className="h-12 bg-white/[0.06] rounded-2xl" />
          </div>
        </div>

        {/* Assistant message placeholder */}
        <div className="flex items-start gap-3">
          <div className="h-6 w-6 rounded-full bg-[#D97757]/20 shrink-0 mt-1" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-white/[0.08] rounded" />
            <div className="h-4 w-full bg-white/[0.04] rounded" />
            <div className="h-4 w-5/6 bg-white/[0.04] rounded" />
            <div className="h-4 w-2/3 bg-white/[0.04] rounded" />
          </div>
        </div>
      </div>

      {/* Bottom Composer Placeholder */}
      <div className="p-4 max-w-3xl mx-auto w-full">
        <div className="h-24 bg-[#262523]/80 border border-white/[0.06] rounded-2xl p-3 flex flex-col justify-between">
          <div className="h-3 w-32 bg-white/[0.04] rounded" />
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
            <div className="h-5 w-16 bg-white/[0.04] rounded" />
            <div className="h-7 w-7 bg-white/[0.08] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
