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
  if (!rec) return { label: "Cash / offline", ref: "Receipt on file" };

  const pay = rec.payment && typeof rec.payment === "object" ? rec.payment : {};
  const method = String(
    pay.method ?? rec.paymentMethod ?? rec.paymentMode ?? "",
  ).toLowerCase();

  const txn = String(
    pay.transactionId ??
    pay.txnId ??
    rec.transactionId ??
    rec.txnId ??
    "",
  ).trim();

  const docs = Array.isArray(rec.documents) ? rec.documents : [];
  const hasCashReceiptDoc = docs.some((d) =>
    String(d?.name || "").toLowerCase().includes("cashpayment"),
  );
  const hasOnlineOrder = Boolean(pay.orderId || rec.orderId);
  const txnIsCashMarker = /^CASH-/i.test(txn);

  const isExplicitCash =
    method === "cash" ||
    method === "offline" ||
    hasCashReceiptDoc ||
    txnIsCashMarker;

  const isOnline =
    !isExplicitCash &&
    (method === "online" ||
      method.includes("upi") ||
      method.includes("cashfree") ||
      method.includes("netbank") ||
      hasOnlineOrder ||
      Boolean(txn));

  if (isOnline) {
    return {
      label: txn ? "Online" : "UPI / Online",
      ref: txn || pay.orderId || rec.orderId || "—",
    };
  }

  return {
    label: "Cash / offline",
    ref: txnIsCashMarker && txn ? txn : "Receipt on file",
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

    const apiPay = raw.payment && typeof raw.payment === "object" ? raw.payment : {};
    const cachedPay =
      (card?._rawCard?.payment && typeof card._rawCard.payment === "object"
        ? card._rawCard.payment
        : null) ||
      (card?.payment && typeof card.payment === "object" ? card.payment : {});
    const payment = {
      ...cachedPay,
      ...apiPay,
      method: apiPay.method || cachedPay.method,
      transactionId:
        apiPay.transactionId ||
        apiPay.txnId ||
        cachedPay.transactionId ||
        cachedPay.txnId,
      orderId: apiPay.orderId || cachedPay.orderId,
    };

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
      payment,
      _rawCard: { ...raw, members, payment, documents: raw.documents || card?._rawCard?.documents },
    };
  } catch (err) {
    console.warn("[fetchFullReceiptCard] failed:", err);
    return card;
  }
}
