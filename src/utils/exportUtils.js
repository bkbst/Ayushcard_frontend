import * as XLSX from "xlsx";
import { formatCardCreatedAt } from "./healthCardUtils";

export const exportToCSV = (data, filename) => {
  if (!data || !data.length) {
    console.warn("No data available to export.");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [];

  csvRows.push(headers.join(","));

  for (const row of data) {
    const values = headers.map((header) => {
      let val = row[header] === null || row[header] === undefined ? "" : row[header];
      val = val.toString().replace(/"/g, '""');
      if (val.search(/("|,|\n)/g) >= 0) {
        val = `"${val}"`;
      }
      return val;
    });
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

function cellValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}

export const exportToExcel = (data, filename, sheetName = "Sheet1") => {
  if (!data || !data.length) {
    console.warn("No data available to export.");
    return;
  }

  const rows = data.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = cellValue(v);
    }
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  const safeSheet = String(sheetName || "Sheet1")
    .slice(0, 31)
    .replace(/[:\\/?*[\]]/g, "_") || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);

  let baseName = (filename || "export").trim();
  baseName = baseName.replace(/\.(csv|xlsx|xls)$/i, "");
  const name = `${baseName}.xlsx`;

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

function safeStr(v) {
  if (v == null || v === undefined) return "";
  return String(v);
}

function membersSummary(members) {
  if (!Array.isArray(members) || members.length === 0) return "";
  return members
    .map((m, i) => {
      const n = m?.name || m?.fullName || "";
      const rel = m?.relation || "";
      const age = m?.age ?? "";
      const doc = m?.documentId || m?.documentNumber || "";
      const parts = [n, rel, age !== "" ? `age ${age}` : "", doc ? `doc ${doc}` : ""].filter(Boolean);
      return `${i + 1}. ${parts.join(", ")}`;
    })
    .join(" | ");
}

export function flattenAyushCardApplicationForExcel(r) {
  if (!r || typeof r !== "object") return {};
  const pay = typeof r.payment === "object" && r.payment ? r.payment : {};
  const total =
    r.totalMembers ??
    r.totalMember ??
    (Array.isArray(r.members) ? r.members.length : "") ??
    "";

  return {
    "Application ID": safeStr(r.applicationId || r.id || r._id),
    "First name": safeStr(r.firstName),
    "Middle name": safeStr(r.middleName),
    "Last name": safeStr(r.lastName),
    "Applicant (full name)": safeStr(r.applicant),
    Email: safeStr(r.email || r.emailAddress),
    Phone: safeStr(r.phone || r.contact),
    "Alternate contact": safeStr(r.alternateContact),
    Gender: safeStr(r.gender),
    DOB: safeStr(r.dob),
    Religion: safeStr(r.religion),
    Relation: safeStr(r.relation),
    "Related person": safeStr(r.relatedPerson),
    Address: safeStr(r.address),
    Pincode: safeStr(r.pincode),
    "Aadhaar (family head)": safeStr(r.aadhaarNumber),
    "Members count": total,
    "Family members": membersSummary(r.members),
    "Total amount (INR)":
      r.totalAmount ?? pay.totalAmount ?? pay.amount ?? pay.totalPaid ?? r.payment?.totalPaid ?? "",
    "Card number": safeStr(r.cardNo),
    "Application date": safeStr(r.applicationDate),
    "Created at": safeStr(
      formatCardCreatedAt(r.createdAt ?? r.created_at ?? r.applicationDate),
    ),
    "Card issue date": safeStr(r.cardIssueDate),
    "Card expiry": safeStr(r.cardExpiredDate || r.cardExpiryDate),
    "Verification date": safeStr(r.verificationDate),
    Status: safeStr(r.status),
    "Payment method": safeStr(pay.method),
    "Transaction ID": safeStr(pay.transactionId),
    "Order ID": safeStr(pay.orderId),
  };
}

export function exportAyushCardApplicationsToExcel(records) {
  if (!records || !records.length) {
    console.warn("No data available to export.");
    return;
  }
  const rows = records.map(flattenAyushCardApplicationForExcel);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  exportToExcel(rows, `AyushCard_Application_Details_${stamp}.xlsx`, "Applications");
}
