import React, { useState } from "react";
import { X, User, FileText } from "lucide-react";
import AyushCardReceiptPreview from "./AyushCardReceiptPreview";

const ViewVitranModal = ({ record, onClose }) => {
  const [activePanel, setActivePanel] = useState("photo");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50 rounded-t-2xl shrink-0">
          <div>
            <h3 className="text-sm font-black text-[#22333B]">Vitran Details</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {record.clientName} · Distributed {record.distributedAt}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 p-3 bg-gray-100 mx-4 mt-4 rounded-xl shrink-0">
          <button
            onClick={() => setActivePanel("photo")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${activePanel === "photo" ? "bg-white text-[#22333B] shadow-sm" : "text-gray-500"}`}
          >
            <User size={13} /> Recipient Photo
          </button>
          <button
            onClick={() => setActivePanel("receipt")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${activePanel === "receipt" ? "bg-white text-[#22333B] shadow-sm" : "text-gray-500"}`}
          >
            <FileText size={13} /> Application Receipt
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activePanel === "photo" ? (
            <div className="flex flex-col items-center">
              <div className="w-full max-w-md bg-gray-50 rounded-2xl p-4 border border-gray-100">
                {record.recipientImage ? (
                  <img src={record.recipientImage} alt={record.clientName} className="w-full rounded-xl object-contain max-h-[480px] mx-auto" />
                ) : (
                  <p className="text-center text-gray-400 py-16 text-sm">No photo available</p>
                )}
              </div>
              <div className="mt-4 text-center">
                <p className="text-sm font-bold text-[#22333B]">{record.clientName}</p>
                <p className="text-xs text-gray-400">{record.mobile} · Card {record.cardId}</p>
                <p className="text-[10px] text-[#F68E5F] font-semibold mt-1">Distributed on {record.distributedDateTime || record.distributedAt}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <AyushCardReceiptPreview card={record.card} />
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          <button onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 bg-white hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewVitranModal;
