import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Printer, FileText, X, Calendar, RefreshCw,
  CreditCard, Copy, ChevronRight, ChevronLeft, Check,
  Wifi, Banknote, AlertCircle, Clock, Loader2,
  Users, Receipt, ClipboardList, Eye
} from "lucide-react";
import apiService from "../../../api/service";
import { useToast } from "../../../components/ui/Toast";
import Pagination from "../../../components/ui/Pagination";
import { LOGO_BASE64 } from "../../../utils/logoBase64";
import {
  normalizeHealthCard,
  parseHealthCardsResponse,
} from "../../../utils/healthCardUtils";

// Import modular components
import StatTile from "./components/StatTile";
import SettlementSlipPreview from "./components/SettlementSlipPreview";
import DuplicateReceiptModal from "./components/DuplicateReceiptModal";
import ViewPenaltyModal from "./components/ViewPenaltyModal";
import {
  PENALTY_AMOUNT,
  getFormattedCurrentDate,
  calculateSettlement,
  toDupCardShape,
} from "./components/vitranUtils";

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const AyushVitran = () => {
  const { toastSuccess, toastError, toastWarn } = useToast();
  const [activeTab, setActiveTab] = useState("employees");

  // Auth
  const [userRole, setUserRole] = useState("Admin");
  const [currentUser, setCurrentUser] = useState({ name: "Officer", email: "officer@bkbs.org", id: "EMP-1000" });

  // Employee tab state
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empSearch, setEmpSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Exported Cards tab state — fetched from API
  const [exportedCards, setExportedCards] = useState([]);
  const [exportedLoading, setExportedLoading] = useState(false);
  const [exportedPage, setExportedPage] = useState(1);
  const [exportedItemsPerPage, setExportedItemsPerPage] = useState(25);
  const [exportedTotalItems, setExportedTotalItems] = useState(0);
  const [exportedTotalPages, setExportedTotalPages] = useState(1);
  const [cardSearch, setCardSearch] = useState("");
  const [debouncedCardSearch, setDebouncedCardSearch] = useState("");
  const [cardFilterEmployee, setCardFilterEmployee] = useState("");
  const [selectedCardForDup, setSelectedCardForDup] = useState(null);
  // Map of employeeId -> name for display
  const [createdByMap, setCreatedByMap] = useState({});

  // Duplicate receipts state
  const [dupReceipts, setDupReceipts] = useState([]);
  const [dupFilterStatus, setDupFilterStatus] = useState("");
  const [dupFilterMethod, setDupFilterMethod] = useState("");
  const [viewingReceipt, setViewingReceipt] = useState(null);

  // Debounce card search input to reset page and trigger server-side fetch
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCardSearch(cardSearch.trim());
      setExportedPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [cardSearch]);

  // Fetch exported (printed) cards from API
  const fetchExportedCards = useCallback(async () => {
    setExportedLoading(true);
    try {
      const params = { page: exportedPage, limit: exportedItemsPerPage, sort: "-createdAt" };
      if (debouncedCardSearch) params.search = debouncedCardSearch;
      const res = await apiService.getPrintedCards(params);
      const { raw, total, pages } = parseHealthCardsResponse(res);
      const normalized = raw.map(normalizeHealthCard);
      setExportedCards(normalized);
      setExportedTotalItems(Number(total));
      setExportedTotalPages(Number((pages ?? Math.ceil(total / exportedItemsPerPage)) || 1));

      // Resolve employee names for createdBy IDs
      const ids = [...new Set(normalized.map(c => {
        const raw = c.createdBy;
        return typeof raw === "string" ? raw : (raw?._id || raw?.employeeId || "");
      }).filter(Boolean))];
      const missing = ids.filter(id => !createdByMap[id]);
      if (missing.length > 0) {
        const results = await Promise.all(missing.map(async id => {
          try {
            const empRes = await apiService.getEmployeeById(String(id));
            const u = empRes?.data?.user || empRes?.user || empRes?.data?.data || empRes?.data || empRes;
            const name = u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || String(id);
            return [id, name];
          } catch { return [id, String(id)]; }
        }));
        setCreatedByMap(prev => { const next = { ...prev }; results.forEach(([id, n]) => { next[id] = n; }); return next; });
      }
    } catch (err) {
      console.warn("[AyushVitran] Failed to fetch exported cards:", err.message);
    } finally {
      setExportedLoading(false);
    }
  }, [exportedPage, exportedItemsPerPage, debouncedCardSearch]);

  useEffect(() => {
    if (activeTab === "exported") {
      fetchExportedCards();
    }
  }, [activeTab, exportedPage, exportedItemsPerPage, debouncedCardSearch]);

  // Load auth
  useEffect(() => {
    const userRaw = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (userRaw) {
      try {
        const u = JSON.parse(userRaw);
        setCurrentUser({ name: u.name || "Employee", email: u.email || "N/A", id: u.employeeId || u._id || "EMP-1000", location: u.location || "Mangla Vihar" });
      } catch { }
    }
    const role = localStorage.getItem("userRole") || "Admin";
    setUserRole(role);
    if (role === "Employee") {
      setActiveTab("settlement");
    }
  }, []);

  // For Employee self performance tracking
  const [employeeCardCount, setEmployeeCardCount] = useState(0);
  const [employeeLocation, setEmployeeLocation] = useState("Mangla Vihar");
  const [employeePincode, setEmployeePincode] = useState("208015");

  useEffect(() => {
    if (userRole === "Employee" && currentUser?.id) {
      const fetchSelfPerformance = async () => {
        try {
          const res = await apiService.getEmployeeById(String(currentUser.id));
          const u = res?.data?.user || res?.user || res?.data?.data || res?.data || res;
          if (u) {
            setEmployeeLocation(u.location || "Mangla Vihar");
            setEmployeePincode(u.pincode || "208015");
          }
        } catch (e) {
          console.warn("Failed to fetch employee details:", e);
        }

        try {
          const perfRes = await apiService.getReportsEmployeePerformance();
          const perfData = perfRes?.data || perfRes || [];
          if (Array.isArray(perfData)) {
            const rawId = String(currentUser.id).toLowerCase();
            const email = String(currentUser.email || "").toLowerCase();
            const name = String(currentUser.name || "").toLowerCase();

            const match = perfData.find(p => 
              (p.employeeId && String(p.employeeId).toLowerCase() === rawId) ||
              (p._id && String(p._id).toLowerCase() === rawId) ||
              (p.name && String(p.name).toLowerCase() === name) ||
              (p.email && String(p.email).toLowerCase() === email)
            );
            if (match) {
              setEmployeeCardCount(Number(match.cardsIssued || match.count || match.totalCards || 0));
            }
          }
        } catch (perfErr) {
          console.warn("Failed to fetch self performance count:", perfErr);
        }
      };
      fetchSelfPerformance();
    }
  }, [userRole, currentUser]);

  // Load duplicate receipts from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ayush_dup_receipts") || "[]");
      setDupReceipts(stored);
    } catch {
      setDupReceipts([]);
    }
  }, []);

  // Save duplicate receipts to localStorage
  const saveDupReceipt = useCallback((record) => {
    setDupReceipts(prev => {
      const updated = [record, ...prev];
      try { localStorage.setItem("ayush_dup_receipts", JSON.stringify(updated)); } catch { }
      return updated;
    });
  }, []);

  // Fallback employees
  const fallbackEmployees = useMemo(() => {
    const todayStr = getFormattedCurrentDate();
    return [
      { id: "EMP-2038", name: "Amit Sharma", email: "amit.sharma@bkbs.org", date: todayStr, location: "Mangla Vihar", totalCards: 67, pincode: "208015" },
      { id: "EMP-2039", name: "Priya Patel", email: "priya.patel@bkbs.org", date: todayStr, location: "PAC Line", totalCards: 77, pincode: "208015" },
      { id: "EMP-2040", name: "Rajesh Verma", email: "rajesh.verma@bkbs.org", date: todayStr, location: "Kanpur Nagar", totalCards: 48, pincode: "208012" },
      { id: "EMP-2041", name: "Sneha Reddy", email: "sneha.reddy@bkbs.org", date: todayStr, location: "Kalyanpur", totalCards: 85, pincode: "208016" },
      { id: "EMP-2042", name: "Vikram Malhotra", email: "vikram.malhotra@bkbs.org", date: todayStr, location: "Kidwai Nagar", totalCards: 36, pincode: "208011" },
      { id: "EMP-2043", name: "Suresh Gupta", email: "suresh.gupta@bkbs.org", date: todayStr, location: "Awas Vikas", totalCards: 54, pincode: "208015" },
    ];
  }, []);

  const fetchEmployeesList = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch employees list
      const res = await apiService.getEmployees({ page: currentPage, limit: itemsPerPage });
      const rawData = res.data || res;
      let list = Array.isArray(rawData) ? rawData : [];
      if (!list.length && rawData?.data && Array.isArray(rawData.data)) list = rawData.data;
      if (!list.length && rawData?.users && Array.isArray(rawData.users)) list = rawData.users;
      if (!list.length && rawData?.employees && Array.isArray(rawData.employees)) list = rawData.employees;

      // 2. Fetch employee performance for actual card counts
      let performanceMap = {};
      try {
        const perfRes = await apiService.getReportsEmployeePerformance();
        const perfData = perfRes?.data || perfRes || [];
        if (Array.isArray(perfData)) {
          perfData.forEach(p => {
            const count = Number(p.cardsIssued || p.count || p.totalCards || 0);
            if (p.employeeId) {
              performanceMap[p.employeeId.toString().toLowerCase()] = count;
            }
            if (p.name) {
              performanceMap[p.name.toString().toLowerCase()] = count;
            }
            if (p._id) {
              performanceMap[p._id.toString().toLowerCase()] = count;
            }
          });
        }
      } catch (perfErr) {
        console.warn("[AyushVitran] Failed to fetch employee performance for card counts:", perfErr);
      }

      const todayStr = getFormattedCurrentDate();
      if (list && list.length > 0) {
        const mapped = list.map((u, i) => {
          const rawId = u._id ? u._id.toString().toLowerCase() : "";
          const empId = u.employeeId ? u.employeeId.toString().toLowerCase() : "";
          const userName = u.name ? u.name.toString().toLowerCase() : "";

          // Fetch correct count from API mapping or fallback
          const totalCards = performanceMap[rawId]
            || performanceMap[empId]
            || performanceMap[userName]
            || Number(u.totalCards || u.cardsCount || u.cardsIssued || 0);

          return {
            id: u.employeeId || u._id || `EMP-${2000 + i}`,
            name: u.name || "Unknown Staff",
            email: u.email || "N/A",
            date: todayStr,
            location: u.location || "Mangla Vihar",
            totalCards,
            pincode: u.pincode || "208015",
            _rawId: u._id,
          };
        });
        setEmployees(mapped);
        setTotalItems(mapped.length);
        setTotalPages(Math.ceil(mapped.length / itemsPerPage) || 1);
      } else {
        setEmployees(fallbackEmployees);
        setTotalItems(fallbackEmployees.length);
        setTotalPages(Math.ceil(fallbackEmployees.length / itemsPerPage) || 1);
      }
    } catch {
      setEmployees(fallbackEmployees);
      setTotalItems(fallbackEmployees.length);
      setTotalPages(Math.ceil(fallbackEmployees.length / itemsPerPage) || 1);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, fallbackEmployees]);

  useEffect(() => {
    if (userRole !== "Employee") fetchEmployeesList();
  }, [currentPage, itemsPerPage, userRole]);

  // PWT Settlement Print
  const handlePrintSlip = (employee) => {
    if (!employee) return;
    const calc = calculateSettlement(employee.totalCards);
    const dateStr = getFormattedCurrentDate();
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
  .table-heading{display:flex;justify-content:space-between;font-family:sans-serif;text-transform:uppercase;font-weight:bold;border-bottom:1px solid black;padding-bottom:3px;margin-bottom:6px;font-size:9.5px}
  .table-row{display:flex;justify-content:space-between;margin-bottom:4px}
  .table-total{display:flex;justify-content:space-between;font-weight:bold;border-top:1px solid black;padding-top:5px;margin-top:6px;font-size:10.5px}
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
    <div style="margin-top:5px">Total Apply Ayush Card - ${employee.totalCards}</div>
  </div>
  <div class="dashed-border-top-bottom uppercase">Apply Ayush Card</div>
  <div class="table-heading"><span>Card Detail - Amount</span><span>Online - Amount</span></div>
  <div class="table-row"><span>160 x ${calc.off160} = ${Number(calc.amt160).toFixed(2)}</span><span>${calc.on160} = ${Number(calc.onAmt160).toFixed(0)}</span></div>
  <div class="table-row"><span>200 x ${calc.off200} = ${Number(calc.amt200).toFixed(2)}</span><span>${calc.on200} = ${Number(calc.onAmt200).toFixed(0)}</span></div>
  <div class="table-row"><span>240 x ${calc.off240} = ${Number(calc.amt240).toFixed(2)}</span><span>${calc.on240} = ${Number(calc.onAmt240).toFixed(0)}</span></div>
  <div class="table-row"><span>280 x ${calc.off280} = ${Number(calc.amt280).toFixed(2)}</span><span>${calc.on280} = ${Number(calc.onAmt280).toFixed(0)}</span></div>
  <div class="table-row"><span>Penalty x ${calc.penaltyCount} = ${Number(calc.penaltyAmount).toFixed(2)}</span><span>${calc.onPenaltyCount} = ${Number(calc.onPenaltyAmount).toFixed(0)}</span></div>
  <div class="table-total"><span>Total = ${calc.offlineCount} = ${Number(calc.offlineTotalWithPenalty).toFixed(2)}</span><span>${calc.onlineCount} = ${Number(calc.onlineTotalWithPenalty).toFixed(2)}</span></div>
  <div class="grand-total-box">
    <div class="grand-total-title">Calculated Revenue Equation</div>
    <div class="grand-total-value">Grand Total = ${calc.offlineBaseTotal} + ${calc.onlineTotalWithPenalty} + ${calc.penaltyAmount} = <span class="grand-total-highlight">₹${calc.grandTotal}</span></div>
  </div>
  <div class="signatures"><div>Cash Receiver Name : __________________</div><div>Cash Receiver ID No :- __________________</div></div>
  <div class="sig-box-container"><div class="sig-box"><span class="sig-text">Signature</span></div></div>
</div>
<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script>
</body></html>`);
    pw.document.close();
    toastSuccess("Settlement slip sent to printer!");
  };

  const handleRawBtPrintSlip = (employee) => {
    if (!employee) return;
    const calc = calculateSettlement(employee.totalCards);
    const dateStr = getFormattedCurrentDate();
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
  .table-heading { display: flex; justify-content: space-between; font-family: sans-serif; text-transform: uppercase; font-weight: bold; border-bottom: 1px solid black; padding-bottom: 2px; margin-bottom: 4px; font-size: 7.5px; }
  .table-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .table-total { display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid black; padding-top: 4px; margin-top: 4px; font-size: 8px; }
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
    <div style="margin-top:3px">Total Apply Ayush Card - ${employee.totalCards}</div>
  </div>
  <div class="dashed-border-top-bottom uppercase">Apply Ayush Card</div>
  <div class="table-heading"><span>Card Detail - Amount</span><span>Online - Amount</span></div>
  <div class="table-row"><span>160 x ${calc.off160} = ${Number(calc.amt160).toFixed(0)}</span><span>${calc.on160} = ${Number(calc.onAmt160).toFixed(0)}</span></div>
  <div class="table-row"><span>200 x ${calc.off200} = ${Number(calc.amt200).toFixed(0)}</span><span>${calc.on200} = ${Number(calc.onAmt200).toFixed(0)}</span></div>
  <div class="table-row"><span>240 x ${calc.off240} = ${Number(calc.amt240).toFixed(0)}</span><span>${calc.on240} = ${Number(calc.onAmt240).toFixed(0)}</span></div>
  <div class="table-row"><span>280 x ${calc.off280} = ${Number(calc.amt280).toFixed(0)}</span><span>${calc.on280} = ${Number(calc.onAmt280).toFixed(0)}</span></div>
  <div class="table-row"><span>Penalty x ${calc.penaltyCount} = ${Number(calc.penaltyAmount).toFixed(0)}</span><span>${calc.onPenaltyCount} = ${Number(calc.onPenaltyAmount).toFixed(0)}</span></div>
  <div class="table-total"><span>Total = ${calc.offlineCount} = ${Number(calc.offlineTotalWithPenalty).toFixed(0)}</span><span>${calc.onlineCount} = ${Number(calc.onlineTotalWithPenalty).toFixed(0)}</span></div>
  <div class="grand-total-box">
    <div class="grand-total-title">Calculated Revenue Equation</div>
    <div class="grand-total-value">Grand Total = ${calc.offlineBaseTotal} + ${calc.onlineTotalWithPenalty} + ${calc.penaltyAmount} = <span class="grand-total-highlight">₹${calc.grandTotal}</span></div>
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

  // Filtered data
  const filteredEmployees = useMemo(() =>
    employees.filter(e =>
      e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.id.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.email.toLowerCase().includes(empSearch.toLowerCase())
    ), [employees, empSearch]);

  // Map exported cards to the dup-receipt shape for display & modal
  const mappedExportedCards = useMemo(() =>
    exportedCards.map(c => toDupCardShape(c, createdByMap)),
    [exportedCards, createdByMap]);


  const filteredCards = useMemo(() => {
    const q = cardSearch.toLowerCase().trim();
    return mappedExportedCards.filter(c => {
      const matchSearch = !q ||
        c.id.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        c.employeeName.toLowerCase().includes(q) ||
        c.receiptNo.toLowerCase().includes(q);
      const matchEmp = !cardFilterEmployee ||
        String(c.employeeId).toLowerCase() === String(cardFilterEmployee).toLowerCase();
      return matchSearch && matchEmp;
    });
  }, [mappedExportedCards, cardSearch, cardFilterEmployee]);

  const filteredDups = useMemo(() => {
    return dupReceipts.filter(r => {
      const matchStatus = !dupFilterStatus || r.paymentStatus === dupFilterStatus;
      const matchMethod = !dupFilterMethod || r.paymentMethod === dupFilterMethod;
      return matchStatus && matchMethod;
    });
  }, [dupReceipts, dupFilterStatus, dupFilterMethod]);

  // Stats
  const paidCount = dupReceipts.filter(r => r.paymentStatus === "paid").length;
  const pendingCount = dupReceipts.filter(r => r.paymentStatus === "pending").length;

  const selfEmployee = useMemo(() => {
    if (userRole === "Employee" && currentUser) {
      return {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        location: currentUser.location || employeeLocation || "Mangla Vihar",
        totalCards: employeeCardCount,
        pincode: currentUser.pincode || employeePincode || "208015"
      };
    }
    return null;
  }, [userRole, currentUser, employeeCardCount, employeeLocation, employeePincode]);

  const TABS = useMemo(() => {
    if (userRole === "Employee") {
      return [
        { id: "settlement", label: "My Settlement", Icon: FileText },
        { id: "exported", label: "Penalty Receipts", Icon: CreditCard },
        { id: "duplicates", label: "Duplicate Receipts", Icon: Receipt },
      ];
    }
    return [
      { id: "employees", label: "Employee List", Icon: Users },
      { id: "exported", label: "Penalty Receipts", Icon: CreditCard },
      { id: "duplicates", label: "Duplicate Receipts", Icon: Receipt },
    ];
  }, [userRole]);

  return (
    <div className="flex flex-col h-[calc(100vh-170px)] print:h-auto" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3 no-print">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#22333B] tracking-tight">Ayush Vitran</h2>
          <p className="text-xs text-gray-500 mt-0.5">Receipt management, card tracking & duplicate receipt issuance</p>
        </div>
        {userRole !== "Employee" && activeTab === "employees" && (
          <button onClick={fetchEmployeesList}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#F68E5F]" : ""} />
            Sync Data
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 p-1 rounded-xl shrink-0 no-print w-full sm:w-fit overflow-x-auto scrollbar-none flex-nowrap">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0
              ${activeTab === id ? "bg-white text-[#22333B] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: EMPLOYEE LIST ═══ */}
      {activeTab === "employees" && userRole !== "Employee" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0 no-print">
            <div className="relative w-full sm:w-80">
              <input type="text" placeholder="Search by name, email, or ID..." value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-full placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]" />
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <div className="text-xs text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg font-semibold shadow-sm flex items-center gap-1.5 w-fit">
              <Calendar size={13} className="text-[#F68E5F]" />
              {getFormattedCurrentDate()}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm no-print">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-500">
                <div className="w-8 h-8 border-4 border-[#F68E5F] border-t-transparent rounded-full animate-spin mb-3"></div>
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
                      <th className="py-3 px-4 text-center">Total Cards</th>
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
                            <div className="w-7 h-7 rounded-full bg-orange-100 text-[#F68E5F] flex items-center justify-center font-black text-xs uppercase">{row.name.charAt(0)}</div>
                            <span className="text-sm font-normal text-[#22333B]">{row.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">{row.email}</td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 text-xs font-normal text-[#22333B]">{row.date}</span>
                        </td>
                        <td className="py-3 px-4 text-center text-sm font-normal text-[#22333B] whitespace-nowrap">{row.totalCards}</td>
                        <td className="py-3 px-5 text-center">
                          <button onClick={() => setSelectedEmployee(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-50 text-[#F68E5F] border border-orange-100 hover:bg-[#F68E5F] hover:text-white transition-all shadow-sm">
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
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage} onItemsPerPageChange={val => { setItemsPerPage(val); setCurrentPage(1); }} totalItems={totalItems} />
          </div>
        </>
      )}

      {/* Employee self-view */}
      {activeTab === "settlement" && userRole === "Employee" && selfEmployee && (
        <div className="flex-1 overflow-y-auto no-print flex items-start justify-center py-4">
          <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm max-w-md w-full flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#F68E5F] flex items-center justify-center font-black text-lg mb-2">{selfEmployee.name.charAt(0)}</div>
            <h3 className="text-base font-black text-[#22333B]">{selfEmployee.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{selfEmployee.id} · {selfEmployee.email}</p>
            <div className="w-full border-t border-gray-100 my-5"></div>
            <SettlementSlipPreview employee={selfEmployee} date={getFormattedCurrentDate()} />
            <div className="w-full border-t border-gray-100 my-5"></div>
            <div className="w-full flex gap-3 mt-3">
              <button onClick={() => handlePrintSlip(selfEmployee)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#22333B] text-white font-black text-xs rounded-xl hover:bg-[#1a2830] transition-all shadow-sm">
                <Printer size={15} /> Print Slip
              </button>
              <button onClick={() => handleRawBtPrintSlip(selfEmployee)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#F68E5F] text-white font-black text-xs rounded-xl hover:bg-[#ff7637] transition-all shadow-sm">
                RawBT Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB 2: EXPORTED CARDS ═══ */}
      {activeTab === "exported" && (
        <div className="flex flex-col flex-1 min-h-0 no-print">
          {/* Stat tiles */}
          <div className="flex overflow-x-auto scrollbar-none flex-nowrap sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 pb-1 shrink-0 w-full">
            <StatTile icon={CreditCard} label="Total Exported" value={exportedTotalItems || exportedCards.length} color="bg-blue-100 text-blue-600" bg="bg-blue-50 border-blue-100" />
            <StatTile icon={Receipt} label="Dup. Receipts Issued" value={dupReceipts.length} color="bg-orange-100 text-[#F68E5F]" bg="bg-orange-50 border-orange-100" />
            <StatTile icon={Check} label="Payments Collected" value={`₹${paidCount * PENALTY_AMOUNT}`} color="bg-green-100 text-green-600" bg="bg-green-50 border-green-100" />
            <StatTile icon={Clock} label="Pending Payments" value={pendingCount} color="bg-amber-100 text-amber-600" bg="bg-amber-50 border-amber-100" />
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
            <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
              <input type="text" placeholder="Search by card no., name, mobile, employee..."
                value={cardSearch} onChange={e => setCardSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]" />
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {cardSearch && (
              <button onClick={() => setCardSearch("")}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 px-3 py-2 border border-gray-200 rounded-xl bg-white flex items-center gap-1 shadow-sm transition-all hover:bg-gray-50">
                <X size={12} /> Clear
              </button>
            )}
            <span className="text-xs text-gray-400 font-semibold sm:ml-auto w-full sm:w-auto text-right">{exportedTotalItems > 0 ? `${exportedTotalItems} total` : `${filteredCards.length} cards`}</span>
          </div>

          {/* Exported Cards Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm" style={{ minHeight: 0 }}>
            {exportedLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-400">
                <Loader2 size={28} className="animate-spin text-[#F68E5F] mb-3" />
                <p className="text-sm font-semibold">Loading exported cards...</p>
              </div>
            ) : (
              <div className="overflow-y-auto overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
                    <tr className="text-gray-500 text-[11px] font-bold uppercase tracking-wide">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Card ID</th>
                      <th className="py-3 px-4">Client Name</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Ayush Mitra</th>
                      <th className="py-3 px-4 text-center">Amount</th>
                      <th className="py-3 px-4 text-center">Export Date</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((card, i) => (
                      <tr key={card.id || i} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B]">{i + 1}</td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">{card.id}</td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">{card.clientName}</td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">{card.mobile}</td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">{card.employeeName || "—"}</td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] text-center whitespace-nowrap">₹{Number(card.amount || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm font-normal text-[#22333B] text-center whitespace-nowrap">{card.exportDate}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedCardForDup(card)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-500 hover:text-white transition-all shadow-sm"
                          >
                            <Copy size={11} /> Duplicate
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCards.length === 0 && !exportedLoading && (
                      <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm font-medium">No exported cards found. Cards appear here once they are printed/exported.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination for exported cards */}
          {exportedTotalPages > 1 && (
            <div className="mt-3 shrink-0">
              <Pagination
                currentPage={exportedPage}
                totalPages={exportedTotalPages}
                onPageChange={setExportedPage}
                itemsPerPage={exportedItemsPerPage}
                onItemsPerPageChange={val => { setExportedItemsPerPage(val); setExportedPage(1); }}
                totalItems={exportedTotalItems}
                pageSizeOptions={[25, 50, 100]}
              />
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 3: DUPLICATE RECEIPTS ═══ */}
      {activeTab === "duplicates" && (
        <div className="flex flex-col flex-1 min-h-0 no-print">
          {/* Mini stats */}
          <div className="flex overflow-x-auto scrollbar-none flex-nowrap sm:grid sm:grid-cols-3 gap-3 mb-4 pb-1 shrink-0 w-full">
            <StatTile icon={ClipboardList} label="Total Issued" value={dupReceipts.length} color="bg-purple-100 text-purple-600" bg="bg-purple-50 border-purple-100" />
            <StatTile icon={Check} label="Paid" value={paidCount} color="bg-green-100 text-green-600" bg="bg-green-50 border-green-100" />
            <StatTile icon={Clock} label="Pending" value={pendingCount} color="bg-amber-100 text-amber-600" bg="bg-amber-50 border-amber-100" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
            <select value={dupFilterStatus} onChange={e => setDupFilterStatus(e.target.value)}
              className="flex-1 sm:flex-initial text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F68E5F] text-gray-600 bg-white">
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
            <select value={dupFilterMethod} onChange={e => setDupFilterMethod(e.target.value)}
              className="flex-1 sm:flex-initial text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F68E5F] text-gray-600 bg-white">
              <option value="">All Methods</option>
              <option value="online">Online</option>
              <option value="offline">Offline (Cash)</option>
            </select>
            {(dupFilterStatus || dupFilterMethod) && (
              <button onClick={() => { setDupFilterStatus(""); setDupFilterMethod(""); }}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 px-2 py-2 border border-gray-200 rounded-xl bg-white flex items-center gap-1">
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {/* Duplicate Receipts Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm">
            {filteredDups.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-400">
                <Receipt size={32} className="text-gray-200 mb-3" />
                <p className="text-sm font-bold text-gray-500">No duplicate receipts yet</p>
                <p className="text-xs text-gray-400 mt-1">Go to "Exported Cards" tab and click "Duplicate" to issue one</p>
              </div>
            ) : (
              <div className="overflow-y-auto overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
                    <tr className="text-gray-500 text-[11px] font-bold uppercase tracking-wide">
                      <th className="py-3 px-4">Receipt No.</th>
                      <th className="py-3 px-4">Card ID</th>
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4">Ayush Mitra</th>
                      <th className="py-3 px-4 text-center">Penalty</th>
                      <th className="py-3 px-4 text-center">Method</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Date</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredDups.map((rec) => (
                      <tr key={rec.receiptNo} className="border-b border-gray-50 hover:bg-purple-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-bold text-purple-600">{rec.receiptNo}</td>
                        <td className="py-3 px-4 font-mono text-xs text-gray-500">{rec.cardId}</td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-[#22333B] text-sm">{rec.clientName}</p>
                          <p className="text-[10px] text-gray-400">Orig: {rec.originalReceiptNo}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-bold text-[#22333B]">{rec.employeeName}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{rec.employeeId}</p>
                        </td>
                        <td className="py-3 px-4 text-center font-black text-sm text-[#22333B]">₹{rec.penaltyAmount}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border
                            ${rec.paymentMethod === "online" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-gray-50 text-gray-600 border-gray-100"}`}>
                            {rec.paymentMethod === "online" ? <><Wifi size={9} /> Online</> : <><Banknote size={9} /> Cash</>}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border
                            ${rec.paymentStatus === "paid" ? "bg-green-50 text-green-600 border-green-100" : "bg-amber-50 text-amber-600 border-amber-100"}`}>
                            {rec.paymentStatus === "paid" ? <><Check size={9} /> Paid</> : <><Clock size={9} /> Pending</>}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-[10px] text-gray-400 font-medium">{rec.issuedAt}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => setViewingReceipt(rec)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-100 hover:bg-purple-500 hover:text-white transition-all shadow-sm">
                            <Eye size={11} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SETTLEMENT MODAL (Tab 1) ═══ */}
      {selectedEmployee && userRole !== "Employee" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col h-[92vh] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50 rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-700 tracking-wider">Settlement Receipt</h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">80mm Thermal · {selectedEmployee.name}</p>
              </div>
              <button onClick={() => setSelectedEmployee(null)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-100/50 p-6 flex items-start justify-center">
              <SettlementSlipPreview employee={selectedEmployee} date={getFormattedCurrentDate()} />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full">
              <button onClick={() => setSelectedEmployee(null)} className="w-full sm:w-auto px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-colors text-center whitespace-nowrap">Close</button>
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
      )}

      {/* ═══ DUPLICATE RECEIPT WIZARD MODAL ═══ */}
      {selectedCardForDup && (
        <DuplicateReceiptModal
          card={selectedCardForDup}
          onClose={() => setSelectedCardForDup(null)}
          onIssued={(record) => {
            saveDupReceipt(record);
            setSelectedCardForDup(null);
          }}
        />
      )}

      {/* ═══ VIEW PENALTY RECEIPT MODAL ═══ */}
      {viewingReceipt && (
        <ViewPenaltyModal record={viewingReceipt} onClose={() => setViewingReceipt(null)} />
      )}
    </div>
  );
};

export default AyushVitran;
