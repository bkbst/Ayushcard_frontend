import { formatCardCreatedAt, getCardCreatedAt } from "../../../../utils/healthCardUtils";

export const PENALTY_AMOUNT = 50;

export const getFormattedCurrentDate = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export const getDateTime = () => {
  const d = new Date();
  return d.toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const generateDupReceiptNo = () => {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `DUP-${datePart}-${rand}`;
};

// ─── SETTLEMENT CALCULATION ENGINE ───────────────────────────────────────────
export const calculateSettlement = (totalCards) => {
  const count = Number(totalCards) || 0;
  const offlineCount = Math.max(0, Math.round(count * 0.9));
  const onlineCount = Math.max(0, count - offlineCount);
  const off160 = Math.max(0, Math.round(offlineCount * 0.4));
  const off200 = Math.max(0, Math.round(offlineCount * 0.35));
  const off240 = Math.max(0, Math.round(offlineCount * 0.15));
  const off280 = Math.max(0, offlineCount - (off160 + off200 + off240));
  const amt160 = off160 * 160; const amt200 = off200 * 200;
  const amt240 = off240 * 240; const amt280 = off280 * 280;
  const offlineBaseTotal = amt160 + amt200 + amt240 + amt280;
  const on160 = Math.max(0, Math.round(onlineCount * 0.4));
  const on200 = Math.max(0, Math.round(onlineCount * 0.3));
  const on240 = Math.max(0, Math.round(onlineCount * 0.3));
  const on280 = Math.max(0, onlineCount - (on160 + on200 + on240));
  const onAmt160 = on160 * 160; const onAmt200 = on200 * 200;
  const onAmt240 = on240 * 240; const onAmt280 = on280 * 280;
  const onlineBaseTotal = onAmt160 + onAmt200 + onAmt240 + onAmt280;
  const penaltyCount = Math.max(0, Math.round(offlineCount * 0.05));
  const penaltyAmount = penaltyCount * 25;
  const onPenaltyCount = Math.max(0, Math.round(onlineCount * 0.28));
  const onPenaltyAmount = onPenaltyCount * 50;
  const offlineTotalWithPenalty = offlineBaseTotal + penaltyAmount;
  const onlineTotalWithPenalty = onlineBaseTotal + onPenaltyAmount;
  const grandTotal = offlineBaseTotal + onlineBaseTotal + penaltyAmount + onPenaltyAmount;
  return {
    offlineCount, off160, off200, off240, off280, amt160, amt200, amt240, amt280, offlineBaseTotal,
    onlineCount, on160, on200, on240, on280, onAmt160, onAmt200, onAmt240, onAmt280, onlineBaseTotal,
    penaltyCount, penaltyAmount, onPenaltyCount, onPenaltyAmount,
    offlineTotalWithPenalty, onlineTotalWithPenalty, grandTotal
  };
};

// ─── HELPER: map a normalized health card to the shape used by the duplicate receipt flow ─
export const toDupCardShape = (card, createdByMap = {}) => {
  const empRaw = card.createdBy;
  const empId = typeof empRaw === "object" ? (empRaw?._id || empRaw?.employeeId || "") : (empRaw || "");
  const empName = typeof empRaw === "object"
    ? (empRaw?.name || [empRaw?.firstName, empRaw?.lastName].filter(Boolean).join(" ") || empRaw?.email || empRaw?.employeeId || "")
    : (createdByMap[empRaw] || empRaw || "");

  return {
    id: card.id || card.applicationId || card._id || "",
    clientName: card.applicant || "",
    mobile: card.phone || "",
    mukhiyaName: card.applicant || "",
    area: card.location || card.ngoLocation || "Mangla Vihar",
    district: "Kanpur Nagar",
    pincode: card.pincode || "208015",
    totalMember: card.totalMembers || 1,
    amount: Number(card.payment?.totalPaid || 0),
    cardType: (card.totalMembers || 1) > 1 ? "Family" : "Individual",
    exportDate: formatCardCreatedAt(getCardCreatedAt(card)),
    employeeId: empId,
    employeeName: empName,
    receiptNo: card.applicationId || card.id || card._id || "",
    address: card.address || "",
    _rawCard: card,
  };
};
