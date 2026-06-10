import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Printer, FileText, X, RefreshCw,
} from "lucide-react";
import apiService from "../../../api/service";
import { useToast } from "../../../components/ui/Toast";
import Pagination from "../../../components/ui/Pagination";
import ThemedDatePicker from "../../../components/ui/ThemedDatePicker";
import { LOGO_BASE64 } from "../../../utils/logoBase64";
import SettlementSlipPreview from "./components/SettlementSlipPreview";
import {
  getTodayISO,
  formatISOToDisplay,
} from "./components/vitranUtils";
import {
  buildSettlementAmountTableHtml,
  formatGrandTotalLabel,
  normalizeSettlementRecord,
  SETTLEMENT_AMOUNT_TABLE_CSS,
  settlementDisplayFromApi,
} from "./components/settlementCalc";
import {
  getStoredUser,
  getStoredUserRole,
  normalizeRole,
  updateStoredUser,
} from "../../../utils/auth";

function unwrapSettlementsResponse(res) {
  if (!res) return { list: [], pagination: {} };

  const blocks = [res, res.data, res.data?.data, res.result, res.payload].filter(
    (b) => b && typeof b === "object",
  );

  for (const block of blocks) {
    if (Array.isArray(block.settlements)) {
      return { list: block.settlements, pagination: block.pagination || {} };
    }
    if (Array.isArray(block)) {
      return { list: block, pagination: {} };
    }
    if (block.employeeId && (block.employeeCode || block.dayCards != null)) {
      return { list: [block], pagination: {} };
    }
  }

  return { list: [], pagination: {} };
}

function settlementMatchesEmployee(settlement, employee) {
  if (!settlement || !employee) return false;
  const empMongo = String(
    employee._rawId || employee._mongoId || employee._settlementEmployeeId || "",
  ).toLowerCase();
  const empCode = String(employee.id || "").toLowerCase();
  const sId = String(settlement.employeeId || "").toLowerCase();
  const sCode = String(settlement.employeeCode || "").toLowerCase();
  return (empMongo && sId === empMongo) || (empCode && (sCode === empCode || sId === empCode));
}

function resolveSettlementRecord(employee) {
  if (!employee) return null;
  const embedded = employee._settlementRecord;
  if (embedded?.employeeId || embedded?.employeeCode || embedded?.dayCards != null) {
    return normalizeSettlementRecord(embedded);
  }
  return null;
}

/** Fetch one employee's settlement row for a date from GET /api/employees/settlements. */
async function fetchEmployeeSettlement(employee, dateISO) {
  if (!employee || !dateISO) return null;

  const embedded = resolveSettlementRecord(employee);
  if (embedded) return embedded;

  try {
    let page = 1;
    let totalPages = 1;

    do {
      const res = await apiService.getEmployeeSettlements({
        date: dateISO,
        page,
        limit: 100,
      });
      const { list, pagination } = unwrapSettlementsResponse(res);
      totalPages = Number(pagination.pages ?? 1);

      const match = list.find((s) => settlementMatchesEmployee(s, employee));
      if (match) return normalizeSettlementRecord(match);

      page += 1;
    } while (page <= totalPages);
  } catch (err) {
    console.warn("[SettlementCard] Failed to load employee settlement:", err);
  }
  return null;
}

/** Per-day settlement records keyed by employeeCode / employee _id. */
async function fetchSettlementMap(dateISO) {
  const map = {};
  try {
    let page = 1;
    let totalPages = 1;

    do {
      const res = await apiService.getEmployeeSettlements({
        date: dateISO,
        page,
        limit: 100,
      });
      const { list, pagination } = unwrapSettlementsResponse(res);
      totalPages = Number(pagination.pages ?? 1);

      list.forEach((s) => {
        const entry = normalizeSettlementRecord(s);
        if (!entry) return;
        if (s.employeeCode) map[String(s.employeeCode).toLowerCase()] = entry;
        if (s.employeeId) map[String(s.employeeId).toLowerCase()] = entry;
        if (s.email) map[String(s.email).toLowerCase()] = entry;
        if (s.name) map[String(s.name).toLowerCase()] = entry;
      });
      page += 1;
    } while (page <= totalPages);
  } catch (err) {
    console.warn("[SettlementCard] Failed to load settlement map:", err);
  }
  return map;
}

