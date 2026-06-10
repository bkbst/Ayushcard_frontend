import { formatCardCreatedAt, getCardCreatedAt } from "../../../../utils/healthCardUtils";

export const PENALTY_AMOUNT = 50;

export const getTodayISO = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
};

export const formatISOToDisplay = (iso) => {
  if (!iso) return getFormattedCurrentDate();
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return getFormattedCurrentDate();
  return `${day}-${month}-${year}`;
};

export const getFormattedCurrentDate = () => formatISOToDisplay(getTodayISO());

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

// ─── HELPER: map a normalized health card to the shape used by the duplicate receipt flow ─
export const toDupCardShape = (card, createdByMap = {}) => {
  const empRaw = card.createdBy;
  const mapped = typeof empRaw === "string" ? createdByMap[empRaw] : null;
  const empId = typeof empRaw === "object"
    ? (empRaw?.employeeId || empRaw?._id || "")
    : (mapped?.employeeId || empRaw || "");
  const empName = typeof empRaw === "object"
    ? (empRaw?.name || [empRaw?.firstName, empRaw?.lastName].filter(Boolean).join(" ") || empRaw?.email || empRaw?.employeeId || "")
    : (mapped?.name || empRaw || "");

  return {
    id: card.id || card.applicationId || card._id || "",
    _id: card._id || "",
    distributed: Boolean(card.distributed),
    distributedImage: card.distributedImage || "",
    distributionDate: card.distributionDate || "",
    distributedBy: card.distributedBy || null,
    hasDuplicateReceipt: Boolean(card.hasDuplicateReceipt),
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
    _apiRaw: card._apiRaw || null,
    _rawCard: card._apiRaw || card,
    payment: card.payment || card._apiRaw?.payment,
    cardNo: card.cardNo || card._apiRaw?.cardNo,
  };
};
