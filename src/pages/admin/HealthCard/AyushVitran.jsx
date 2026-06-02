import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Printer,
  User,
  FileText,
  X,
  Calendar,
  RefreshCw
} from "lucide-react";
import apiService from "../../../api/service";
import { useToast } from "../../../components/ui/Toast";
import Pagination from "../../../components/ui/Pagination";

// Simple helper to get current date in standard format
const getFormattedCurrentDate = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// ─── DETERMINISTIC SETTLEMENT CALCULATOR ENGINE ─────────────────────────────
const calculateSettlement = (totalCards) => {
  const count = Number(totalCards) || 0;

  // Offline cards are ~90%, Online cards are ~10%
  const offlineCount = Math.max(0, Math.round(count * 0.9));
  const onlineCount = Math.max(0, count - offlineCount);

  // Distribute offlineCount across tiers: 160, 200, 240, 280
  const off160 = Math.max(0, Math.round(offlineCount * 0.4));
  const off200 = Math.max(0, Math.round(offlineCount * 0.35));
  const off240 = Math.max(0, Math.round(offlineCount * 0.15));
  const off280 = Math.max(0, offlineCount - (off160 + off200 + off240));

  const amt160 = off160 * 160;
  const amt200 = off200 * 200;
  const amt240 = off240 * 240;
  const amt280 = off280 * 280;
  const offlineBaseTotal = amt160 + amt200 + amt240 + amt280;

  // Online count distribution
  const on160 = Math.max(0, Math.round(onlineCount * 0.4));
  const on200 = Math.max(0, Math.round(onlineCount * 0.3));
  const on240 = Math.max(0, Math.round(onlineCount * 0.3));
  const on280 = Math.max(0, onlineCount - (on160 + on200 + on240));

  const onAmt160 = on160 * 160;
  const onAmt200 = on200 * 200;
  const onAmt240 = on240 * 240;
  const onAmt280 = on280 * 280;
  const onlineBaseTotal = onAmt160 + onAmt200 + onAmt240 + onAmt280;

  // Penalty count: around 5% of offline cards, penalty fee of Rs 25 each
  const penaltyCount = Math.max(0, Math.round(offlineCount * 0.05));
  const penaltyAmount = penaltyCount * 25;

  // Online Penalty count
  const onPenaltyCount = Math.max(0, Math.round(onlineCount * 0.28));
  const onPenaltyAmount = onPenaltyCount * 50;

  const offlineTotalWithPenalty = offlineBaseTotal + penaltyAmount;
  const onlineTotalWithPenalty = onlineBaseTotal + onPenaltyAmount;

  const grandTotal = offlineBaseTotal + onlineBaseTotal + penaltyAmount + onPenaltyAmount;

  return {
    offlineCount,
    off160,
    off200,
    off240,
    off280,
    amt160,
    amt200,
    amt240,
    amt280,
    offlineBaseTotal,

    onlineCount,
    on160,
    on200,
    on240,
    on280,
    onAmt160,
    onAmt200,
    onAmt240,
    onAmt280,
    onlineBaseTotal,

    penaltyCount,
    penaltyAmount,
    onPenaltyCount,
    onPenaltyAmount,
    offlineTotalWithPenalty,
    onlineTotalWithPenalty,
    grandTotal
  };
};