const SettlementStatusBadge = ({ status }) => {
  const isDone = status === "done";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        isDone ? "bg-[#76DB1E33] text-[#76DB1E]" : "bg-[#FFA10033] text-[#FFA100]"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isDone ? "bg-[#76DB1E]" : "bg-[#FFA100]"}`} />
      {isDone ? "Done" : "Pending"}
    </span>
  );
};

const SettlementCard = () => {
  const { toastSuccess, toastError, toastWarn } = useToast();

  const [userRole, setUserRole] = useState("Admin");
  const [currentUser, setCurrentUser] = useState({ name: "Officer", email: "officer@bkbs.org", id: "EMP-1000", _mongoId: "" });

  const [selectedDate, setSelectedDate] = useState(getTodayISO);
  const selectedDateDisplay = useMemo(() => formatISOToDisplay(selectedDate), [selectedDate]);

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empSearch, setEmpSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [employeeCardCount, setEmployeeCardCount] = useState(0);
  const [employeeLocation, setEmployeeLocation] = useState("Mangla Vihar");
  const [employeePincode, setEmployeePincode] = useState("208015");
  const [selfLoading, setSelfLoading] = useState(false);
  const [settlementCalc, setSettlementCalc] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    const applyUser = (u) => {
      if (!u) return;
      setCurrentUser({
        name: u.name || "Employee",
        email: u.email || "N/A",
        id: u.employeeId || u._id || "EMP-1000",
        _mongoId: u._id || "",
        location: u.location || "Mangla Vihar",
      });
    };

    applyUser(getStoredUser());
    setUserRole(getStoredUserRole() || "Admin");

    let cancelled = false;
    const refreshProfile = async () => {
      try {
        const data = await apiService.getProfile();
        const profile = data?.data?.user || data?.data || data?.user;
        if (cancelled || !profile) return;
        applyUser(updateStoredUser(profile));
        if (profile.role) setUserRole(normalizeRole(profile.role));
      } catch {
        // keep stored user
      }
    };

    refreshProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userRole !== "Employee" || !currentUser?.id) return;

    const fetchSelfDailyData = async () => {
      setSelfLoading(true);
      try {
        const mongoId = currentUser._mongoId || currentUser.id;
        const res = await apiService.getEmployeeById(String(mongoId));
        const u = res?.data?.user || res?.user || res?.data?.data || res?.data || res;
        if (u) {
          setEmployeeLocation(u.location || "Mangla Vihar");
          setEmployeePincode(u.pincode || "208015");
        }

        const settlement = await fetchEmployeeSettlement(
          {
            id: currentUser.id,
            _rawId: u?._id || currentUser._mongoId || mongoId,
            _settlementEmployeeId: u?._id || currentUser._mongoId,
          },
          selectedDate,
        );
        setEmployeeCardCount(settlement?.dayCards ?? 0);
      } catch (err) {
        console.warn("Failed to fetch self daily settlement:", err);
        setEmployeeCardCount(0);
      } finally {
        setSelfLoading(false);
      }
    };

    fetchSelfDailyData();
  }, [userRole, currentUser, selectedDate]);

  const fetchEmployeesList = useCallback(async () => {
    setLoading(true);
    try {
      const [res, settlementMap] = await Promise.all([
        apiService.getEmployees({ page: currentPage, limit: itemsPerPage }),
        fetchSettlementMap(selectedDate),
      ]);

      const rawData = res.data || res;
      let list = Array.isArray(rawData) ? rawData : [];
      if (!list.length && rawData?.data && Array.isArray(rawData.data)) list = rawData.data;
      if (!list.length && rawData?.users && Array.isArray(rawData.users)) list = rawData.users;
      if (!list.length && rawData?.employees && Array.isArray(rawData.employees)) list = rawData.employees;

      const mapped = (list || []).map((u, i) => {
        const rawId = u._id ? u._id.toString().toLowerCase() : "";
        const empId = u.employeeId ? u.employeeId.toString().toLowerCase() : "";
        const userName = u.name ? u.name.toString().toLowerCase() : "";
        const userEmail = u.email ? u.email.toString().toLowerCase() : "";
        const settlement =
          settlementMap[empId] ||
          settlementMap[rawId] ||
          settlementMap[userEmail] ||
          settlementMap[userName] ||
          null;
        const totalCards = settlement?.dayCards ?? 0;

        return {
          id: u.employeeId || u._id || `EMP-${2000 + i}`,
          name: u.name || "Unknown Staff",
          email: u.email || "N/A",
          date: selectedDateDisplay,
          location: u.location || "Mangla Vihar",
          totalCards,
          pincode: u.pincode || "208015",
          status: settlement?.status || "pending",
          settlementAmount: settlement?.totalCollected || settlement?.amount || 0,
          _settlementEmployeeId: settlement?.employeeId || u._id || null,
          _settlementRecord: settlement,
          _rawId: u._id ? String(u._id) : "",
        };
      });

      setEmployees(mapped);
      setTotalItems(mapped.length);
      setTotalPages(Math.ceil(mapped.length / itemsPerPage) || 1);
    } catch (err) {
      console.warn("[SettlementCard] Failed to load employees:", err);
      setEmployees([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, selectedDate, selectedDateDisplay]);

  const loadSettlementForEmployee = useCallback(async (employee, options = {}) => {
    if (!employee) {
      setSettlementCalc(null);
      return null;
    }

    const { silent = false } = options;
    if (!silent) setCalcLoading(true);

    try {
      const settlement = await fetchEmployeeSettlement(employee, selectedDate);
      const display = settlement ? settlementDisplayFromApi(settlement) : null;
      setSettlementCalc(display);
      return display;
    } catch (err) {
      console.warn("[SettlementCard] settlement load failed:", err);
      setSettlementCalc(null);
      return null;
    } finally {
      if (!silent) setCalcLoading(false);
    }
  }, [selectedDate]);

  const handleOpenSettlement = useCallback(
    async (row) => {
      setSelectedEmployee(row);
      setCalcLoading(true);
      try {
        const settlement = await fetchEmployeeSettlement(row, selectedDate);
        if (settlement) {
          setSelectedEmployee({
            ...row,
            _settlementRecord: settlement,
            totalCards: settlement.dayCards ?? row.totalCards,
            status: settlement.status ?? row.status,
            _settlementEmployeeId: settlement.employeeId ?? row._settlementEmployeeId,
          });
        }
        setSettlementCalc(settlement ? settlementDisplayFromApi(settlement) : null);
      } finally {
        setCalcLoading(false);
      }
    },
    [selectedDate],
  );


  useEffect(() => {
    if (userRole !== "Employee") fetchEmployeesList();
  }, [currentPage, itemsPerPage, userRole, selectedDate, fetchEmployeesList]);

  const handlePrintSlip = (employee, calc = settlementCalc) => {
    if (!employee) return;
    if (!calc) {
      toastWarn("No settlement data to print.");
      return;
    }
    const slipCalc = calc;
    const amountTableHtml = buildSettlementAmountTableHtml(slipCalc, 2);
    const grandTotalLabel = formatGrandTotalLabel(slipCalc);
    const dateStr = employee.date || selectedDateDisplay;
    const pw = window.open("", "_blank", "width=380,height=750,status=no,toolbar=no,menubar=no");
    if (!pw) { toastError("Pop-up blocked! Allow pop-ups for this site."); return; }
    pw.document.open();
    pw.document.write(`
