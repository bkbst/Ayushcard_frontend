import apiService from "../../../../api/service";

export function formatReceiptAddress(rec) {
  if (!rec) return "—";
  const clean = (s) => String(s || "").trim();
  const street = clean(rec.address);
  const city = clean(rec.city);
  const district = clean(rec.district);
  const state = clean(rec.state);

  const parts = [];
  if (street) parts.push(street);
  const locality = [city, district, state].filter(Boolean).join(", ");
  if (locality && !street.toLowerCase().includes(locality.toLowerCase().slice(0, Math.min(5, locality.length)))) {
    parts.push(locality);
  }

  let line = parts.join(", ") || street || "—";
  line = line.replace(/[:\s]*\d{10,}/g, "").replace(/\s{2,}/g, " ").trim();
  if (line.length > 80) line = `${line.slice(0, 80)}…`;
  return line || "—";
}

export function getPaymentDisplay(rec) {
  const method = String(rec?.payment?.method || rec?.paymentMethod || "").toLowerCase();
  const txn = rec?.payment?.transactionId || rec?.payment?.txnId || rec?.txnId || "";
  const isOnline = method.includes("online") || method.includes("upi") || Boolean(txn && method !== "cash");
  return {
    label: isOnline ? (txn ? "Online (verified)" : "UPI / Online") : "Cash / offline",
    ref: txn || "Receipt on file",
  };
}

export async function fetchFullReceiptCard(card) {
  const lookupId = card?._rawCard?._id || card?._mongoId || card?.id;
  if (!lookupId) return card;

  try {
    let res;
    try {
      res = await apiService.getHealthCardById(String(lookupId));
    } catch (err) {
      if (err?.response?.status === 404) {
        res = await apiService.getHealthCardByCardNo(String(lookupId));
      } else {
        throw err;
      }
    }

    const raw = res?.data?.card || res?.data?.data || res?.data || res;
    const mongoId = raw?._id || lookupId;

    let members = Array.isArray(raw?.members) ? raw.members : [];
    try {
      const mRes = await apiService.getCardMembers(String(mongoId));
      const mRaw = Array.isArray(mRes?.data)
        ? mRes.data
        : Array.isArray(mRes?.data?.members)
          ? mRes.data.members
          : Array.isArray(mRes)
            ? mRes
            : [];
      if (mRaw.length > 0) members = mRaw;
    } catch {
      /* members optional */
    }

    const clientName = [raw.firstName, raw.middleName, raw.lastName].filter(Boolean).join(" ")
      || card.clientName;

    return {
      ...card,
      clientName,
      mobile: raw.contact || card.mobile,
      address: raw.address || card.address,
      pincode: raw.pincode || card.pincode,
      amount: Number(
        raw.payment?.totalAmount
        ?? raw.payment?.totalPaid
        ?? raw.totalAmount
        ?? card.amount
        ?? 0,
      ),
      _rawCard: { ...raw, members },
    };
  } catch (err) {
    console.warn("[fetchFullReceiptCard] failed:", err);
    return card;
  }
}
