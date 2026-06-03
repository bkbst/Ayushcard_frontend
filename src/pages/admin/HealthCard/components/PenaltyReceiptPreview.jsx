import React from "react";
import { LOGO_BASE64 } from "../../../../utils/logoBase64";
import { getFormattedCurrentDate, PENALTY_AMOUNT } from "./vitranUtils";

const PenaltyReceiptPreview = ({ card, receiptRecord }) => {
  const date = receiptRecord?.issuedAt || getFormattedCurrentDate();
  return (
    <div className="bg-white text-black border border-gray-400 mx-auto font-sans"
      style={{ width: "80mm", maxWidth: "100%", boxSizing: "border-box", fontSize: "11px", lineHeight: "1.5", padding: "16px 14px" }}>
      {/* Logo */}
      <div className="flex flex-col items-center mb-3">
        <div className="w-16 h-16 rounded-full border-2 border-black flex items-center justify-center p-1.5 mb-2 bg-white">
          <img src={LOGO_BASE64} alt="BKBS Logo" className="h-10 w-auto object-contain" />
        </div>
        <h2 className="text-sm font-extrabold underline text-center" style={{ fontFamily: "serif" }}>
          Penelty Recept
        </h2>
      </div>

      {/* Trust Header */}
      <div className="text-center mb-4 border-b border-black pb-3">
        <div className="font-black text-sm leading-tight" style={{ fontFamily: "serif" }}>Baijnaath Kesar Bai Sewa Trust</div>
        <div className="text-[10px] font-bold mt-0.5">1-A Mangla Vihar New PAC Line</div>
        <div className="text-[10px] font-bold">Kanpur Nagar – 208015</div>
      </div>

      {/* Card Details */}
      <div className="space-y-1.5 font-bold text-[10.5px] mb-3">
        <div><span className="font-black">Date :-</span> {date}</div>
        <div><span className="font-black">Card ID No :-</span> {card?.id || card?.receiptNo || "—"}</div>
        <div><span className="font-black">Camp Area :-</span> {card?.area || "Mangla Vihar"}</div>
        <div><span className="font-black">Mukhiya Name :-</span> {card?.mukhiyaName || card?.clientName || "—"}</div>
        <div><span className="font-black">Full Address :-</span> {card?.address || "—"}</div>
        <div className="flex justify-between">
          <span><span className="font-black">District :-</span> {card?.district || "Kanpur Nagar"}</span>
        </div>
        <div className="flex justify-between">
          <span><span className="font-black">Pin Code :-</span> {card?.pincode || "208015"}</span>
          <span><span className="font-black">Total Member :-</span> {card?.totalMember || "1"}</span>
        </div>
      </div>

      {/* Penalty Box */}
      <div className="text-center font-black text-[11px] my-3 border-t border-b border-black py-2">
        Penelty Amount :- Rs. {PENALTY_AMOUNT}.00
      </div>

      {/* Payment Method if present */}
      {receiptRecord && (
        <div className="text-[10px] font-bold border border-dashed border-gray-400 p-1.5 mb-3 rounded-sm">
          <div>Receipt No :- {receiptRecord.receiptNo}</div>
          <div>Payment Method :- {receiptRecord.paymentMethod === "online" ? "Online (UPI/Net Banking)" : "Offline (Cash)"}</div>
          {receiptRecord.paymentRef && <div>Ref :- {receiptRecord.paymentRef}</div>}
          <div>Status :- {receiptRecord.paymentStatus === "paid" ? "✓ Paid" : "⏳ Pending"}</div>
        </div>
      )}

      {/* Hindi important info */}
      <div className="mb-3">
        <div className="text-center font-black text-[10.5px] mb-1.5 underline">महत्वपूर्ण जानकारी</div>
        <div className="text-[9.5px] leading-relaxed space-y-2" style={{ fontFamily: "sans-serif" }}>
          <p>कार्ड का उपयोग करने से पूर्व, कृपया कार्ड के साथ दिए किए गए लेटर को ध्यानपूर्वक अवश्य पढ़ें।</p>
          <p>किसी भी प्रकार की समस्या या सहायता हेतु, कृपया कार्ड के साथ दिए गए हेल्पलाइन नंबर 8303902030 पर संपर्क करें।</p>
          <p>आपके द्वारा जमा की गई राशि का उपयोग जरूरतमंद लोगों की सहायता एवं सामाजिक कल्याण के कार्यों में लगाया जाता है।</p>
        </div>
      </div>

      {/* Ayush Mitra */}
      <div className="space-y-1 font-bold text-[10.5px] mb-4 border-t border-dashed border-black pt-2">
        <div><span className="font-black">Ayoush Mitra Name :-</span> {card?.employeeName || "—"}</div>
        <div><span className="font-black">Ayoush Mitra ID No :-</span> {card?.employeeId || "—"}</div>
      </div>

      {/* Signature */}
      <div className="mt-6">
        <div className="border border-black h-14 w-full flex items-center justify-center rounded-sm bg-gray-50">
          <span className="text-gray-300 font-bold text-xs uppercase tracking-widest">Signature</span>
        </div>
      </div>
    </div>
  );
};

export default PenaltyReceiptPreview;
