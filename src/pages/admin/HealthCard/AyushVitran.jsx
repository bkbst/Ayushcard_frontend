import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, X, CreditCard, Copy, Check,
  Wifi, Banknote, Clock, Loader2,
  Receipt, ClipboardList, Eye, Trash2, FileText, PackageCheck
} from "lucide-react";
import apiService from "../../../api/service";
import { useToast } from "../../../components/ui/Toast";
import Pagination from "../../../components/ui/Pagination";
import {
  normalizeHealthCard,
  parseHealthCardsResponse,
} from "../../../utils/healthCardUtils";

// Import modular components
import StatTile from "./components/StatTile";
import DuplicateReceiptModal from "./components/DuplicateReceiptModal";
import ViewPenaltyModal from "./components/ViewPenaltyModal";
import VitranModal from "./components/VitranModal";
import ViewVitranModal from "./components/ViewVitranModal";
import {
  PENALTY_AMOUNT,
  toDupCardShape,
} from "./components/vitranUtils";

const VITRAN_STORAGE_KEY = "ayush_vitran_records";

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const AyushVitran = () => {
  const { toastSuccess } = useToast();
  const [activeTab, setActiveTab] = useState("receipts");

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
  const [selectedCardForVitran, setSelectedCardForVitran] = useState(null);
  const [viewingVitran, setViewingVitran] = useState(null);
  // Map of employeeId -> name for display
  const [createdByMap, setCreatedByMap] = useState({});

  // Vitran (distribution) records
  const [vitranRecords, setVitranRecords] = useState([]);

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
    if (activeTab === "receipts" || activeTab === "exported") {
      fetchExportedCards();
    }
  }, [activeTab, exportedPage, exportedItemsPerPage, debouncedCardSearch, fetchExportedCards]);

  // Load vitran records from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(VITRAN_STORAGE_KEY) || "[]");
      setVitranRecords(stored);
    } catch {
      setVitranRecords([]);
    }
  }, []);

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

  // Delete duplicate receipt from localStorage
  const deleteDupReceipt = useCallback((receiptNo) => {
    setDupReceipts(prev => {
      const updated = prev.filter(r => r.receiptNo !== receiptNo);
      try { localStorage.setItem("ayush_dup_receipts", JSON.stringify(updated)); } catch { }
      return updated;
    });
    toastSuccess("Duplicate receipt deleted successfully");
  }, [toastSuccess]);

  const saveVitranRecord = useCallback((record) => {
    setVitranRecords((prev) => {
      const filtered = prev.filter((r) => r.cardId !== record.cardId);
      const updated = [record, ...filtered];
      try { localStorage.setItem(VITRAN_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const vitranMap = useMemo(() => {
    const map = {};
    vitranRecords.forEach((r) => { map[r.cardId] = r; });
    return map;
  }, [vitranRecords]);

  const distributedCount = vitranRecords.length;
  const pendingVitranCount = Math.max(0, (exportedTotalItems || exportedCards.length) - distributedCount);

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

  const TABS = useMemo(() => [
    { id: "receipts", label: "Receipts", Icon: FileText },
    { id: "exported", label: "Penalty", Icon: CreditCard },
    { id: "duplicates", label: "Duplicate Receipts", Icon: Receipt },
  ], []);

  return (
    <div className="flex flex-col h-[calc(100vh-170px)] print:h-auto" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3 no-print">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#22333B] tracking-tight">Ayush Vitran</h2>
          <p className="text-xs text-gray-500 mt-0.5">Receipt management, card tracking & duplicate receipt issuance</p>
        </div>
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

      {/* ═══ TAB: RECEIPTS (VITRAN) ═══ */}
      {activeTab === "receipts" && (
        <div className="flex flex-col flex-1 min-h-0 no-print">
          <div className="flex overflow-x-auto scrollbar-none flex-nowrap sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 pb-1 shrink-0 w-full">
            <StatTile icon={CreditCard} label="Total Cards" value={exportedTotalItems || exportedCards.length} color="bg-blue-100 text-blue-600" bg="bg-blue-50 border-blue-100" />
            <StatTile icon={PackageCheck} label="Distributed" value={distributedCount} color="bg-green-100 text-green-600" bg="bg-green-50 border-green-100" />
            <StatTile icon={Clock} label="Pending Vitran" value={pendingVitranCount} color="bg-amber-100 text-amber-600" bg="bg-amber-50 border-amber-100" />
            <StatTile icon={Receipt} label="Dup. Receipts" value={dupReceipts.length} color="bg-orange-100 text-[#F68E5F]" bg="bg-orange-50 border-orange-100" />
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
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 px-3 py-2 border border-gray-200 rounded-xl bg-white flex items-center gap-1 shadow-sm">
                <X size={12} /> Clear
              </button>
            )}
            <span className="text-xs text-gray-400 font-semibold sm:ml-auto w-full sm:w-auto text-right">
              {exportedTotalItems > 0 ? `${exportedTotalItems} total` : `${filteredCards.length} cards`}
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm">
            {exportedLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-400">
                <Loader2 size={28} className="animate-spin text-[#F68E5F] mb-3" />
                <p className="text-sm font-semibold">Loading cards...</p>
              </div>
            ) : (
              <div className="overflow-y-auto overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[780px]">
                  <thead className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
                    <tr className="text-gray-500 text-[11px] font-bold uppercase tracking-wide">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Card ID</th>
                      <th className="py-3 px-4">Client Name</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Ayush Mitra</th>
                      <th className="py-3 px-4 text-center">Amount</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((card, i) => {
                      const vitran = vitranMap[card.id];
                      const isDistributed = Boolean(vitran);
                      return (
                        <tr key={card.id || i} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                          <td className="py-3 px-4 text-sm text-[#22333B]">{i + 1}</td>
                          <td className="py-3 px-4 text-sm text-[#22333B] whitespace-nowrap font-mono">{card.id}</td>
                          <td className="py-3 px-4 text-sm text-[#22333B] whitespace-nowrap">{card.clientName}</td>
                          <td className="py-3 px-4 text-sm text-[#22333B] whitespace-nowrap">{card.mobile}</td>
                          <td className="py-3 px-4 text-sm text-[#22333B] whitespace-nowrap">{card.employeeName || "—"}</td>
                          <td className="py-3 px-4 text-sm text-[#22333B] text-center whitespace-nowrap">₹{Number(card.amount || 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isDistributed ? "bg-green-50 text-green-600 border-green-100" : "bg-amber-50 text-amber-600 border-amber-100"}`}>
                              {isDistributed ? <><Check size={9} /> Distributed</> : <><Clock size={9} /> Pending</>}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isDistributed ? (
                                <button onClick={() => setViewingVitran(vitran)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-green-50 text-green-600 border border-green-100 hover:bg-green-500 hover:text-white transition-all shadow-sm">
                                  <Eye size={11} /> View
                                </button>
                              ) : (
                                <button onClick={() => setSelectedCardForVitran(card)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-orange-50 text-[#F68E5F] border border-orange-100 hover:bg-[#F68E5F] hover:text-white transition-all shadow-sm">
                                  <PackageCheck size={11} /> Vitran
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredCards.length === 0 && !exportedLoading && (
                      <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm font-medium">No cards found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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

      {/* ═══ TAB: PENALTY RECEIPTS ═══ */}
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
                <p className="text-xs text-gray-400 mt-1">Go to "Penalty Receipts" tab and click "Duplicate" to issue one</p>
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
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => setViewingReceipt(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-100 hover:bg-purple-500 hover:text-white transition-all shadow-sm">
                              <Eye size={11} /> View
                            </button>
                            <button onClick={() => deleteDupReceipt(rec.receiptNo)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
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

      {/* ═══ VITRAN MODAL ═══ */}
      {selectedCardForVitran && (
        <VitranModal
          card={selectedCardForVitran}
          onClose={() => setSelectedCardForVitran(null)}
          onDistributed={(record) => {
            saveVitranRecord(record);
            setSelectedCardForVitran(null);
          }}
        />
      )}

      {viewingVitran && (
        <ViewVitranModal record={viewingVitran} onClose={() => setViewingVitran(null)} />
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
