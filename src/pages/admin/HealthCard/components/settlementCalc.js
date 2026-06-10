export const SETTLEMENT_TIERS = [160, 200, 240, 280];

export function normalizeSettlementRecord(record) {
  if (!record || typeof record !== "object") return null;
  return {
    employeeId: record.employeeId,
    employeeCode: record.employeeCode,
    name: record.name,
    email: record.email,
    date: record.date,
    dayCards: Number(record.dayCards) || 0,
    onlineCards: Number(record.onlineCards) || 0,
    offlineCards: Number(record.offlineCards) || 0,
    onlineAmount: Number(record.onlineAmount) || 0,
    offlineAmount: Number(record.offlineAmount) || 0,
    totalCollected: Number(record.totalCollected) || 0,
    amount: Number(record.amount) || 0,
    status: record.status === "done" ? "done" : "pending",
    cards: Array.isArray(record.cards) ? record.cards : null,
  };
}

function isOnlineCard(card) {
  return String(card?.collectionType ?? "").toLowerCase() === "online";
}

function emptyTierRows() {
  return {
    off160: 0,
    off200: 0,
    off240: 0,
    off280: 0,
    on160: 0,
    on200: 0,
    on240: 0,
    on280: 0,
    amt160: 0,
    amt200: 0,
    amt240: 0,
    amt280: 0,
    onAmt160: 0,
    onAmt200: 0,
    onAmt240: 0,
    onAmt280: 0,
    penaltyCount: 0,
    penaltyAmount: 0,
    onPenaltyCount: 0,
    onPenaltyAmount: 0,
  };
}

/**
 * Build receipt display from GET /api/employees/settlements row.
 * Returns null when cards[] is missing or empty — caller shows "No data".
 */
export function settlementDisplayFromApi(settlement) {
  const normalized = normalizeSettlementRecord(settlement);
  if (!normalized?.cards?.length) return null;

  const tiers = emptyTierRows();

  normalized.cards.forEach((card) => {
    const amount = Number(card?.amount) || 0;
    if (!SETTLEMENT_TIERS.includes(amount)) return;
    const online = isOnlineCard(card);
    if (online) {
      tiers[`on${amount}`] += 1;
      tiers[`onAmt${amount}`] += amount;
    } else {
      tiers[`off${amount}`] += 1;
      tiers[`amt${amount}`] += amount;
    }
  });

  return {
    ...tiers,
    totalCards: normalized.dayCards,
    offlineCount: normalized.offlineCards,
    onlineCount: normalized.onlineCards,
    offlineBaseTotal: normalized.offlineAmount,
    onlineBaseTotal: normalized.onlineAmount,
    offlineTotalWithPenalty: normalized.offlineAmount,
    onlineTotalWithPenalty: normalized.onlineAmount,
    grandTotal: normalized.totalCollected,
    settlementAmount: normalized.amount,
    status: normalized.status,
  };
}

/** Only tiers / penalty rows that have data from the API. */
export function getSettlementReceiptRows(calc) {
  if (!calc) return [];

  const rows = SETTLEMENT_TIERS.flatMap((tier) => {
    const off = Number(calc[`off${tier}`]) || 0;
    const on = Number(calc[`on${tier}`]) || 0;
    const amt = Number(calc[`amt${tier}`]) || 0;
    const onAmt = Number(calc[`onAmt${tier}`]) || 0;
    if (off <= 0 && on <= 0 && amt <= 0 && onAmt <= 0) return [];
    return [{ type: "tier", tier, off, on, amt, onAmt }];
  });

  const penaltyCount = Number(calc.penaltyCount) || 0;
  const onPenaltyCount = Number(calc.onPenaltyCount) || 0;
  const penaltyAmount = Number(calc.penaltyAmount) || 0;
  const onPenaltyAmount = Number(calc.onPenaltyAmount) || 0;
  if (penaltyCount > 0 || onPenaltyCount > 0 || penaltyAmount > 0 || onPenaltyAmount > 0) {
    rows.push({ type: "penalty", penaltyCount, onPenaltyCount, penaltyAmount, onPenaltyAmount });
  }

  return rows;
}

