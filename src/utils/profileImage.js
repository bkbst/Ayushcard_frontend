const PROFILE_TYPES = new Set([
  "profile_photo",
  "profile",
  "profilephoto",
  "head_photo",
  "family_head_photo",
]);

const PROFILE_NAME_RE =
  /profile|family[\s_-]?head|head[\s_-]?photo|family_head_photo/i;

const NON_PROFILE_TYPE_RE =
  /aadhaar|document_?front|document_?back|supporting|payment/i;

const NON_PROFILE_NAME_RE =
  /aadhaar|documentfront|documentback|document_back|supporting|payment|receipt|cashpayment/i;

/** True if this document entry is the family head profile photo (not Aadhaar/KYC uploads). */
export function isProfileDocument(doc) {
  if (!doc) return false;

  const type = String(doc.type || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const name = String(
    doc.name || doc.filename || doc.originalName || "",
  ).toLowerCase();

  if (NON_PROFILE_TYPE_RE.test(type) || NON_PROFILE_NAME_RE.test(name)) {
    return false;
  }

  if (PROFILE_TYPES.has(type) || type.includes("profile")) return true;
  if (PROFILE_NAME_RE.test(name)) return true;

  return false;
}

export function findProfileDocument(documents) {
  if (!Array.isArray(documents)) return null;
  return documents.find(isProfileDocument) || null;
}

/**
 * Resolve family head photo URL/path for card preview & lists.
 * Never returns Aadhaar front/back or supporting document paths.
 */
export function resolveProfileImageFromCard(card) {
  if (!card) return "";

  const direct =
    card.profilePic || card.profileImage || card.profilePhoto || card.headImage || "";
  if (String(direct).trim()) return direct;

  const profileDoc = findProfileDocument(card.documents);
  if (profileDoc) return profileDoc.path || profileDoc.url || "";

  return "";
}

export function resolveDocumentFrontFromCard(card) {
  if (!card) return "";
  if (card.documentFront) return card.documentFront;

  const docs = Array.isArray(card.documents) ? card.documents : [];
  const match = docs.find((doc) => {
    const type = String(doc.type || "").toLowerCase();
    const name = String(doc.name || "").toLowerCase();
    return (
      type === "aadhaar_front" ||
      name === "documentfront" ||
      name === "document_front"
    );
  });

  return match?.path || match?.url || "";
}
