/** Printed Card ID + QR payload — cardNo is authoritative when present. */
export function getCardVerifyId(card = {}) {
  return String(
    card.cardNo ||
      card.cardNumber ||
      card.applicationId ||
      card.id ||
      card._id ||
      "",
  ).trim();
}

export function getCardDisplayId(card = {}) {
  return getCardVerifyId(card) || "—";
}

/** Route param for /verify/:id — mongo _id is authoritative for getCardById lookup. */
export function getCardRouteId(card = {}) {
  return String(card._id || card.id || getCardVerifyId(card) || "").trim();
}

export function buildCardVerifyUrl(card = {}) {
  const id = getCardVerifyId(card);
  if (!id) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/verify/${encodeURIComponent(id)}`;
}

export function isValidCardRecord(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return false;
  return !!(
    card._id ||
    card.cardNo ||
    card.cardNumber ||
    card.applicationId ||
    card.firstName ||
    card.contact
  );
}

function unwrapCardPayload(data) {
  if (!data) return null;

  if (Array.isArray(data?.data?.cards)) {
    return data.data.cards[0] || null;
  }
  if (Array.isArray(data?.cards)) {
    return data.cards[0] || null;
  }
  if (Array.isArray(data?.data)) {
    return data.data[0] || null;
  }

  const candidate =
    data?.data?.card || data?.data || data?.card || data;

  if (Array.isArray(candidate)) {
    return candidate[0] || null;
  }
  return candidate;
}

function unwrapCardList(data) {
  if (!data) return [];
  if (Array.isArray(data?.data?.cards)) return data.data.cards;
  if (Array.isArray(data?.cards)) return data.cards;
  if (Array.isArray(data?.data)) return data.data;
  const single = unwrapCardPayload(data);
  return single ? [single] : [];
}

export function cardMatchesVerifyParam(card, param) {
  if (!card || param == null || param === "") return false;
  const p = String(param).trim().toLowerCase();
  return [
    card.cardNo,
    card.cardNumber,
    card.applicationId,
    card.id,
    card._id,
  ]
    .filter(Boolean)
    .some((v) => String(v).trim().toLowerCase() === p);
}

/**
 * Fetch card for public /verify/:id page.
 * Direct lookup endpoints are trusted; list endpoints prefer an ID match.
 */
export async function fetchPublicCardByVerifyId(apiClient, verifyId) {
  const param = decodeURIComponent(String(verifyId || "").trim());
  if (!param) return null;

  const tryDirect = async (url) => {
    try {
      const res = await apiClient.get(url);
      const card = unwrapCardPayload(res.data);
      return isValidCardRecord(card) ? card : null;
    } catch {
      return null;
    }
  };

  // Dedicated lookups — backend already resolved the param.
  // When the param is a mongo ObjectId, fetch by id (getCardById) first.
  const isObjectId = /^[a-f0-9]{24}$/i.test(param);
  const directCard = isObjectId
    ? (await tryDirect(`/api/cards/${encodeURIComponent(param)}`)) ||
      (await tryDirect(`/api/cards/card/${encodeURIComponent(param)}`))
    : (await tryDirect(`/api/cards/card/${encodeURIComponent(param)}`)) ||
      (await tryDirect(`/api/cards/${encodeURIComponent(param)}`));

  if (directCard) return directCard;

  // Query-based fallbacks (old QR codes may use applicationId or cardNo)
  const queryAttempts = [
    { cardNo: param },
    { applicationId: param },
    { id: param },
  ];

  for (const params of queryAttempts) {
    try {
      const res = await apiClient.get("/api/cards", { params });
      const list = unwrapCardList(res.data).filter(isValidCardRecord);
      if (!list.length) continue;

      const match = list.find((c) => cardMatchesVerifyParam(c, param));
      if (match) return match;

      // Single-result list from filtered query is trustworthy
      if (list.length === 1) return list[0];
    } catch {
      // try next
    }
  }

  return null;
}