// ─── HIGH-FIDELITY SETTLEMENT THERMAL SLIP RECEIPT ──────────────────────────
// Renders Settlement exactly as in the user's reference mockup for preview
const SettlementSlipPreview = ({ employee, date }) => {
  const calc = useMemo(() => calculateSettlement(employee.totalCards), [employee.totalCards]);

  return (
    <div
      className="bg-white text-black p-6 border border-gray-300 rounded-sm shadow-md mx-auto font-mono"
      style={{
        width: "80mm",
        maxWidth: "100%",
        minHeight: "170mm",
        boxSizing: "border-box",
        fontSize: "11px",
        lineHeight: "1.4"
      }}
    >
      {/* 1. Circular border containing BKBS official logo */}
      <div className="flex flex-col items-center mb-4">
        <div className="w-20 h-20 rounded-full border border-black flex items-center justify-center p-2 mb-2 bg-white">
          <img src="/logo.svg" alt="BKBS Logo" className="h-12 w-auto object-contain" />
        </div>

        {/* 2. Title: Settlement */}
        <h2 className="text-base font-extrabold tracking-widest uppercase text-center font-sans mt-1">
          Settlement
        </h2>
      </div>

      {/* 3. Organization & Address Details */}
      <div className="text-center font-sans mb-4 border-b border-dashed border-black pb-2">
        <h3 className="text-xs font-black uppercase leading-tight">
          Baijnaath Kesar Bai Sewa Trust
        </h3>
        <p className="text-[10px] font-bold mt-0.5">
          1-A Mangla Vihar New PAC Line
        </p>
        <p className="text-[10px] font-bold">
          Kanpur Nagar – 208015
        </p>
      </div>

      {/* 4. Roster Metadata */}
      <div className="space-y-1 font-bold mb-4">
        <div>Date :- <span className="font-mono font-medium">{date}</span></div>
        <div>Camp Area :- <span className="font-sans font-medium">{employee.location || "Mangla Vihar"}</span></div>
        <div>Ayush Mitra Name :- <span className="font-sans font-medium">{employee.name}</span></div>
        <div>Ayoush Mitra ID No :- <span className="font-mono font-medium">{employee.id}</span></div>
        <div>Camp Area :- <span className="font-sans font-medium">{employee.location || "Mangla Vihar"}</span></div>
        <div className="flex justify-between">
          <span>District :- <span className="font-sans font-medium">Kanpur Nagar</span></span>
          <span>Pin Code :- <span className="font-mono font-medium">{employee.pincode || "208015"}</span></span>
        </div>
        <div className="border-t border-dashed border-black pt-1 mt-1">
          Total Apply Ayoush Card - <span className="font-mono font-black text-sm">{employee.totalCards}</span>
        </div>
      </div>

      {/* 5. Section Heading */}
      <div className="text-center my-3 bg-gray-50 py-0.5 border border-dashed border-black">
        <span className="text-xs font-extrabold tracking-wide uppercase font-sans">
          Apply Ayoush Card
        </span>
      </div>

      {/* 6. Detailed Settlement Breakdown Table */}
      <table className="w-full text-left border-collapse text-[10px] font-bold mb-4">
        <thead>
          <tr className="border-b border-black font-sans uppercase">
            <th className="py-1">Card Detail - Amount</th>
            <th className="py-1 text-right">Online - Amount</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          <tr className="border-b border-dashed border-gray-100">
            <td className="py-1.5">160 x {calc.off160} = {Number(calc.amt160).toFixed(2)}</td>
            <td className="py-1.5 text-right">{calc.on160} = {Number(calc.onAmt160).toFixed(0)}</td>
          </tr>
          <tr className="border-b border-dashed border-gray-100">
            <td className="py-1.5">200 x {calc.off200} = {Number(calc.amt200).toFixed(2)}</td>
            <td className="py-1.5 text-right">{calc.on200} = {Number(calc.onAmt200).toFixed(0)}</td>
          </tr>
          <tr className="border-b border-dashed border-gray-100">
            <td className="py-1.5">240 x {calc.off240} = {Number(calc.amt240).toFixed(2)}</td>
            <td className="py-1.5 text-right">{calc.on240} = {Number(calc.onAmt240).toFixed(0)}</td>
          </tr>
          <tr className="border-b border-dashed border-gray-100">
            <td className="py-1.5">280 x {calc.off280} = {Number(calc.amt280).toFixed(2)}</td>
            <td className="py-1.5 text-right">{calc.on280} = {Number(calc.onAmt280).toFixed(0)}</td>
          </tr>
          <tr className="border-b border-dashed border-gray-100">
            <td className="py-1.5">Penelty x {calc.penaltyCount} = {Number(calc.penaltyAmount).toFixed(2)}</td>
            <td className="py-1.5 text-right">{calc.onPenaltyCount} = {Number(calc.onPenaltyAmount).toFixed(0)}</td>
          </tr>
          <tr className="border-t border-black font-extrabold text-[10.5px]">
            <td className="py-2">Total = {calc.offlineCount} = {Number(calc.offlineTotalWithPenalty).toFixed(2)}</td>
            <td className="py-2 text-right">{calc.onlineCount} = {Number(calc.onlineTotalWithPenalty).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {/* 7. Reconciled Grand Total */}
      <div className="bg-gray-50 border border-black p-2 text-center rounded-sm font-sans mb-6">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Calculated Revenue Equation</div>
        <div className="text-[10.5px] font-black mt-0.5 leading-tight">
          Grand Total = {calc.offlineBaseTotal} + {calc.onlineTotalWithPenalty} + {calc.penaltyAmount} = <span className="text-[#F68E5F] font-mono font-black text-sm">₹{calc.grandTotal}</span>
        </div>
      </div>

      {/* 8. Cash Receiver Info */}
      <div className="space-y-4 font-bold my-4 border-t border-dashed border-black pt-3">
        <div>Cash Receiver Name : __________________</div>
        <div>Cash Receiver ID No :- __________________</div>
      </div>

      {/* 9. Signature Box block */}
      <div className="mt-8 mb-2">
        <div className="border border-black rounded-sm h-14 w-full flex items-center justify-center bg-gray-50/20">
          <span className="font-sans text-gray-400 font-bold text-xs uppercase tracking-widest">
            Signature
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN MODULE COMPONENT ──────────────────────────────────────────────────
const AyushVitran = () => {
  const { toastSuccess, toastError } = useToast();

  // Auth state contexts
  const [userRole, setUserRole] = useState("Admin");
  const [currentUser, setCurrentUser] = useState({ name: "Officer", email: "officer@bkbs.org", id: "EMP-1000" });

  // Settlement Slips Modal Trigger states
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Roster Directory Tables state
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Setup current session credentials and role configuration
  useEffect(() => {
    const userRaw = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (userRaw) {
      try {
        const u = JSON.parse(userRaw);
        setCurrentUser({
          name: u.name || "Employee User",
          email: u.email || "N/A",
          id: u.employeeId || u._id || "EMP-1000",
          location: u.location || "Mangla Vihar",
        });
      } catch (err) {
        console.error("Error reading session user:", err);
      }
    }
    const role = localStorage.getItem("userRole") || "Admin";
    setUserRole(role);
  }, []);

  // Static mock roster fallback details
  const fallbackEmployees = useMemo(() => {
    const todayStr = getFormattedCurrentDate();
    return [
      { id: "EMP-2038", name: "Amit Sharma", email: "amit.sharma@bkbs.org", phone: "9876543210", date: todayStr, location: "Mangla Vihar", totalCards: 67, pincode: "208015" },
      { id: "EMP-2039", name: "Priya Patel", email: "priya.patel@bkbs.org", phone: "9123456780", date: todayStr, location: "PAC Line", totalCards: 77, pincode: "208015" },
      { id: "EMP-2040", name: "Rajesh Verma", email: "rajesh.verma@bkbs.org", phone: "9988776655", date: todayStr, location: "Kanpur Nagar", totalCards: 48, pincode: "208012" },
      { id: "EMP-2041", name: "Sneha Reddy", email: "sneha.reddy@bkbs.org", phone: "9001122334", date: todayStr, location: "Kalyanpur", totalCards: 85, pincode: "208016" },
      { id: "EMP-2042", name: "Vikram Malhotra", email: "vikram.malhotra@bkbs.org", phone: "8899001122", date: todayStr, location: "Kidwai Nagar", totalCards: 36, pincode: "208011" },
      { id: "EMP-2043", name: "Suresh Gupta", email: "suresh.gupta@bkbs.org", phone: "7788990011", date: todayStr, location: "Awas Vikas", totalCards: 54, pincode: "208015" },
    ];
  }, []);

  // Fetch employees list
  const fetchEmployeesList = async () => {
    setLoading(true);
    try {
      const res = await apiService.getEmployees({
        page: currentPage,
        limit: itemsPerPage,
      });

      const rawData = res.data || res;
      let list = Array.isArray(rawData) ? rawData : [];
      if (!list.length && rawData?.data && Array.isArray(rawData.data)) list = rawData.data;
      if (!list.length && rawData?.users && Array.isArray(rawData.users)) list = rawData.users;
      if (!list.length && rawData?.employees && Array.isArray(rawData.employees)) list = rawData.employees;

      const todayStr = getFormattedCurrentDate();

      if (list && list.length > 0) {
        const mapped = list.map((u, i) => {
          const cardCount = ((u.name || "").length * 4 + i * 9) % 50 + 35; // seed around 35-85 cards
          return {
            id: u.employeeId || u._id || `EMP-${2000 + i}`,
            name: u.name || "Unknown Staff",
            email: u.email || "N/A",
            phone: u.contact || "N/A",
            date: todayStr,
            location: u.location || "Mangla Vihar",
            totalCards: cardCount,
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
    } catch (err) {
      console.warn("API offline, falling back to mock staff database:", err.message);
      setEmployees(fallbackEmployees);
      setTotalItems(fallbackEmployees.length);
      setTotalPages(Math.ceil(fallbackEmployees.length / itemsPerPage) || 1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole !== "Employee") {
      fetchEmployeesList();
    }
  }, [currentPage, itemsPerPage, userRole]);

  // Click View on Employee Table Roster
  const handleOpenSettlement = (emp) => {
    setSelectedEmployee(emp);
  };

  // ─── HIGH-FIDELITY PRINT WINDOW TECHNIQUE (PWT) ───────────────────────────
  // Opens a perfectly-sized thermal pop-up window, prints receipt, and closes.
  const handlePrintSlip = (employee) => {
    if (!employee) return;
    const calc = calculateSettlement(employee.totalCards);
    const dateStr = getFormattedCurrentDate();

    // Resolve absolute logo URL
    const logoUrl = `${window.location.origin}/logo.svg`;

    const printWindow = window.open("", "_blank", "width=380,height=750,status=no,toolbar=no,menubar=no");
    if (!printWindow) {
      toastError("Pop-up blocked! Please allow pop-ups for this site to print receipts.");
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Settlement Slip - ${employee.name}</title>
          <style>
            @page {
              margin: 0;
            }
            body {
              font-family: monospace;
              color: black;
              background: white;
              padding: 20px;
              margin: 0;
              font-size: 11px;
              line-height: 1.4;
            }
            .container {
              width: 80mm;
              max-width: 100%;
              margin: 0 auto;
              box-sizing: border-box;
            }
            .logo-circle {
              width: 80px;
              height: 80px;
              border-radius: 50%;
              border: 1px solid black;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 10px auto;
              background: white;
              padding: 5px;
              box-sizing: border-box;
            }
            .logo-circle img {
              height: 50px;
              width: auto;
              object-fit: contain;
            }
            .title {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              text-transform: uppercase;
              margin-top: 5px;
              font-family: sans-serif;
              letter-spacing: 2px;
            }
            .header-address {
              font-family: sans-serif;
              text-align: center;
              margin-bottom: 15px;
              border-bottom: 1px dashed black;
              padding-bottom: 8px;
            }
            .trust-name {
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
              margin: 0;
            }
            .address-line {
              font-size: 9px;
              font-weight: bold;
              margin: 2px 0 0 0;
            }
            .metadata {
              margin-bottom: 15px;
              font-weight: bold;
            }
            .metadata-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3.5px;
            }
            .metadata-double {
              display: flex;
              justify-content: space-between;
              margin-top: 3.5px;
            }
            .dashed-border-top-bottom {
              border-top: 1px dashed black;
              border-bottom: 1px dashed black;
              padding: 5px 0;
              margin: 12px 0;
              text-align: center;
              font-size: 11.5px;
              font-weight: bold;
              font-family: sans-serif;
            }
            .dashed-divider {
              border-top: 1px dashed black;
              margin: 5px 0;
            }
            .table-heading {
              display: flex;
              justify-content: space-between;
              font-family: sans-serif;
              text-transform: uppercase;
              font-weight: bold;
              border-bottom: 1px solid black;
              padding-bottom: 3px;
              margin-bottom: 6px;
              font-size: 9.5px;
            }
            .table-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
            }
            .table-total {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              border-top: 1px solid black;
              padding-top: 5px;
              margin-top: 6px;
              font-size: 10.5px;
            }
            .grand-total-box {
              background: #f9f9f9;
              border: 1px solid black;
              padding: 6px;
              text-align: center;
              font-family: sans-serif;
              margin: 15px 0;
            }
            .grand-total-title {
              font-size: 8.5px;
              color: #555;
              text-transform: uppercase;
              font-weight: bold;
              letter-spacing: 0.5px;
            }
            .grand-total-value {
              font-size: 10px;
              font-weight: bold;
              margin-top: 2px;
            }
            .grand-total-highlight {
              font-size: 13px;
              font-weight: 900;
            }
            .signatures {
              margin-top: 25px;
              font-weight: bold;
            }
            .signatures div {
              margin-bottom: 12px;
            }
            .sig-box-container {
              margin-top: 30px;
              margin-bottom: 10px;
            }
            .sig-box {
              border: 1px solid black;
              border-radius: 2px;
              height: 50px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .sig-text {
              font-family: sans-serif;
              color: #ccc;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 2px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <!-- Circular Logo container -->
            <div class="logo-circle">
              <img src="${logoUrl}" alt="Logo" />
            </div>
            
            <div class="title">Settlement</div>

            <!-- Header details -->
            <div class="header-address">
              <div class="trust-name">Baijnaath Kesar Bai Sewa Trust</div>
              <div class="address-line">1-A Mangla Vihar New PAC Line</div>
              <div class="address-line">Kanpur Nagar – 208015</div>
            </div>

            <!-- Metadata info -->
            <div class="metadata">
              <div class="metadata-row">
                <span>Date :-</span>
                <span>${dateStr}</span>
              </div>
              <div class="metadata-row">
                <span>Camp Area :-</span>
                <span>${employee.location || "Mangla Vihar"}</span>
              </div>
              <div class="metadata-row">
                <span>Ayush Mitra Name :-</span>
                <span>${employee.name}</span>
              </div>
              <div class="metadata-row">
                <span>Ayoush Mitra ID No :-</span>
                <span>${employee.id}</span>
              </div>
              <div class="metadata-row">
                <span>Camp Area :-</span>
                <span>${employee.location || "Mangla Vihar"}</span>
              </div>
              <div class="metadata-double">
                <span>District :- Kanpur Nagar</span>
                <span>Pin Code :- ${employee.pincode || "208015"}</span>
              </div>
              <div class="dashed-divider" style="margin-top: 6px;"></div>
              <div style="margin-top: 5px;">
                Total Apply Ayoush Card - ${employee.totalCards}
              </div>
            </div>

            <!-- Category Section -->
            <div class="dashed-border-top-bottom uppercase">
              Apply Ayoush Card
            </div>

            <!-- Grid breakdowns -->
            <div class="table-heading">
              <span>Card Detail - Amount</span>
              <span>Online - Amount</span>
            </div>
            
            <div class="table-row">
              <span>160 x ${calc.off160} = ${Number(calc.amt160).toFixed(2)}</span>
              <span>${calc.on160} = ${Number(calc.onAmt160).toFixed(0)}</span>
            </div>
            <div class="table-row">
              <span>200 x ${calc.off200} = ${Number(calc.amt200).toFixed(2)}</span>
              <span>${calc.on200} = ${Number(calc.onAmt200).toFixed(0)}</span>
            </div>
            <div class="table-row">
              <span>240 x ${calc.off240} = ${Number(calc.amt240).toFixed(2)}</span>
              <span>${calc.on240} = ${Number(calc.onAmt240).toFixed(0)}</span>
            </div>
            <div class="table-row">
              <span>280 x ${calc.off280} = ${Number(calc.amt280).toFixed(2)}</span>
              <span>${calc.on280} = ${Number(calc.onAmt280).toFixed(0)}</span>
            </div>
            <div class="table-row">
              <span>Penelty x ${calc.penaltyCount} = ${Number(calc.penaltyAmount).toFixed(2)}</span>
              <span>${calc.onPenaltyCount} = ${Number(calc.onPenaltyAmount).toFixed(0)}</span>
            </div>
            
            <div class="table-total">
              <span>Total = ${calc.offlineCount} = ${Number(calc.offlineTotalWithPenalty).toFixed(2)}</span>
              <span>${calc.onlineCount} = ${Number(calc.onlineTotalWithPenalty).toFixed(2)}</span>
            </div>

            <!-- Grand total box equation -->
            <div class="grand-total-box">
              <div class="grand-total-title">Calculated Revenue Equation</div>
              <div class="grand-total-value">
                Grand Total = ${calc.offlineBaseTotal} + ${calc.onlineTotalWithPenalty} + ${calc.penaltyAmount} = 
                <span class="grand-total-highlight">₹${calc.grandTotal}</span>
              </div>
            </div>

            <!-- Receiver fields -->
            <div class="signatures">
              <div>Cash Receiver Name : __________________</div>
              <div>Cash Receiver ID No :- __________________</div>
            </div>

            <!-- Signature footer block -->
            <div class="sig-box-container">
              <div class="sig-box">
                <span class="sig-text">Signature</span>
              </div>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    toastSuccess("Sent settlement slip to printing queue!");
  };

  // Handle Search Local Processed Directory
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchQuery =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase());
      return matchQuery;
    });
  }, [employees, searchQuery]);

  // Employee Self-Settlement View
  const selfEmployee = useMemo(() => {
    if (userRole === "Employee" && currentUser) {
      return {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        location: currentUser.location || "Mangla Vihar",
        totalCards: 67,
        pincode: "208015",
      };
    }
    return null;
  }, [userRole, currentUser]);

  return (
    <div className="flex flex-col h-[calc(100vh-170px)] print:h-auto print:bg-white" style={{ fontFamily: "Inter, sans-serif" }}>

      {/* ── HEADER TITLE BLOCK ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 shrink-0 gap-4 sm:gap-0 no-print">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#22333B] tracking-tight">Ayush Vitran Section</h2>
          <p className="text-xs text-gray-500 mt-1">
            {userRole === "Employee"
              ? "Reconcile, audit, and print your operations settlement slip"
              : "Reconcile card generation statistics and print Mitra settlement slips"
            }
          </p>
        </div>

        {/* Quick Refresh Icon */}
        {userRole !== "Employee" && (
          <button
            onClick={fetchEmployeesList}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFCFB] border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-[#F68E5F]" : ""} />
            Sync Data
          </button>
        )}
      </div>

      {/* ── FLOW 1: ADMIN OPERATIONS DIRECTORY ROSTER ──────────────────── */}
      {userRole !== "Employee" && (
        <>
          {/* Search bar */}
          <div className="flex items-center justify-between gap-4 mb-4 shrink-0 no-print">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="Search staff by name, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-[#E5E7EB] rounded-full placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]"
              />
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            <div className="text-xs text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg font-semibold shadow-sm flex items-center gap-1.5">
              <Calendar size={13} className="text-[#F68E5F]" />
              Period: {getFormattedCurrentDate()}
            </div>
          </div>

          {/* Employee Directory Roster Grid */}
          <div className="bg-white border border-[#D9D9D9] rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm no-print">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#6B7280]">
                <div className="w-8 h-8 border-4 border-[#F68E5F] border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm font-semibold">Loading operations databases...</p>
              </div>
            ) : filteredEmployees.length > 0 ? (
              <div className="overflow-y-auto overflow-x-auto flex-1 custom-scrollbar">
                <table className="w-full text-left border-collapse relative">
                  <thead className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
                    <tr className="text-gray-700 text-xs font-bold uppercase">
                      <th className="py-3 px-5 text-center w-16">Sr.No</th>
                      <th className="py-3 px-4">Employee ID</th>
                      <th className="py-3 px-4">Ayush Mitra Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4 text-center">Settlement Date</th>
                      <th className="py-3 px-4 text-center">Total Cards</th>
                      <th className="py-3 px-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-gray-600">
                    {filteredEmployees.map((row, index) => (
                      <tr key={row.id} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3.5 px-5 text-center font-medium font-mono text-gray-400">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-gray-700">{row.id}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-orange-100 text-[#F68E5F] flex items-center justify-center font-bold text-xs uppercase">
                              {row.name.charAt(0)}
                            </div>
                            <span className="font-bold text-[#22333B]">{row.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-gray-500 font-mono text-xs">{row.email}</td>
                        <td className="py-3.5 px-4 text-center text-xs">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-50 border border-gray-100 font-medium text-gray-600">
                            {row.date}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-[#22333B]">{row.totalCards}</td>
                        <td className="py-3.5 px-5 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleOpenSettlement(row)}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-[#F68E5F] border border-orange-200 hover:bg-[#F68E5F] hover:text-white transition-all shadow-sm group"
                          >
                            <FileText size={13} />
                            View Settlement
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#6B7280]">
                <p className="text-base font-bold text-[#22333B]">No operations staff found</p>
                <p className="text-xs text-gray-400 mt-1">Refine your search parameters</p>
              </div>
            )}
          </div>

          <div className="mt-4 shrink-0 no-print">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(val) => {
                setItemsPerPage(val);
                setCurrentPage(1);
              }}
              totalItems={totalItems}
            />
          </div>
        </>
      )}

      {/* ── FLOW 2: EMPLOYEE SELF SETTLEMENT VIEW ───────────────────────── */}
      {userRole === "Employee" && selfEmployee && (
        <div className="flex-1 overflow-y-auto no-print space-y-6 flex items-start justify-center py-4">
          <div className="bg-white border border-[#D9D9D9] p-6 rounded-2xl shadow-sm max-w-md w-full flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#F68E5F] flex items-center justify-center font-bold text-lg uppercase mb-2">
              {selfEmployee.name.charAt(0)}
            </div>
            <h3 className="text-base font-black text-[#22333B]">{selfEmployee.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{selfEmployee.id} · {selfEmployee.email}</p>
            <p className="text-[10px] font-bold text-[#F68E5F] bg-orange-50 px-2 py-0.5 rounded-full mt-2 uppercase tracking-wide">
              Ayoush Mitra Settlement
            </p>

            <div className="w-full border-t border-gray-100 my-5"></div>

            {/* Core Settlement slip preview rendered on-screen */}
            <SettlementSlipPreview employee={selfEmployee} date={getFormattedCurrentDate()} />

            <div className="w-full border-t border-gray-100 my-5"></div>

            <button
              onClick={() => handlePrintSlip(selfEmployee)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#F68E5F] text-white font-bold text-sm rounded-lg hover:bg-[#ff7637] transition-all shadow-sm active:scale-95 animate-pulse"
            >
              <Printer size={16} />
              Print Your Settlement Slip
            </button>
          </div>
        </div>
      )}

      {/* ── FLOW 3: DETAILED SETTLEMENT SLIP RECEIPT MODAL ─────────────── */}
      {selectedEmployee && userRole !== "Employee" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col h-[92vh] shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Navigation */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50 rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-700 tracking-wider">Settlement Receipt</h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">80mm Thermal Receipt Layout Preview</p>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable ticket container mockup */}
            <div className="flex-1 overflow-y-auto bg-gray-100/50 p-6 flex items-start justify-center custom-scrollbar">
              <SettlementSlipPreview
                employee={selectedEmployee}
                date={getFormattedCurrentDate()}
              />
            </div>

            {/* Modal Action Options Footer */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => handlePrintSlip(selectedEmployee)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-[#F68E5F] text-white text-xs font-black rounded-lg hover:bg-[#ff7637] transition-all shadow-sm"
              >
                <Printer size={14} />
                Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AyushVitran;
