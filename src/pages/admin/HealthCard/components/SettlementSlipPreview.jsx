import React, { useMemo } from "react";
import { LOGO_BASE64 } from "../../../../utils/logoBase64";
import { calculateSettlement } from "./vitranUtils";

const SettlementSlipPreview = ({ employee, date }) => {
  const calc = useMemo(() => calculateSettlement(employee.totalCards), [employee.totalCards]);
  return (
    <div className="bg-white text-black p-6 border border-gray-300 rounded-sm shadow-md mx-auto font-mono"
      style={{ width: "80mm", maxWidth: "100%", minHeight: "170mm", boxSizing: "border-box", fontSize: "11px", lineHeight: "1.4" }}>
      <div className="flex flex-col items-center mb-4">
        <div className="w-20 h-20 rounded-full border border-black flex items-center justify-center p-2 mb-2 bg-white">
          <img src={LOGO_BASE64} alt="BKBS Logo" className="h-12 w-auto object-contain" />
        </div>
        <h2 className="text-base font-extrabold tracking-widest uppercase text-center font-sans mt-1">Settlement</h2>
      </div>
      <div className="text-center font-sans mb-4 border-b border-dashed border-black pb-2">
        <h3 className="text-xs font-black uppercase leading-tight">Baijnaath Kesar Bai Sewa Trust</h3>
        <p className="text-[10px] font-bold mt-0.5">1-A Mangla Vihar New PAC Line</p>
        <p className="text-[10px] font-bold">Kanpur Nagar – 208015</p>
      </div>
      <div className="space-y-1 font-bold mb-4">
        <div>Date :- <span className="font-mono font-medium">{date}</span></div>
        <div>Camp Area :- <span className="font-sans font-medium">{employee.location || "Mangla Vihar"}</span></div>
        <div>Ayush Mitra Name :- <span className="font-sans font-medium">{employee.name}</span></div>
        <div>Ayoush Mitra ID No :- <span className="font-mono font-medium">{employee.id}</span></div>
        <div className="flex justify-between">
          <span>District :- <span className="font-sans font-medium">Kanpur Nagar</span></span>
          <span>Pin Code :- <span className="font-mono font-medium">{employee.pincode || "208015"}</span></span>
        </div>
        <div className="border-t border-dashed border-black pt-1 mt-1">
          Total Apply Ayoush Card - <span className="font-mono font-black text-sm">{employee.totalCards}</span>
        </div>
      </div>
      <div className="text-center my-3 bg-gray-50 py-0.5 border border-dashed border-black">
        <span className="text-xs font-extrabold tracking-wide uppercase font-sans">Apply Ayoush Card</span>
      </div>
      <table className="w-full text-left border-collapse text-[10px] font-bold mb-4">
        <thead>
          <tr className="border-b border-black font-sans uppercase">
            <th className="py-1">Card Detail - Amount</th>
            <th className="py-1 text-right">Online - Amount</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          <tr className="border-b border-dashed border-gray-100"><td className="py-1.5">160 x {calc.off160} = {Number(calc.amt160).toFixed(2)}</td><td className="py-1.5 text-right">{calc.on160} = {Number(calc.onAmt160).toFixed(0)}</td></tr>
          <tr className="border-b border-dashed border-gray-100"><td className="py-1.5">200 x {calc.off200} = {Number(calc.amt200).toFixed(2)}</td><td className="py-1.5 text-right">{calc.on200} = {Number(calc.onAmt200).toFixed(0)}</td></tr>
          <tr className="border-b border-dashed border-gray-100"><td className="py-1.5">240 x {calc.off240} = {Number(calc.amt240).toFixed(2)}</td><td className="py-1.5 text-right">{calc.on240} = {Number(calc.onAmt240).toFixed(0)}</td></tr>
          <tr className="border-b border-dashed border-gray-100"><td className="py-1.5">280 x {calc.off280} = {Number(calc.amt280).toFixed(2)}</td><td className="py-1.5 text-right">{calc.on280} = {Number(calc.onAmt280).toFixed(0)}</td></tr>
          <tr className="border-b border-dashed border-gray-100"><td className="py-1.5">Penelty x {calc.penaltyCount} = {Number(calc.penaltyAmount).toFixed(2)}</td><td className="py-1.5 text-right">{calc.onPenaltyCount} = {Number(calc.onPenaltyAmount).toFixed(0)}</td></tr>
          <tr className="border-t border-black font-extrabold text-[10.5px]">
            <td className="py-2">Total = {calc.offlineCount} = {Number(calc.offlineTotalWithPenalty).toFixed(2)}</td>
            <td className="py-2 text-right">{calc.onlineCount} = {Number(calc.onlineTotalWithPenalty).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div className="bg-gray-50 border border-black p-2 text-center rounded-sm font-sans mb-6">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Calculated Revenue Equation</div>
        <div className="text-[10.5px] font-black mt-0.5 leading-tight">
          Grand Total = {calc.offlineBaseTotal} + {calc.onlineTotalWithPenalty} + {calc.penaltyAmount} = <span className="text-[#F68E5F] font-mono font-black text-sm">₹{calc.grandTotal}</span>
        </div>
      </div>
      <div className="space-y-4 font-bold my-4 border-t border-dashed border-black pt-3">
        <div>Cash Receiver Name : __________________</div>
        <div>Cash Receiver ID No :- __________________</div>
      </div>
      <div className="mt-8 mb-2">
        <div className="border border-black rounded-sm h-14 w-full flex items-center justify-center bg-gray-50/20">
          <span className="font-sans text-gray-400 font-bold text-xs uppercase tracking-widest">Signature</span>
        </div>
      </div>
    </div>
  );
};

export default SettlementSlipPreview;