<html><head><title>Settlement - ${employee.name}</title>
<style>
  @page{margin:0}body{font-family:monospace;color:black;background:white;padding:20px;margin:0;font-size:11px;line-height:1.4}
  .container{width:80mm;max-width:100%;margin:0 auto;box-sizing:border-box}
  .logo-circle{width:80px;height:80px;border-radius:50%;border:1px solid black;display:flex;align-items:center;justify-content:center;margin:0 auto 10px auto;background:white;padding:5px;box-sizing:border-box}
  .logo-circle img{height:50px;width:auto;object-fit:contain}
  .title{font-size:14px;font-weight:bold;text-align:center;text-transform:uppercase;margin-top:5px;font-family:sans-serif;letter-spacing:2px}
  .header-address{font-family:sans-serif;text-align:center;margin-bottom:15px;border-bottom:1px dashed black;padding-bottom:8px}
  .trust-name{font-size:11px;font-weight:bold;text-transform:uppercase;margin:0}
  .address-line{font-size:9px;font-weight:bold;margin:2px 0 0 0}
  .metadata{margin-bottom:15px;font-weight:bold}
  .metadata-row{display:flex;justify-content:space-between;margin-bottom:3.5px}
  .metadata-double{display:flex;justify-content:space-between;margin-top:3.5px}
  .dashed-border-top-bottom{border-top:1px dashed black;border-bottom:1px dashed black;padding:5px 0;margin:12px 0;text-align:center;font-size:11.5px;font-weight:bold;font-family:sans-serif}
  .dashed-divider{border-top:1px dashed black;margin:5px 0}
  ${SETTLEMENT_AMOUNT_TABLE_CSS}
  .grand-total-box{background:#f9f9f9;border:1px solid black;padding:6px;text-align:center;font-family:sans-serif;margin:15px 0}
  .grand-total-title{font-size:8.5px;color:#555;text-transform:uppercase;font-weight:bold;letter-spacing:0.5px}
  .grand-total-value{font-size:10px;font-weight:bold;margin-top:2px}
  .grand-total-highlight{font-size:13px;font-weight:900}
  .signatures{margin-top:25px;font-weight:bold}
  .signatures div{margin-bottom:12px}
  .sig-box-container{margin-top:30px;margin-bottom:10px}
  .sig-box{border:1px solid black;border-radius:2px;height:50px;display:flex;align-items:center;justify-content:center}
  .sig-text{font-family:sans-serif;color:#ccc;font-weight:bold;text-transform:uppercase;font-size:10px;letter-spacing:2px}
</style></head><body>
<div class="container">
  <div class="logo-circle"><img src="${LOGO_BASE64}" alt="Logo"/></div>
  <div class="title">Settlement</div>
  <div class="header-address">
    <div class="trust-name">Baijnaath Kesar Bai Sewa Trust</div>
    <div class="address-line">1-A Mangla Vihar New PAC Line</div>
    <div class="address-line">Kanpur Nagar – 208015</div>
  </div>
  <div class="metadata">
    <div class="metadata-row"><span>Date :-</span><span>${dateStr}</span></div>
    <div class="metadata-row"><span>Camp Area :-</span><span>${employee.location || "Mangla Vihar"}</span></div>
    <div class="metadata-row"><span>Ayush Mitra Name :-</span><span>${employee.name}</span></div>
    <div class="metadata-row"><span>Ayush Mitra ID No :-</span><span>${employee.id}</span></div>
    <div class="metadata-double"><span>District :- Kanpur Nagar</span><span>Pin Code :- ${employee.pincode || "208015"}</span></div>
    <div class="dashed-divider" style="margin-top:6px"></div>
    <div style="margin-top:5px">Total Apply Ayush Card - ${slipCalc.totalCards ?? employee.totalCards}</div>
  </div>
  <div class="dashed-border-top-bottom uppercase">Apply Ayush Card</div>
  ${amountTableHtml}
  <div class="grand-total-box">
    <div class="grand-total-title">Calculated Revenue Equation</div>
    <div class="grand-total-value">Grand Total = ${grandTotalLabel}</div>
  </div>
  <div class="signatures"><div>Cash Receiver Name : __________________</div><div>Cash Receiver ID No :- __________________</div></div>
  <div class="sig-box-container"><div class="sig-box"><span class="sig-text">Signature</span></div></div>
</div>
<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script>
</body></html>`);
    pw.document.close();
    toastSuccess("Settlement slip sent to printer!");
  };

  const handleRawBtPrintSlip = (employee, calc = settlementCalc) => {
    if (!employee) return;
    if (!calc) {
      toastWarn("No settlement data to print.");
      return;
    }
    const slipCalc = calc;
    const amountTableHtml = buildSettlementAmountTableHtml(slipCalc, 0);
    const grandTotalLabel = formatGrandTotalLabel(slipCalc);
    const dateStr = employee.date || selectedDateDisplay;
    const htmlContent = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: monospace; color: black; background: white; margin: 0; padding: 0; }
  .container { width: 58mm; box-sizing: border-box; padding: 2mm; font-size: 8px; line-height: 1.3; }
  .logo-circle { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid black; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto; background: white; padding: 3px; box-sizing: border-box; }
  .logo-circle img { height: 30px; width: auto; object-fit: contain; }
  .title { font-size: 10px; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4px; font-family: sans-serif; letter-spacing: 1px; }
  .header-address { font-family: sans-serif; text-align: center; margin-bottom: 8px; border-bottom: 1px dashed black; padding-bottom: 4px; }
  .trust-name { font-size: 8px; font-weight: bold; text-transform: uppercase; margin: 0; }
  .address-line { font-size: 7px; font-weight: bold; margin: 1px 0 0 0; }
  .metadata { margin-bottom: 8px; font-weight: bold; }
  .metadata-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
  .metadata-double { display: flex; justify-content: space-between; margin-top: 2px; }
  .dashed-border-top-bottom { border-top: 1px dashed black; border-bottom: 1px dashed black; padding: 4px 0; margin: 8px 0; text-align: center; font-size: 8.5px; font-weight: bold; font-family: sans-serif; }
  .dashed-divider { border-top: 1px dashed black; margin: 4px 0; }
  ${SETTLEMENT_AMOUNT_TABLE_CSS}
  .amount-table thead th { font-size: 7.5px; }
  .amount-table tfoot .amount-total td { font-size: 8px; }
  .grand-total-box { background: #f9f9f9; border: 1px solid black; padding: 4px; text-align: center; font-family: sans-serif; margin: 8px 0; }
  .grand-total-title { font-size: 6.5px; color: #555; text-transform: uppercase; font-weight: bold; }
  .grand-total-value { font-size: 7.5px; font-weight: bold; margin-top: 1px; }
  .grand-total-highlight { font-size: 9px; font-weight: 900; }
  .signatures { margin-top: 16px; font-weight: bold; }
  .signatures div { margin-bottom: 8px; }
  .sig-box-container { margin-top: 18px; margin-bottom: 6px; }
  .sig-box { border: 1px solid black; border-radius: 2px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .sig-text { font-family: sans-serif; color: #ccc; font-weight: bold; text-transform: uppercase; font-size: 8px; letter-spacing: 1px; }
</style></head><body>
<div class="container">
  <div class="logo-circle"><img src="${LOGO_BASE64}" alt="Logo"/></div>
  <div class="title">Settlement</div>
  <div class="header-address">
    <div class="trust-name">Baijnaath Kesar Bai Sewa Trust</div>
    <div class="address-line">1-A Mangla Vihar New PAC Line</div>
    <div class="address-line">Kanpur Nagar – 208015</div>
  </div>
  <div class="metadata">
    <div class="metadata-row"><span>Date :-</span><span>${dateStr}</span></div>
    <div class="metadata-row"><span>Camp Area :-</span><span>${employee.location || "Mangla Vihar"}</span></div>
    <div class="metadata-row"><span>Mitra Name :-</span><span>${employee.name}</span></div>
    <div class="metadata-row"><span>Mitra ID No :-</span><span>${employee.id}</span></div>
    <div class="metadata-double"><span>District :- Kanpur</span><span>Pin Code :- ${employee.pincode || "208015"}</span></div>
    <div class="dashed-divider" style="margin-top:4px"></div>
    <div style="margin-top:3px">Total Apply Ayush Card - ${slipCalc.totalCards ?? employee.totalCards}</div>
  </div>
  <div class="dashed-border-top-bottom uppercase">Apply Ayush Card</div>
  ${amountTableHtml}
  <div class="grand-total-box">
    <div class="grand-total-title">Calculated Revenue Equation</div>
    <div class="grand-total-value">Grand Total = ${grandTotalLabel}</div>
  </div>
  <div class="signatures"><div>Cash Receiver Name : __________________</div><div>Cash Receiver ID No :- __________________</div></div>
  <div class="sig-box-container"><div class="sig-box"><span class="sig-text">Signature</span></div></div>
</div>
</body></html>`;

    const b64 = btoa(unescape(encodeURIComponent(htmlContent)));
    const playStoreUrl = "https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter";
    const rawbtIntent = `intent:#Intent;action=ru.a402d.rawbtprinter.action.PRINT;category=android.intent.category.DEFAULT;type=text/html;S.text=${b64};S.ru.a402d.rawbtprinter.EXTRA_B64=true;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end;`;

    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);
    if (!isAndroid) {
      toastWarn("RawBT printing works on Android phones. Use normal Print on desktop.");
      return;
    }
    window.location.href = rawbtIntent;
  };

  const filteredEmployees = useMemo(() =>
    employees.filter(e =>
      e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.id.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.email.toLowerCase().includes(empSearch.toLowerCase())
    ), [employees, empSearch]);

  const selfEmployee = useMemo(() => {
    if (userRole === "Employee" && currentUser) {
      return {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        location: currentUser.location || employeeLocation || "Mangla Vihar",
        totalCards: employeeCardCount,
        pincode: currentUser.pincode || employeePincode || "208015",
        date: selectedDateDisplay,
        _mongoId: currentUser._mongoId,
        _rawId: currentUser._mongoId,
      };
    }
    return null;
  }, [userRole, currentUser, employeeCardCount, employeeLocation, employeePincode, selectedDateDisplay]);

  useEffect(() => {
    if (selfEmployee) loadSettlementForEmployee(selfEmployee);
  }, [selfEmployee, loadSettlementForEmployee]);

  const handleDateChange = (iso) => {
    setSelectedDate(iso || getTodayISO());
    setCurrentPage(1);
    setSelectedEmployee(null);
  };

  const [savingSettle, setSavingSettle] = useState(false);

  const handleSettle = async (employee, nextStatus) => {
    if (!employee?._settlementEmployeeId) {
      toastError("No settlement record for this employee.");
      return;
    }
    setSavingSettle(true);
    try {
      const amount =
        employee._settlementRecord?.totalCollected ??
        settlementCalc?.grandTotal ??
        employee.settlementAmount ??
        0;
      await apiService.settleEmployeeDay({
        employeeId: employee._settlementEmployeeId,
        date: selectedDate,
        amount,
        status: nextStatus,
      });
      setSelectedEmployee((prev) =>
        prev ? { ...prev, status: nextStatus, settlementAmount: amount } : prev,
      );
      toastSuccess(
        nextStatus === "done"
          ? `Settlement marked done for ${employee.name}.`
          : `Settlement reverted to pending for ${employee.name}.`,
      );
      fetchEmployeesList();
    } catch (err) {
      console.error("Settle employee failed:", err);
      toastError(err?.response?.data?.message || "Failed to update settlement.");
    } finally {
      setSavingSettle(false);
    }
  };

  const datePicker = (
    <ThemedDatePicker
      value={selectedDate}
      onChange={handleDateChange}
      className="w-full sm:w-auto"
      aria-label="Filter settlement by date"
    />
  );

  return (
    <div className="flex flex-col h-[calc(100vh-170px)] print:h-auto" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3 no-print">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#22333B] tracking-tight">Settlement Card</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {userRole === "Employee"
              ? "View and print your daily settlement receipt"
              : "Employee settlement receipts, card counts & print management"}
          </p>
        </div>
        {userRole !== "Employee" && (
          <button
            onClick={fetchEmployeesList}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-[#F68E5F]" : ""} />
            Sync Data
          </button>
        )}
      </div>

      {userRole === "Employee" && (
        <div className="flex justify-end mb-4 no-print shrink-0">
          {datePicker}
        </div>
      )}

      {userRole === "Employee" && selfEmployee && (
        <div className="flex-1 overflow-y-auto no-print flex items-start justify-center py-4">
          <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm max-w-md w-full flex flex-col items-center">
            {selfLoading || calcLoading ? (
              <div className="py-16 flex flex-col items-center text-gray-500">
                <div className="w-8 h-8 border-4 border-[#F68E5F] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-semibold">Loading daily settlement...</p>
              </div>
            ) : (
              <>
            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#F68E5F] flex items-center justify-center font-black text-lg mb-2">
              {selfEmployee.name.charAt(0)}
            </div>
            <h3 className="text-base font-black text-[#22333B]">{selfEmployee.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{selfEmployee.id} · {selfEmployee.email}</p>
            <p className="text-[11px] text-[#F68E5F] font-bold mt-1">{selectedDateDisplay} · {settlementCalc?.totalCards ?? employeeCardCount} cards</p>
            <div className="w-full border-t border-gray-100 my-5" />
            <SettlementSlipPreview employee={selfEmployee} date={selectedDateDisplay} calc={settlementCalc} />
            <div className="w-full border-t border-gray-100 my-5" />
            <div className="w-full flex gap-3 mt-3">
              <button
                onClick={() => handlePrintSlip(selfEmployee)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#22333B] text-white font-black text-xs rounded-xl hover:bg-[#1a2830] transition-all shadow-sm"
              >
                <Printer size={15} /> Print Slip
              </button>
              <button
                onClick={() => handleRawBtPrintSlip(selfEmployee)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#F68E5F] text-white font-black text-xs rounded-xl hover:bg-[#ff7637] transition-all shadow-sm"
              >
                RawBT Print
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {userRole !== "Employee" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0 no-print">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-full placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]"
              />
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <div className="text-xs text-gray-500 font-semibold shrink-0">
              Daily cards for selected date
            </div>
            {datePicker}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm no-print">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-500">
                <div className="w-8 h-8 border-4 border-[#F68E5F] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-semibold">Loading staff roster...</p>
              </div>
            ) : filteredEmployees.length > 0 ? (
              <div className="overflow-y-auto overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
                    <tr className="text-gray-500 text-[11px] font-bold uppercase tracking-wide">
                      <th className="py-3 px-5 text-center w-14">#</th>
                      <th className="py-3 px-4">Employee ID</th>
                      <th className="py-3 px-4">Ayush Mitra Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4 text-center">Date</th>
                      <th className="py-3 px-4 text-center">Day Cards</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredEmployees.map((row, i) => (
                      <tr key={row.id} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3 px-5 text-center text-sm font-normal text-[#22333B]">{String(i + 1).padStart(2, "0")}</td>
                        <td className="py-3 px-4 font-mono text-sm font-normal text-[#22333B] whitespace-nowrap">{row.id}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-orange-100 text-[#F68E5F] flex items-center justify-center font-black text-xs uppercase">
                              {row.name.charAt(0)}
                            </div>
                            <span className="text-sm font-normal text-[#22333B]">{row.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">{row.email}</td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 text-xs font-normal text-[#22333B]">
                            {row.date}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-sm font-normal text-[#22333B] whitespace-nowrap">{row.totalCards}</td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <SettlementStatusBadge status={row.status} />
                        </td>
                        <td className="py-3 px-5 text-center">
                          <button
                            onClick={() => handleOpenSettlement(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-50 text-[#F68E5F] border border-orange-100 hover:bg-[#F68E5F] hover:text-white transition-all shadow-sm"
                          >
                            <FileText size={12} /> Settlement
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-500">
                <p className="text-base font-bold text-[#22333B]">No staff found</p>
                <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
              </div>
            )}
          </div>

          <div className="mt-4 shrink-0 no-print">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={val => { setItemsPerPage(val); setCurrentPage(1); }}
              totalItems={totalItems}
            />
          </div>
        </>
      )}

      {selectedEmployee && userRole !== "Employee" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col h-[92vh] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50 rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-700 tracking-wider">Settlement Receipt</h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">80mm Thermal · {selectedEmployee.name}</p>
              </div>
              <button onClick={() => setSelectedEmployee(null)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-100/50 p-6 flex items-start justify-center">
              {calcLoading ? (
                <div className="py-16 flex flex-col items-center text-gray-500">
                  <div className="w-8 h-8 border-4 border-[#F68E5F] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm font-semibold">Loading settlement...</p>
                </div>
              ) : (
                <SettlementSlipPreview
                  employee={selectedEmployee}
                  date={selectedEmployee.date || selectedDateDisplay}
                  calc={settlementCalc}
                />
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex flex-col gap-2.5 shrink-0 w-full">
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Settlement Status</span>
                <SettlementStatusBadge status={selectedEmployee.status} />
              </div>
              <button
                onClick={() =>
                  handleSettle(selectedEmployee, selectedEmployee.status === "done" ? "pending" : "done")
                }
                disabled={savingSettle || !selectedEmployee._settlementEmployeeId}
                className={`w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-black rounded-lg transition-all shadow-sm whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
                  selectedEmployee.status === "done"
                    ? "bg-white border border-[#F68E5F] text-[#F68E5F] hover:bg-orange-50"
                    : "bg-[#76DB1E] text-white hover:bg-[#69c41a]"
                }`}
              >
                {savingSettle
                  ? "Saving..."
                  : selectedEmployee.status === "done"
                    ? "Mark as Pending"
                    : "Mark as Settled"}
              </button>
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
                <button onClick={() => setSelectedEmployee(null)} className="w-full sm:w-auto px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-colors text-center whitespace-nowrap">
                  Close
                </button>
                <div className="flex flex-1 gap-2 w-full">
                  <button onClick={() => handlePrintSlip(selectedEmployee)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#22333B] text-white text-xs font-black rounded-lg hover:bg-[#1a2830] transition-all shadow-sm whitespace-nowrap">
                    <Printer size={14} /> Print
                  </button>
                  <button onClick={() => handleRawBtPrintSlip(selectedEmployee)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#F68E5F] text-white text-xs font-black rounded-lg hover:bg-[#ff7637] transition-all shadow-sm whitespace-nowrap">
                    RawBT Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettlementCard;
