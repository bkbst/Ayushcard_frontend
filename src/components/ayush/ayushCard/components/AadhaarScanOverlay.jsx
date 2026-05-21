import { Loader2 } from "lucide-react";

export default function AadhaarScanOverlay({
  active,
  progress = 0,
  statusMessage = "Scanning…",
}) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 bg-black/55 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
      <Loader2 className="animate-spin text-[#fa8112] mb-3" size={28} />
      <div className="w-full max-w-[180px] h-1.5 bg-white/25 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-[#fa8112] transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(8, progress))}%` }}
        />
      </div>
      <p className="text-white text-[11px] sm:text-[12px] font-semibold text-center drop-shadow px-2">
        {statusMessage}
      </p>
      <p className="text-white/80 text-[10px] mt-1 text-center">
        {progress > 0 ? `${progress}%` : "Please wait"}
      </p>
      <div
        className="absolute left-3 right-3 h-0.5 bg-[#fa8112] opacity-80 animate-[aadhaarScan_2.2s_ease-in-out_infinite] pointer-events-none"
        aria-hidden
      />
      <style>{`
        @keyframes aadhaarScan {
          0%, 100% { top: 18%; opacity: 0.4; }
          50% { top: 78%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function AadhaarCameraFrame({ label, hint }) {
  return (
    <>
      <div className="absolute inset-3 sm:inset-4 border-2 border-[#fa8112]/90 border-dashed rounded-lg pointer-events-none flex items-start justify-center">
        <p className="mt-1 px-2 py-0.5 text-[10px] text-white font-semibold drop-shadow-md text-center bg-black/40 rounded">
          {label}
        </p>
      </div>
      {hint ? (
        <p className="absolute bottom-2 left-2 right-2 text-center text-[9px] text-white/90 bg-black/50 rounded px-1 py-0.5 pointer-events-none">
          {hint}
        </p>
      ) : null}
    </>
  );
}
