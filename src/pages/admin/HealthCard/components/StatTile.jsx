import React from "react";

const StatTile = ({ icon: Icon, label, value, color, bg }) => (
  <div className={`rounded-xl border ${bg} p-4 flex items-center gap-3 shadow-sm flex-1 shrink-0 min-w-[170px] sm:min-w-0`}>
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      <Icon size={18} />
    </div>
    <div>
      <p className="text-xs text-gray-500 font-semibold">{label}</p>
      <p className="text-xl font-black text-[#22333B]">{value}</p>
    </div>
  </div>
);

export default StatTile;
