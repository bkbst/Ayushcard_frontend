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

/** Headline + colours for public /verify page — always matches getDisplayStatus. */
export function getPublicVerifyPresentation(card) {
  const statusLabel = getDisplayStatus(card);
  const isPositive = statusLabel === "Verified" || statusLabel === "Exported";

  let title;
  switch (statusLabel) {
    case "Verified":
      title = "This Ayush Card is Verified";
      break;
    case "Exported":
      title = "This Ayush Card is Verified & Issued";
      break;
    case "Not verified":
      title = "Ayush Card Application Received — Pending Verification";
      break;
    case "Rejected":
      title = "This Ayush Card Application was Rejected";
      break;
    case "Expired":
      title = "This Ayush Card has Expired";
      break;
    default:
      title = "This Ayush Card is NOT Verified";
  }

  return { statusLabel, title, isPositive };
}

/** @deprecated Use getPublicVerifyPresentation — kept for compatibility */
export function isPublicCardVerified(card) {
  const { isPositive } = getPublicVerifyPresentation(card);
  return isPositive;
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

export function resolveCreatedById(raw) {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return raw?._id || raw?.id || raw?.userId || "";
}

export function extractEmployeeFromResponse(res) {
  if (!res || typeof res !== "object") return null;
  const candidate =
    res?.data?.user ||
    res?.user ||
    res?.data?.data?.user ||
    res?.data?.data ||
    res?.data ||
    res;

  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    candidate.user &&
    (candidate.user._id || candidate.user.employeeId || candidate.user.name)
  ) {
    return candidate.user;
  }

  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    (candidate._id ||
      candidate.employeeId ||
      candidate.name ||
      candidate.email ||
      candidate.contact)
  ) {
    return candidate;
  }

  return null;
}

export function getEmployeeDisplayLabel(user, fallbackId = "") {
  const name =
    user?.name ||
    [user?.firstName, user?.middleName, user?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  return (
    name ||
    user?.employeeId ||
    user?.email ||
    user?.contact ||
    fallbackId ||
    "—"
  );
}

export function collectCreatedByIds(cards) {
  return Array.from(
    new Set(
      (cards || [])
        .map((c) => resolveCreatedById(c?.createdBy))
        .filter(Boolean),
    ),
  );
}

export async function fetchCreatedByLabels(ids, getEmployeeById, existingMap = {}) {
  const missing = (ids || []).filter((id) => !existingMap[id]);
  if (missing.length === 0) return { ...existingMap };

  const results = await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await getEmployeeById(String(id));
        const user = extractEmployeeFromResponse(res);
        return [id, getEmployeeDisplayLabel(user, String(id))];
      } catch {
        return [id, String(id)];
      }
    }),
  );

  const next = { ...existingMap };
  for (const [id, label] of results) next[id] = label;
  return next;
}

export function resolveCreatedByLabel(card, createdByMap = {}) {
  const raw = card?.createdBy;
  if (!raw) return "—";
  if (typeof raw === "object" && raw != null) {
    return getEmployeeDisplayLabel(raw, raw._id || "—");
  }
  const id = resolveCreatedById(raw);
  return createdByMap[id] || "—";
}
