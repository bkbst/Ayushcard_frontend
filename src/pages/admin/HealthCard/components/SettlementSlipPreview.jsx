import React from "react";
import { LOGO_BASE64 } from "../../../../utils/logoBase64";
import {
  formatGrandTotalLabel,
  formatOfflineTotalPlain,
  formatOnlineAmount,
  formatOnlineTotalPlain,
  formatPenaltyOfflineLine,
  formatTierOfflineLine,
  getSettlementReceiptRows,
} from "./settlementCalc";

const SettlementSlipPreview = ({ employee, date, calc }) => {
  const hasData = calc != null;
  const receiptRows = getSettlementReceiptRows(calc);

  return (
    <div
      className="bg-white text-black p-6 border border-gray-300 rounded-sm shadow-md mx-auto font-mono"
      style={{
        width: "80mm",
        maxWidth: "100%",
        minHeight: "170mm",
        boxSizing: "border-box",
        fontSize: "11px",
        lineHeight: "1.4",
      }}
    >
      <div className="flex flex-col items-center mb-4">
        <div className="w-20 h-20 rounded-full border border-black flex items-center justify-center p-2 mb-2 bg-white">
          <img src={LOGO_BASE64} alt="BKBS Logo" className="h-12 w-auto object-contain" />
        </div>
        <h2 className="text-base font-extrabold tracking-widest uppercase text-center font-sans mt-1">
          Settlement
        </h2>
      </div>
      <div className="text-center font-sans mb-4 border-b border-dashed border-black pb-2">
        <h3 className="text-xs font-black uppercase leading-tight">Baijnaath Kesar Bai Sewa Trust</h3>
        <p className="text-[10px] font-bold mt-0.5">1-A Mangla Vihar New PAC Line</p>
        <p className="text-[10px] font-bold">Kanpur Nagar – 208015</p>
      </div>
      <div className="space-y-1 font-bold mb-4">
        <div>
          Date :- <span className="font-mono font-medium">{date}</span>
        </div>
        <div>
          Camp Area :- <span className="font-sans font-medium">{employee.location || "Mangla Vihar"}</span>
        </div>
        <div>
          Ayush Mitra Name :- <span className="font-sans font-medium">{employee.name}</span>
        </div>
        <div>
          Ayush Mitra ID No :- <span className="font-mono font-medium">{employee.id}</span>
        </div>
        <div className="flex justify-between">
          <span>
            District :- <span className="font-sans font-medium">Kanpur Nagar</span>
          </span>
          <span>
            Pin Code :- <span className="font-mono font-medium">{employee.pincode || "208015"}</span>
          </span>
        </div>
        <div className="border-t border-dashed border-black pt-1 mt-1">
          Total Apply Ayush Card -{" "}
          <span className="font-mono font-black text-sm">
            {hasData ? (calc.totalCards ?? employee.totalCards ?? 0) : "—"}
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="text-center py-10 border border-dashed border-gray-300 rounded-sm bg-gray-50 mb-6">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">No data</p>
          <p className="text-[10px] text-gray-400 mt-1 font-sans">
            No settlement card records for this date.
          </p>
        </div>
      ) : (
        <>
          <div className="text-center my-3 bg-gray-50 py-0.5 border border-dashed border-black">
            <span className="text-xs font-extrabold tracking-wide uppercase font-sans">Apply Ayush Card</span>
          </div>
          <table
            className="w-full border-collapse table-fixed text-[10px] font-bold mb-4 font-mono"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <colgroup>
              <col style={{ width: "52%" }} />
              <col style={{ width: "48%" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-black font-sans uppercase">
                <th className="py-1 text-left align-top pr-2">Card Detail - Amount</th>
                <th className="py-1 text-left align-top whitespace-nowrap pl-2">Online - Amount</th>
              </tr>
            </thead>
            <tbody>
              {receiptRows.map((row) =>
                row.type === "tier" ? (
                  <tr key={`tier-${row.tier}`} className="border-b border-dashed border-gray-100">
                    <td className="py-1.5 text-left align-top pr-2 tracking-wide">
                      {formatTierOfflineLine(row.tier, row.off, row.amt, 2)}
                    </td>
                    <td className="py-1.5 text-left align-top whitespace-nowrap pl-2 tracking-wide">
                      {formatOnlineAmount(row.on, row.onAmt, 0)}
                    </td>
                  </tr>
                ) : (
                  <tr key="penalty" className="border-b border-dashed border-gray-100">
                    <td className="py-1.5 text-left align-top pr-2 tracking-wide">
                      {formatPenaltyOfflineLine(row.penaltyCount, row.penaltyAmount, 2)}
                    </td>
                    <td className="py-1.5 text-left align-top whitespace-nowrap pl-2 tracking-wide">
                      {formatOnlineAmount(row.onPenaltyCount, row.onPenaltyAmount, 0)}
                    </td>
                  </tr>
                ),
              )}
              <tr className="border-t border-black font-extrabold text-[10.5px]">
                <td className="py-2 text-left align-top pr-2">
                  {formatOfflineTotalPlain(calc.offlineCount, calc.offlineTotalWithPenalty, 2)}
                </td>
                <td className="py-2 text-left align-top whitespace-nowrap pl-2">
                  {formatOnlineTotalPlain(calc.onlineCount, calc.onlineTotalWithPenalty, 2)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="bg-gray-50 border border-black p-2 text-center rounded-sm font-sans mb-6">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Calculated Revenue Equation
            </div>
            <div className="text-[10.5px] font-black mt-0.5 leading-tight">
              Grand Total = {formatGrandTotalLabel(calc)}
            </div>
          </div>
        </>
      )}

      <div className="space-y-4 font-bold my-4 border-t border-dashed border-black pt-3">
        <div>Cash Receiver Name : __________________</div>
        <div>Cash Receiver ID No :- __________________</div>
      </div>
      <div className="mt-8 mb-2">
        <div className="border border-black rounded-sm h-14 w-full flex items-center justify-center bg-gray-50/20">
          <span className="font-sans text-gray-400 font-bold text-xs uppercase tracking-widest">
            Signature
          </span>
        </div>
      </div>
    </div>
  );
};

export default SettlementSlipPreview;
