import { ArrowLeft, Check, Plus, Printer } from "lucide-react";
import { useAyushCardForm } from "../AyushCardFormContext.jsx";
import { fullNameFromCardRecord } from "../utils.js";
import ThermalReceipt from "./ThermalReceipt.jsx";

export default function ApplicationSuccessStep() {
  const form = useAyushCardForm();
  const {
    skipPayment, staffPaymentFlow, submissionReceipt, estimatedFee, applicationId,
    txnId, staffPaymentMode, familyHead, totalMembersCount, hasPrintableReceipt,
    createdByEmployee, createdByEmployeeLoading,
    handleRawBtPrint, resetForm, variant, onBack, onClose,
  } = form;

  const createdByName =
    createdByEmployee?.name ||
    [createdByEmployee?.firstName, createdByEmployee?.middleName, createdByEmployee?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  const createdByEmpId = createdByEmployee?.employeeId || createdByEmployee?.id;
  const createdByLabel = createdByEmployeeLoading
    ? "Loading…"
    : createdByName || createdByEmpId || (submissionReceipt?.createdBy ? String(submissionReceipt.createdBy?._id || submissionReceipt.createdBy?.id || submissionReceipt.createdBy) : "—");

  return (
            <div className="flex-1 min-h-0 overflow-y-auto px-8 py-8 animate-in zoom-in-95 duration-500 bg-[#F9FAFB] custom-scrollbar">
              <style>{`
              @media print {
                @page { size: 2in auto; margin: 0; }
                body * { visibility: hidden !important; }
                .public-thermal-receipt-wrap, .public-thermal-receipt-wrap * { visibility: visible !important; }
                .public-thermal-receipt-wrap {
                  position: fixed !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 2in !important;
                  max-width: 2in !important;
                  margin: 0 !important;
                  padding: 6px !important;
                  display: block !important;
                  box-sizing: border-box !important;
                }
                .no-print-public { display: none !important; }
              }
            `}</style>

              <ThermalReceipt />

              <div
                id="public-application-receipt"
                className="max-w-md mx-auto bg-transparent no-print-public"
              >
                {/* Receipt Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                  <div className="bg-green-500 p-6 flex flex-col items-center">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                      <Check className="text-white w-6 h-6" strokeWidth={3} />
                    </div>
                    <h2 className="text-white text-xl font-bold">
                      {skipPayment || staffPaymentFlow
                        ? "Application Submitted"
                        : "Payment Successful"}
                    </h2>
                  </div>

                  <div className="p-6 space-y-4">
                    {!skipPayment && !staffPaymentFlow && (
                      <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                        <span className="text-gray-500 text-sm">
                          Amount Paid
                        </span>
                        <span className="text-xl font-bold text-[#222222]">
                          ₹
                          {submissionReceipt?.totalAmount != null &&
                          !Number.isNaN(Number(submissionReceipt.totalAmount))
                            ? Number(submissionReceipt.totalAmount)
                            : estimatedFee}
                          .00
                        </span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">
                          {skipPayment || staffPaymentFlow
                            ? "Application ID"
                            : "Transaction ID"}
                        </span>
                        <span className="font-semibold text-[#222222] uppercase">
                          {skipPayment || staffPaymentFlow
                            ? submissionReceipt?.applicationId != null
                              ? String(submissionReceipt.applicationId)
                              : applicationId
                            : txnId || "N/A"}
                        </span>
                      </div>
                      {staffPaymentFlow && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Payment</span>
                          <span className="font-semibold text-[#222222]">
                            {staffPaymentMode === "cash"
                              ? "Cash (receipt attached)"
                              : txnId
                                ? `Online · ${txnId}`
                                : "Online"}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-start gap-3 text-sm">
                        <span className="text-gray-500 shrink-0 pt-0.5">
                          {skipPayment || staffPaymentFlow
                            ? "Submitted"
                            : "Payment Date"}
                        </span>
                        <span className="font-semibold text-[#222222] text-right">
                          {(() => {
                            const rec = submissionReceipt;
                            const fullTs = rec?.createdAt || rec?.updatedAt;
                            const rawDs = rec?.applicationDate != null ? String(rec.applicationDate).trim() : "";
                            const d = fullTs
                              ? new Date(fullTs)
                              : rawDs.length > 10
                                ? new Date(rawDs.replace(/(Z|\+00:00)$/, ""))
                                : new Date();
                            return (
                              <>
                                <span className="block leading-snug">
                                  {d.toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                                <span className="block leading-snug">
                                  {d.toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </span>
                              </>
                            );
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Family Head</span>
                        <span className="font-semibold text-[#222222]">
                          {fullNameFromCardRecord(submissionReceipt) ||
                            familyHead.fullName}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Total Members</span>
                        <span className="font-semibold text-[#222222]">
                          {submissionReceipt?.totalMembers != null
                            ? Number(submissionReceipt.totalMembers)
                            : submissionReceipt?.totalMember != null
                              ? Number(submissionReceipt.totalMember)
                              : totalMembersCount}
                        </span>
                      </div>

                      {submissionReceipt?.createdBy ? (
                        <div className="flex justify-between items-start gap-3 text-sm">
                          <span className="text-gray-500 shrink-0">Created By</span>
                          <span className="font-semibold text-[#222222] text-right break-all">
                            {createdByLabel}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="pt-4 mt-4 border-t border-dashed border-gray-200">
                      <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
                        <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-blue-600 text-[10px] font-bold">
                            i
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed text-left">
                          Your application is under review. You will receive an
                          SMS and Email notification once your Ayush Card is
                          generated.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                  {!hasPrintableReceipt ? (
                    <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Receipt printing is available only after successful card
                      creation.
                    </p>
                  ) : null}

                  {hasPrintableReceipt && (
                    <div
                      className={`grid ${staffPaymentFlow ? "grid-cols-2" : "grid-cols-1"} gap-3`}
                    >
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3.5 px-3 rounded-xl transition-all shadow-sm text-sm whitespace-nowrap"
                      >
                        <Printer size={18} />
                        Print receipt
                      </button>
                      {staffPaymentFlow && (
                        <button
                          type="button"
                          onClick={handleRawBtPrint}
                          className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold py-3.5 px-3 rounded-xl transition-all shadow-sm text-sm whitespace-nowrap"
                        >
                          <Printer size={18} />
                          RawBT Print
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-[#fa8112] text-[#fa8112] hover:bg-orange-50 font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm"
                  >
                    <Plus size={18} />
                    Create another
                  </button>
                  <button
                    type="button"
                    onClick={variant === "page" && onBack ? onBack : onClose}
                    className="w-full flex items-center justify-center gap-2 bg-[#FA8112] hover:bg-[#e0720f] active:scale-95 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-md mt-1"
                  >
                    <ArrowLeft size={18} />
                    {variant === "page" ? "Back to list" : "Return to Home"}
                  </button>
                </div>
              </div>
            </div>
  );
}
