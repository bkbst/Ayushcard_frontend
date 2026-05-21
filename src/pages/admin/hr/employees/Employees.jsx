import React, { useState, useMemo, useEffect } from "react";
import { Search, Eye, Trash2, Download, Plus, ArrowUpDown, Loader2, ChevronDown, X, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "../../../../utils/exportUtils";
import apiService from "../../../../api/service";
import { useToast } from "../../../../components/ui/Toast";
import Pagination from "../../../../components/ui/Pagination";

import { getEmployees } from "../../../../data/mockData";
import {
  downloadAllAyushCardsAsPdf,
  unwrapCardFromApiResponse,
} from "../../../../utils/downloadAyushCard";

/* ── Status badge for cards ────────────────────────────────────────── */
const CardStatusBadge = ({ status }) => {
  const map = {
    "Not verified": { bg: "bg-[#FFA10033]", dot: "bg-[#FFA100]", text: "text-[#FFA100]" },
    Verified: { bg: "bg-[#76DB1E33]", dot: "bg-[#76DB1E]", text: "text-[#76DB1E]" },
    Rejected: { bg: "bg-[#FF383C33]", dot: "bg-[#FF383C]", text: "text-[#FF383C]" },
    Expired: { bg: "bg-[#FF383C33]", dot: "bg-[#FF383C]", text: "text-[#FF383C]" },
  };
  const style = map[status] || { bg: "bg-gray-100", dot: "bg-gray-400", text: "text-gray-600" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-normal ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
      {status}
    </span>
  );
};

/* ── Normalise a raw card from API ─────────────────────────────────── */
const normalizeCard = (card) => {
  const totalCount = (Number(card.totalMembers ?? card.totalMember) || 0);

  return {
    ...card,
    id: card.applicationId || card._id || "",
    applicant: [card.firstName, card.middleName, card.lastName].filter(Boolean).join(" ") || "",
    phone: card.contact || "",
    pincode: card.pincode || "",
    totalMembers: totalCount,
    members: Array.isArray(card.members)
      ? card.members
      : Array.from({ length: totalCount }, (_, i) => ({ id: i })),
    payment: {
      totalPaid: card.totalAmount != null && card.totalAmount !== "" ? Number(card.totalAmount) : 0,
    },
  status: (() => {
    switch ((card.status || "").toLowerCase()) {
      case "approved": return "Verified";
      case "active": return "Verified";
      case "pending": return "Not verified";
      case "rejected": return "Rejected";
      case "expired": return "Expired";
      default: return card.status || "Not verified";
    }
  })(),
  };
};

/* ── Employee Cards Panel ──────────────────────────────────────────── */
const EmployeeCardsPanel = ({ employee, onClose }) => {
  const { toastSuccess, toastWarn, toastError } = useToast();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cardsPage, setCardsPage] = useState(1);
  const [cardsPerPage, setCardsPerPage] = useState(10);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [cardsTotalPages, setCardsTotalPages] = useState(1);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState("");

  const employeeMongoId = employee?._rawId || employee?.id;

  const fetchFullCardRecord = async (listCard) => {
    const id = listCard._id || listCard.applicationId;
    if (!id) return null;
    try {
      const res = await apiService.getHealthCardById(id);
      return unwrapCardFromApiResponse(res);
    } catch {
      return null;
    }
  };

  const downloadOptions = {
    fetchCardById: fetchFullCardRecord,
    fetchMembers: (cardId) => apiService.getCardMembers(cardId),
  };

  const fetchAllEmployeeCards = async () => {
    const all = [];
    let page = 1;
    let totalPages = 1;
    const limit = 50;

    do {
      const res = await apiService.getHealthCardsByEmployee(employeeMongoId, {
        page,
        limit,
      });
      const envelope = res?.data && typeof res.data === "object" ? res.data : res;
      const raw = Array.isArray(envelope?.cards)
        ? envelope.cards
        : Array.isArray(res?.data?.cards)
          ? res.data.cards
          : [];
      const pagination = envelope?.pagination || res?.data?.pagination || {};
      totalPages = Number(
        pagination.pages ?? (Math.ceil((pagination.total ?? raw.length) / limit) || 1),
      );
      all.push(...raw.map(normalizeCard));
      page += 1;
    } while (page <= totalPages);

    return all;
  };

  const handleDownloadAllAyushCards = async () => {
    if (!employeeMongoId || String(employeeMongoId).startsWith("EMP-")) {
      toastWarn("Cannot download — employee has no server id.");
      return;
    }
    setDownloadingAll(true);
    setDownloadAllProgress("Loading cards…");
    try {
      const allCards = await fetchAllEmployeeCards();
      if (allCards.length === 0) {
        toastWarn("No Ayush cards to download.");
        return;
      }

      const safeName = String(employee.name || "employee")
        .replace(/[^\w]+/g, "_")
        .slice(0, 40);

      await downloadAllAyushCardsAsPdf(
        allCards,
        {
          ...downloadOptions,
          fileName: `${safeName}_all_ayush_cards`,
        },
        (current, total, phase) => {
          if (phase === "loading") {
            setDownloadAllProgress(`Loading card data ${current} of ${total}…`);
          } else {
            setDownloadAllProgress(`Rendering cards ${current} of ${total}…`);
          }
        },
      );

      toastSuccess(
        `Downloaded ${allCards.length} Ayush Card${allCards.length !== 1 ? "s" : ""} (front & back) in one PDF.`,
      );
    } catch (err) {
      console.error("Download all Ayush cards failed:", err);
      toastError(err?.message || "Failed to download all Ayush Cards.");
    } finally {
      setDownloadingAll(false);
      setDownloadAllProgress("");
    }
  };

  useEffect(() => {
    setCardsPage(1);
  }, [employeeMongoId]);

  useEffect(() => {
    const fetchCards = async () => {
      if (!employeeMongoId || String(employeeMongoId).startsWith("EMP-")) {
        setCards([]);
        setCardsTotal(0);
        setCardsTotalPages(1);
        setLoading(false);
        setError(
          String(employeeMongoId || "").startsWith("EMP-")
            ? "This row has no server ID — cards cannot be loaded."
            : "Missing employee id.",
        );
        return;
      }
      try {
        setLoading(true);
        setError("");
        const res = await apiService.getHealthCardsByEmployee(employeeMongoId, {
          page: cardsPage,
          limit: cardsPerPage,
        });

        const envelope = res?.data && typeof res.data === "object" ? res.data : res;
        const raw = Array.isArray(envelope?.cards)
          ? envelope.cards
          : Array.isArray(res?.data?.cards)
            ? res.data.cards
            : [];

        const pagination = envelope?.pagination || res?.data?.pagination || {};
        const total = Number(pagination.total ?? raw.length);
        const pages = Number(pagination.pages ?? (Math.ceil(total / cardsPerPage) || 1));

        setCardsTotal(total);
        setCardsTotalPages(pages);
        setCards(raw.map(normalizeCard));
      } catch (err) {
        console.error("Failed to fetch employee cards:", err);
        setError(err?.response?.data?.message || "Could not load cards for this employee.");
        setCards([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCards();
  }, [employeeMongoId, cardsPage, cardsPerPage]);

  const memberLabel = (card) => {
    const n = Number(card.totalMembers) || (Array.isArray(card.members) ? card.members.length : 0);
    return `${n} member${n !== 1 ? "s" : ""}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#22333B]">Cards by {employee.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {employee.id} · {employee.email}
            </p>
            {downloadAllProgress && (
              <p className="text-xs text-[#F68E5F] mt-1 font-medium">{downloadAllProgress}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadAllAyushCards}
              disabled={downloadingAll || loading || cards.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#F68E5F] text-white hover:bg-[#ff7535] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {downloadingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Download All
            </button>
            <button
              onClick={onClose}
              disabled={downloadingAll}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin text-[#F68E5F] mb-3" />
              <p className="text-sm text-gray-500">Loading cards…</p>
            </div>
          ) : error ? (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm">
              {error}
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CreditCard size={28} className="text-gray-400" />
              </div>
              <p className="text-base font-semibold text-[#22333B]">No cards found</p>
              <p className="text-sm text-gray-500 mt-1">This employee hasn't created any Ayush cards yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4 font-medium">
                {cardsTotal} card{cardsTotal !== 1 ? "s" : ""} total
                {cardsTotalPages > 1 ? ` · Page ${cardsPage} of ${cardsTotalPages}` : ""}
              </p>
              {cards.map((card, idx) => (
                <div
                  key={card._id || idx}
                  className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-mono text-[#F68E5F] font-medium truncate">
                        {card.id}
                      </span>
                      <CardStatusBadge status={card.status} />
                    </div>
                    <p className="text-[14px] font-semibold text-[#22333B] truncate">
                      {card.applicant || "—"}
                    </p>
                    <div className="flex items-center gap-4 mt-1.5 text-[12px] text-gray-500 flex-wrap">
                      {card.phone && <span>📞 {card.phone}</span>}
                      {card.pincode && <span>📍 {card.pincode}</span>}
                      <span>👥 {memberLabel(card)}</span>
                      <span>₹{Number(card.payment?.totalPaid ?? 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {cardsTotal > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <Pagination
                    currentPage={cardsPage}
                    totalPages={cardsTotalPages}
                    onPageChange={setCardsPage}
                    itemsPerPage={cardsPerPage}
                    onItemsPerPageChange={(val) => {
                      setCardsPerPage(val);
                      setCardsPage(1);
                    }}
                    totalItems={cardsTotal}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Action Buttons ────────────────────────────────────────────────── */
const ActionButtons = ({ item, navigate, onDelete, onViewCards }) => {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onViewCards(item)}
        title="View cards by this employee"
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#F0F7FF] text-[#2563EB] hover:bg-[#DBEAFE] transition-colors border border-[#BFDBFE]"
      >
        <CreditCard size={14} />
        Cards
      </button>
      <button
        onClick={() => navigate(`/admin/hr/employees/${item._rawId || item.id}`)}
        title="View / Edit employee"
        className="text-[#F68E5F] hover:text-[#ff7535] cursor-pointer transition-colors p-1.5"
      >
        <Eye size={20} />
      </button>
      <button
        onClick={() => onDelete(item)}
        className="text-[#F68E5F] hover:text-[#ff7535] transition-colors p-1.5"
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
};

/* ── Main Component ────────────────────────────────────────────────── */
const Employees = () => {
  const navigate = useNavigate();
  const { toastWarn, toastSuccess, toastError } = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All"); // Keep for logic but UI removed
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [itemToDelete, setItemToDelete] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null); // for card panel
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchEmployees();
  }, [currentPage, itemsPerPage]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await apiService.getEmployees({
        page: currentPage,
        limit: itemsPerPage,
      });
      const rawData = res.data || res;

      let list = Array.isArray(rawData) ? rawData : [];
      if (!list.length && rawData?.data && Array.isArray(rawData.data)) list = rawData.data;
      if (!list.length && rawData?.users && Array.isArray(rawData.users)) list = rawData.users;
      if (!list.length && rawData?.employees && Array.isArray(rawData.employees)) list = rawData.employees;

      const mapped = list.map((u, i) => ({
        id: u.employeeId || u._id || `EMP-${1000 + i}`,
        name: u.name || "Unknown",
        phone: u.contact || "N/A",
        email: u.email || "N/A",
        dateOfJoining: u.dateOfJoining ? new Date(u.dateOfJoining).toLocaleDateString() : "N/A",
        location: u.location || "Unknown",
        pincode: u.pincode || "",
        status: u.status || "Verified",
        salary: u.salary ? u.salary.toString() : "0",
        workingHoursFrom: u.workStartTime || "10:00 AM",
        workingHoursTo: u.workEndTime || "6:00 PM",
        role: u.role || "Employee",
        _rawId: u._id,
      }));
      setEmployees(mapped.reverse());

      const pagination = res?.pagination || res?.data?.pagination || {};
      const total = pagination.total ?? res?.total ?? res?.count ?? res?.data?.total ?? mapped.length;
      const pages = pagination.pages ?? (Math.ceil(total / itemsPerPage) || 1);

      setTotalItems(Number(total));
      setTotalPages(Number(pages));
    } catch (err) {
      console.error("Fetch employees error:", err);
      setEmployees(getEmployees());
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      try {
        const targetId = itemToDelete._rawId || itemToDelete.id;
        if (!targetId.startsWith("EMP-")) {
          await apiService.deleteEmployee(targetId);
        } else {
          console.warn("Attempting to delete local mock employee", targetId);
        }
        const updatedData = employees.filter((d) => d.id !== itemToDelete.id);
        setEmployees(updatedData);
        localStorage.setItem("employees_data", JSON.stringify(updatedData));
        toastSuccess(`Employee "${itemToDelete.name}" deleted successfully.`);
      } catch (err) {
        console.error("Failed to delete employee:", err);
        toastError(err?.response?.data?.message || "Failed to delete employee. Please try again.");
      } finally {
        setSelectedRows([]);
        setItemToDelete(null);
      }
    }
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const processedData = useMemo(() => {
    let result = [...employees].filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.phone.includes(searchQuery);

      if (activeFilter === "All") return matchesSearch;
      return matchesSearch && item.status.toLowerCase() === activeFilter.toLowerCase();
    });

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key] ?? "";
        let bValue = b[sortConfig.key] ?? "";
        let comparison = 0;
        if (typeof aValue === "string" && typeof bValue === "string") {
          comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: "base" });
        } else {
          if (aValue < bValue) comparison = -1;
          else if (aValue > bValue) comparison = 1;
        }
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }
    return result;
  }, [employees, searchQuery, sortConfig, activeFilter]);

  // totalPages is now managed via state from backend response
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = processedData.length > itemsPerPage
    ? processedData.slice(startIndex, startIndex + itemsPerPage)
    : processedData;

  // renderPaginationButtons removed as it's now handled by the Pagination component.

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedRows(processedData.map((_, idx) => idx));
    else setSelectedRows([]);
  };

  const handleExport = () => {
    if (selectedRows.length === 0) {
      toastWarn("Please select at least one item to export.");
      return;
    }
    const dataToExport = selectedRows.map((index) => processedData[index]);
    exportToCSV(dataToExport, "Employees_Export.csv");
  };

  const handleSelectRow = (globalIndex) => {
    setSelectedRows((prev) =>
      prev.includes(globalIndex) ? prev.filter((i) => i !== globalIndex) : [...prev, globalIndex],
    );
  };

  const renderSortableHeader = (title, sortKey, align = "left", className = "") => (
    <th className={`py-3 px-4 text-sm font-semibold text-[#22333B] whitespace-nowrap ${className}`}>
      <div
        className={`flex items-center gap-1 cursor-pointer hover:text-gray-600 ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"
          }`}
        onClick={() => handleSort(sortKey)}
      >
        {title}
        <ArrowUpDown
          size={14}
          className={`shrink-0 ${sortConfig.key === sortKey ? "text-[#F68E5F]" : "text-[#22333B]"}`}
        />
      </div>
    </th>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-170px)]" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-4 sm:gap-0">
        <h2 className="text-xl font-bold text-[#22333B]">Employees</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={handleExport}
            className="px-4 py-1.5 border border-[#F68E5F] bg-[#FFFCFB] rounded-lg text-[15px] font-medium text-[#F68E5F] hover:bg-[#F68E5F] hover:text-[#FFFCFB] flex items-center gap-2 transition-colors"
          >
            Export <Download size={16} />
          </button>

          <button
            onClick={() => navigate("/admin/hr/employees/create")}
            className="flex lg:hidden px-4 py-1.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[15px] font-medium hover:bg-[#ff7535] transition-colors items-center gap-2"
          >
            Add New Employee <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center justify-between xl:flex-row flex-col gap-4 mb-4 shrink-0">
        <div className="flex items-center gap-4 flex-wrap flex-1 xl:flex-nowrap">
          {/* Search */}
          <div className="relative w-full xl:w-70">
            <input
              type="text"
              placeholder="Search by name, id, phone"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-4 pr-10 py-2.5 text-[16px] border border-[#E5E7EB] rounded-full text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]"
            />
            <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1E1E1E]" />
          </div>

          {/* Filter Tabs Removed per user request */}
        </div>

        {/* Create Button (Desktop only) */}
        <button
          onClick={() => navigate("/admin/hr/employees/create")}
          className="hidden lg:flex px-5 py-2.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[16px] font-medium hover:bg-[#ff7535] transition-colors items-center gap-2 whitespace-nowrap"
        >
          Add New Employee <Plus size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#D9D9D9] rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#6B7280]">
            <Loader2 size={32} className="animate-spin text-[#F68E5F] mb-4" />
            <p className="text-sm font-medium">Loading Employees...</p>
          </div>
        ) : paginatedData.length > 0 ? (
          <div className="overflow-y-auto overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse relative">
              <thead className="sticky top-0 z-10 bg-[#FFFFFF]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={processedData.length > 0 && selectedRows.length === processedData.length}
                      className="w-4 h-4 rounded border-[#D1D5DB] border text-[#22333B] focus:ring-[#111827]"
                    />
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-17.5 text-center">Sr.no</th>
                  {renderSortableHeader("EMP ID", "id", "left", "w-[120px]")}
                  {renderSortableHeader("Name", "name", "left", "min-w-[150px]")}
                  {renderSortableHeader("Phone", "phone", "left", "w-[130px]")}
                  {renderSortableHeader("Email", "email", "left", "w-[160px]")}
                  {renderSortableHeader("Date of Joining", "dateOfJoining", "left", "w-[150px]")}
                  {renderSortableHeader("Location", "location", "left", "w-[140px]")}
                  {renderSortableHeader("Pincode", "pincode", "left", "w-[110px]")}
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, index) => {
                  const globalIndex = startIndex + index;
                  const isChecked = selectedRows.includes(globalIndex);
                  return (
                    <tr key={globalIndex} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectRow(globalIndex)}
                          className="w-4 h-4 rounded border-[#D1D5DB] text-[#22333B] focus:ring-[#111827]"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] text-center">{globalIndex + 1}</td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] whitespace-nowrap">{row.id}</td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        <div className="max-w-[150px] truncate" title={row.name}>
                          {row.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] whitespace-nowrap">{row.phone}</td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] whitespace-nowrap">{row.email}</td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] whitespace-nowrap">{row.dateOfJoining}</td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] whitespace-nowrap">
                        <div
                          className="max-w-[140px] truncate"
                          title={row.location}
                        >
                          {row.location}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#4B5563] whitespace-nowrap">{row.pincode || "—"}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <ActionButtons
                          item={row}
                          navigate={navigate}
                          onDelete={setItemToDelete}
                          onViewCards={setSelectedEmployee}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#6B7280]">
            <p className="text-lg font-bold text-[#22333B] mb-1">No employee found</p>
          </div>
        )}
      </div>

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

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-100 shadow-lg animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-[#22333B]">Are you sure?</h3>
            </div>
            <p className="text-[#4B5563] text-sm mb-6 pl-12 line-clamp-3">
              Do you really want to delete the employee{" "}
              <strong>{itemToDelete.name}</strong> ({itemToDelete.id})? This process cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-sm font-medium hover:bg-[#ff702d] transition-colors shadow-sm"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Cards Slide-over Panel */}
      {selectedEmployee && (
        <EmployeeCardsPanel
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
};

export default Employees;
