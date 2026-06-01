import {
  resolveDocumentFrontFromCard,
  resolveProfileImageFromCard,
} from "./profileImage";

/**
 * Ayush Card status buckets for list sections:
 * - applications: pending / unverified (Ayush Card Applications)
 * - verified: approved, not yet printed (Verified Cards)
 * - exported: printed / exported (Exported Cards)
 */

export function getRawStatus(card) {
  return String(card?.status ?? "").trim().toLowerCase();
}

export function isPrintedCard(card) {
  const s = getRawStatus(card);
  if (s === "exported") return true;
  if (card?.isPrint === true || card?.isPrinted === true || card?.printed === true) {
    return true;
  }
  return false;
}

export function isVerifiedStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "approved" || s === "active" || s === "verified";
}

/** Which section this card belongs in */
export function getStatusBucket(card) {
  if (isPrintedCard(card)) return "exported";
  if (isVerifiedStatus(getRawStatus(card))) return "verified";
  return "applications";
}

export function isApplicationCard(card) {
  return getStatusBucket(card) === "applications";
}

export function isVerifiedCard(card) {
  return getStatusBucket(card) === "verified";
}

export function isExportedCard(card) {
  return getStatusBucket(card) === "exported";
}

export function getDisplayStatus(card) {
  if (isPrintedCard(card)) return "Exported";

  switch (getRawStatus(card)) {
    case "approved":
    case "active":
    case "verified":
      return "Verified";
    case "pending":
      return "Not verified";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "exported":
      return "Exported";
    default:
      return card?.status ? String(card.status) : "Not verified";
  }
}

/** Raw created timestamp from API (ISO string or parseable date). */
export function getCardCreatedAt(card) {
  const raw =
    card?.createdAt ??
    card?.created_at ??
    card?.applicationDate ??
    null;
  if (raw == null || raw === "") return null;
  return raw;
}

/** Display: `22 May 2026, 10:45 AM` */
export function formatCardCreatedAt(value) {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export function parseHealthCardsResponse(res) {
  const raw = Array.isArray(res?.data?.cards)
    ? res.data.cards
    : Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res)
        ? res
        : [];

  const pagination = res?.pagination || res?.data?.pagination || {};
  const total =
    pagination.total ??
    res?.total ??
    res?.count ??
    res?.data?.total ??
    raw.length;

  const pages =
    pagination.pages ??
    (pagination.limit ? Math.ceil(total / pagination.limit) : undefined);

  return { raw, pagination, total, pages };
}

export function normalizeHealthCard(card) {
  const totalCount = Number(card.totalMembers ?? card.totalMember) || 0;
  const location =
    card?.ngoLocation ||
    card?.location ||
    "";

  return {
    ...card,
    id: card.applicationId || card._id || "",
    applicant:
      [card.firstName, card.middleName, card.lastName].filter(Boolean).join(" ") ||
      "",
    phone: card.contact || "",
    address: card.address || "",
    pincode: card.pincode || "",
    location,
    totalMembers: totalCount,
    members: Array.isArray(card.members)
      ? card.members
      : Array.from({ length: totalCount }, (_, i) => ({ id: i })),
    profileImage: resolveProfileImageFromCard(card),
    documentFront: resolveDocumentFrontFromCard(card),
    documentBack:
      card.documentBack ||
      card.secondDocument ||
      (Array.isArray(card.documents)
        ? card.documents.find((d) => d.name === "documentBack" || d.name === "secondDocument" || d.name === "second_document")?.path
        : "") ||
      "",
    payment: {
      applicationFee: 160,
      memberAddOns: Math.max(0, totalCount - 4) * 40,
      totalPaid: totalCount <= 4 ? 160 : 160 + (totalCount - 4) * 40,
    },
    status: getDisplayStatus(card),
    statusBucket: getStatusBucket(card),
    rawStatus: getRawStatus(card),
    createdAt: getCardCreatedAt(card),
  };
}
