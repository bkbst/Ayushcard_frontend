import {
  AYUSH_CARD_BASE_PACKAGE_RUPEES,
  AYUSH_CARD_INCLUDED_MEMBERS,
  AYUSH_CARD_EXTRA_MEMBER_RUPEES,
} from "./constants.js";

export function computeAyushCardFeeRupees(totalMembersIncludingHead) {
  const n = Math.max(1, Number(totalMembersIncludingHead) || 1);
  if (n <= AYUSH_CARD_INCLUDED_MEMBERS) return AYUSH_CARD_BASE_PACKAGE_RUPEES;
  return (
    AYUSH_CARD_BASE_PACKAGE_RUPEES +
    (n - AYUSH_CARD_INCLUDED_MEMBERS) * AYUSH_CARD_EXTRA_MEMBER_RUPEES
  );
}

/** Same splitting as submit payload: first / middle / last from full name string */
export function splitFamilyHeadNameParts(fullName) {
  const nameParts = String(fullName || "")
    .trim()
    .split(" ")
    .filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
  const middleName =
    nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "";
  return { firstName, middleName, lastName };
}

/** Pull created card record from POST response: `{ success, data }` or flat body */
export function extractCreatedCardRecord(res) {
  if (res == null || typeof res !== "object") return null;
  if (
    res.data != null &&
    typeof res.data === "object" &&
    !Array.isArray(res.data) &&
    (res.data.applicationId != null ||
      res.data._id != null ||
      res.data.contact != null)
  ) {
    return res.data;
  }
  if (res.applicationId != null || res._id != null) return res;
  return null;
}

export function fullNameFromCardRecord(rec) {
  if (!rec) return "";
  const parts = [rec.firstName, rec.middleName, rec.lastName].filter(
    (p) => p != null && String(p).trim() !== "",
  );
  return parts.join(" ").trim();
}

export function thermalMemberLabel(m) {
  if (!m) return "—";
  if (m.fullName) return m.fullName;
  if (m.name) return m.name;
  return "—";
}

export function thermalMemberDocId(m) {
  const raw = m?.documentId ?? m?.docId ?? "";
  return String(raw);
}

export const generateApplicationId = () =>
  `AC-${Math.floor(1000000 + Math.random() * 9000000)}`;

/** Keep payment from submit payload when create/get API omits it on the card record */
export function mergeReceiptWithPayment(created, paymentPayload) {
  if (!created || typeof created !== "object") return created;
  if (!paymentPayload || typeof paymentPayload !== "object") return created;

  const fromApi = created.payment && typeof created.payment === "object" ? created.payment : {};
  return {
    ...created,
    payment: {
      ...paymentPayload,
      ...fromApi,
      method: fromApi.method || paymentPayload.method,
      transactionId:
        fromApi.transactionId ||
        fromApi.txnId ||
        paymentPayload.transactionId ||
        paymentPayload.txnId,
      orderId: fromApi.orderId || paymentPayload.orderId,
    },
  };
}