export function formatGrandTotalLabel(calc) {
  if (!calc) return "";
  const parts = [];
  if (Number(calc.offlineBaseTotal) > 0) parts.push(calc.offlineBaseTotal);
  if (Number(calc.onlineBaseTotal) > 0) parts.push(calc.onlineBaseTotal);
  const penalty = (Number(calc.penaltyAmount) || 0) + (Number(calc.onPenaltyAmount) || 0);
  if (penalty > 0) parts.push(penalty);
  if (!parts.length) return `₹${calc.grandTotal}`;
  return `${parts.join(" + ")} = ₹${calc.grandTotal}`;
}

const SPACED_EQ = "\u00A0\u00A0=\u00A0\u00A0";

export function formatOnlineAmount(on, onAmt, decimals = 0) {
  return `${on}${SPACED_EQ}${Number(onAmt).toFixed(decimals)}`;
}

export function formatTierOfflineLine(tier, off, amt, decimals = 2) {
  return `${tier} x ${off}${SPACED_EQ}${Number(amt).toFixed(decimals)}`;
}

export function formatPenaltyOfflineLine(count, amount, decimals = 2) {
  return `Penalty x ${count}${SPACED_EQ}${Number(amount).toFixed(decimals)}`;
}

export function formatOfflineTotalPlain(count, amount, decimals = 2) {
  return `Total = ${count} = ${Number(amount).toFixed(decimals)}`;
}

export function formatOnlineTotalPlain(count, amount, decimals = 2) {
  return `${count} = ${Number(amount).toFixed(decimals)}`;
}

function buildSettlementBodyRowsHtml(calc, decimals = 2) {
  return getSettlementReceiptRows(calc)
    .map((row) => {
      if (row.type === "tier") {
        return `<tr class="amount-row"><td class="col-offline">${formatTierOfflineLine(row.tier, row.off, row.amt, decimals)}</td><td class="col-online">${formatOnlineAmount(row.on, row.onAmt, 0)}</td></tr>`;
      }
      return `<tr class="amount-row"><td class="col-offline">${formatPenaltyOfflineLine(row.penaltyCount, row.penaltyAmount, decimals)}</td><td class="col-online">${formatOnlineAmount(row.onPenaltyCount, row.onPenaltyAmount, 0)}</td></tr>`;
    })
    .join("");
}

export function buildSettlementAmountTableHtml(calc, decimals = 2) {
  if (!calc) return "";
  const totalDecimals = decimals === 0 ? 0 : 2;
  return `
<table class="amount-table">
  <colgroup>
    <col class="col-offline" />
    <col class="col-online" />
  </colgroup>
  <thead>
    <tr>
      <th class="col-offline">Card Detail - Amount</th>
      <th class="col-online">Online - Amount</th>
    </tr>
  </thead>
  <tbody>
    ${buildSettlementBodyRowsHtml(calc, decimals)}
  </tbody>
  <tfoot>
    <tr class="amount-total">
      <td class="col-offline">${formatOfflineTotalPlain(calc.offlineCount, calc.offlineTotalWithPenalty, totalDecimals)}</td>
      <td class="col-online">${formatOnlineTotalPlain(calc.onlineCount, calc.onlineTotalWithPenalty, totalDecimals)}</td>
    </tr>
  </tfoot>
</table>`;
}

/** @deprecated use buildSettlementAmountTableHtml */
export function buildSettlementRowsHtml(calc, decimals = 2) {
  return buildSettlementBodyRowsHtml(calc, decimals);
}

export const SETTLEMENT_AMOUNT_TABLE_CSS = `
  .amount-table{width:100%;table-layout:fixed;border-collapse:collapse;font-weight:bold}
  .amount-table .col-offline{width:52%;text-align:left;vertical-align:top;padding:3px 8px 3px 0}
  .amount-table .col-online{width:48%;text-align:left;vertical-align:top;padding:3px 0 3px 8px;white-space:nowrap;font-variant-numeric:tabular-nums}
  .amount-table thead th{border-bottom:1px solid black;font-family:sans-serif;text-transform:uppercase;font-size:9.5px;padding-bottom:3px}
  .amount-table tbody .amount-row td{border-bottom:1px dashed #e5e5e5;padding-top:4px;padding-bottom:4px}
  .amount-table tfoot .amount-total td{border-top:1px solid black;padding-top:5px;font-size:10.5px}
`;
