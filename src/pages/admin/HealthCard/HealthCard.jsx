import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  Download,
  PlusCircle,
  ArrowUpDown,
  Loader2,
  RotateCw,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import apiService from "../../../api/service";
import { exportAyushCardApplicationsToExcel } from "../../../utils/exportUtils";
import {
  normalizeHealthCard,
  isApplicationCard,
  isVerifiedStatus,
  parseHealthCardsResponse,
  formatCardCreatedAt,
  getCardCreatedAt,
} from "../../../utils/healthCardUtils";
import { useToast } from "../../../components/ui/Toast";
import Pagination from "../../../components/ui/Pagination";
import ThemedDatePicker from "../../../components/ui/ThemedDatePicker";

const StatusBadge = ({ status, onStatusChange, isLoading }) => {
  let bg = "";
  let dot = "";
  let text = "";

  switch (status) {
    case "Not verified":
    case "pending":
      bg = "bg-[#FFA10033]";
      dot = "bg-[#FFA100]";
      text = "text-[#FFA100]";
      break;
    case "Verified":
    case "approved":
    case "active":
    case "Exported":
    case "exported":
      bg = "bg-[#76DB1E33]";
      dot = "bg-[#76DB1E]";
      text = "text-[#76DB1E]";
      break;
    case "Expired":
    case "expired":
    case "Rejected":
    case "rejected":
      bg = "bg-[#FF383C33]";
      dot = "bg-[#FF383C]";
      text = "text-[#FF383C]";
      break;
    default:
      bg = "bg-gray-100";
      dot = "bg-gray-400";
      text = "text-gray-600";
  }

  if (onStatusChange) {
    return (
      <div className="relative inline-flex items-center">
        <select
          value={status.toLowerCase() === "verified" ? "approved" : status.toLowerCase() === "not verified" ? "pending" : status.toLowerCase()}
          onChange={(e) => onStatusChange(e.target.value)}
          disabled={isLoading}
          className={`appearance-none cursor-pointer pl-6 pr-8 py-1 rounded-full text-xs font-normal border-none focus:outline-none focus:ring-0 ${bg} ${text} ${isLoading ? 'opacity-50' : ''}`}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${dot}`}></span>
        <svg
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 ${text}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-normal ${bg} ${text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
      {status}
    </span>
  );
};


const ActionButtons = ({ item, navigate, onDelete }) => {
  const isExpired = (item.status || "").toLowerCase().includes("expir");

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() =>
          navigate(`/admin/health-card/${item._id || item.id}`, {
            state: { editMode: true },
          })
        }
        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isExpired
          ? "bg-[#F68E5F] text-white hover:bg-[#ff7535]"
          : "bg-[#2C2C2C] text-[#FFFCFB] hover:bg-[#1F2937]"
          }`}
      >
        {isExpired ? "Renew" : "Edit"}
        {isExpired ? (
          <RotateCw size={14} className="animate-spin-once" />
        ) : (
          <img
            src="/admin_images/Edit 3.svg"
            alt="edit"
            className="w-3.5 h-3.5"
          />
        )}
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(`/admin/health-card/${item._id || item.id}`)}
          className="text-[#F68E5F] hover:text-[#ff6e2b] cursor-pointer transition-colors p-1.5"
        >
          <Eye size={20} />
        </button>
        <button
          onClick={() => onDelete(item)}
          className="text-[#F68E5F] hover:text-[#ff6e2b] transition-colors p-1.5"
        >
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
};

const HealthCard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toastWarn, toastSuccess } = useToast();

  const [healthCards, setHealthCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [itemToDelete, setItemToDelete] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [createdAt, setCreatedAt] = useState("");

  const [createdByMap, setCreatedByMap] = useState(() => ({}));

  const extractEmployeeFromResponse = (res) => {
    if (!res || typeof res !== "object") return null;
    const candidate =
      res?.data?.user ||
      res?.user ||
      res?.data?.data?.user ||
      res?.data?.user ||
      res?.data?.data ||
      res?.data ||
      res;

    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      candidate.user &&
      (candidate.user._id || candidate.user.employeeId || candidate.user.name)
    ) {
      return candidate.user;
    }

    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      (candidate._id || candidate.employeeId || candidate.name || candidate.email || candidate.contact)
    ) {
      return candidate;
    }

    return null;
  };

  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const resolveCreatedById = (raw) => {
    if (!raw) return "";
    if (typeof raw === "string") return raw;
    return raw?._id || raw?.id || raw?.userId || "";
  };

  const resolveCreatedByLabel = (card) => {
    const raw = card?.createdBy;
    if (!raw) return "—";
    if (typeof raw === "object" && raw != null) {
      const name =
        raw.name ||
        [raw.firstName, raw.middleName, raw.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
      return name || raw.employeeId || raw.email || raw.contact || raw._id || "—";
    }
    const id = resolveCreatedById(raw);
    return createdByMap[id] || id || "—";
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setCurrentPage(1);
      setSelectedRows([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchCards();
  }, [currentPage, itemsPerPage, search, activeFilter, createdAt, location.key]);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        (healthCards || [])
          .map((c) => resolveCreatedById(c?.createdBy))
          .filter(Boolean),
      ),
    );

    const missing = ids.filter((id) => !createdByMap[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          missing.map(async (id) => {
            try {
              const res = await apiService.getEmployeeById(String(id));
              const user = extractEmployeeFromResponse(res);
              const name =
                user?.name ||
                [user?.firstName, user?.middleName, user?.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
              const label = name || user?.employeeId || user?.email || user?.contact || String(id);
              return [id, label];
            } catch {
              return [id, String(id)];
            }
          }),
        );
        if (cancelled) return;
        setCreatedByMap((prev) => {
          const next = { ...prev };
          for (const [id, label] of results) next[id] = label;
          return next;
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [healthCards, createdByMap]);

  const fetchCards = async () => {
    try {
      setLoading(true);
      setFetchError("");
      const params = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (search) params.search = search;
      if (createdAt) params.createdAt = createdAt;
      params.sort = "-createdAt";
      if (activeFilter === "Not Verified") {
        params.status = "pending";
      } else if (activeFilter === "Verified") {
        params.status = "approved";
      } else if (activeFilter === "Exported") {
        params.status = "exported";
      } else if (activeFilter === "Rejected") {
        params.status = "rejected";
      } else if (activeFilter === "Expired") {
        params.status = "expired";
      }

      const res = await apiService.getHealthCards(params);
      const { raw, total, pages } = parseHealthCardsResponse(res);
      const allCards = raw.map(normalizeHealthCard);

      setHealthCards(allCards);
      setTotalItems(Number(total));
      setTotalPages(Number(pages ?? (Math.ceil(total / itemsPerPage) || 1)));
    } catch (err) {
      console.error(
        "[HealthCard] GET /api/cards failed:",
        err?.response?.data || err?.message,
      );
      setFetchError("Could not load cards from server.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const mongoId = itemToDelete._id || itemToDelete.id;
      await apiService.deleteHealthCard(mongoId);
      setHealthCards((prev) =>
        prev.filter(
          (c) => c._id !== itemToDelete._id && c.id !== itemToDelete.id,
        ),
      );
      setSelectedRows([]);
      setItemToDelete(null);
    } catch (err) {
      console.error(
        "[HealthCard] DELETE failed:",
        err?.response?.data || err?.message,
      );
      setDeleteError(
        err?.response?.data?.message ||
        err?.message ||
        "Delete failed. Please try again.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const [statusUpdateLoading, setStatusUpdateLoading] = useState(null);

  const handleStatusChange = async (id, newStatus) => {
    if (!id) return;
    setStatusUpdateLoading(id);
    try {
      await apiService.updateHealthCardStatus(id, newStatus);
      if (isVerifiedStatus(newStatus) || newStatus === "exported") {
        setHealthCards((prev) =>
          prev.filter((card) => card._id !== id && card.id !== id),
        );
        setSelectedRows([]);
        setTotalItems((t) => Math.max(0, t - 1));
        if (isVerifiedStatus(newStatus)) {
          toastSuccess("Card verified. It is now listed under Verified Cards.");
        }
      } else {
        setHealthCards((prev) =>
          prev.map((card) => {
            if (card._id === id || card.id === id) {
              return normalizeHealthCard({ ...card, status: newStatus });
            }
            return card;
          }),
        );
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      toastWarn(error?.response?.data?.message || "Failed to update status.");
    } finally {
      setStatusUpdateLoading(null);
    }
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const processedData = useMemo(() => {
    let result = [...healthCards];

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === "members") {
          aValue = Number(a.totalMembers) || (a.members || []).length;
          bValue = Number(b.totalMembers) || (b.members || []).length;
        } else if (sortConfig.key === "amount") {
          aValue = a.payment.totalPaid;
          bValue = b.payment.totalPaid;
        } else if (sortConfig.key === "createdAt") {
          aValue = new Date(getCardCreatedAt(a) || 0).getTime() || 0;
          bValue = new Date(getCardCreatedAt(b) || 0).getTime() || 0;
        }

        if (aValue === undefined) aValue = "";
        if (bValue === undefined) bValue = "";

        let comparison = 0;
        if (typeof aValue === "string" && typeof bValue === "string") {
          comparison = aValue.localeCompare(bValue, undefined, {
            numeric: true,
            sensitivity: "base",
          });
        } else {
          if (aValue < bValue) comparison = -1;
          else if (aValue > bValue) comparison = 1;
        }

        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [healthCards, sortConfig]);

  // totalPages is now managed via state from backend response
  const startIndex = (currentPage - 1) * itemsPerPage;

  // If the data is already paginated by the server, we don't slice.
  // We only slice if the server returned more items than the limit (fallback).
  const paginatedData = processedData;

  // renderPaginationButtons removed as it's now handled by the Pagination component.

  const isFiltered = search !== "" || activeFilter !== "All";

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const newSelectedRows = paginatedData.map(
        (_, index) => startIndex + index,
      );
      setSelectedRows(newSelectedRows);
    } else {
      setSelectedRows([]);
    }
  };

  const handleExport = () => {
    if (selectedRows.length === 0) {
      toastWarn("Please select at least one item to export.");
      return;
    }
    const rows = selectedRows.map((index) => processedData[index]);
    exportAyushCardApplicationsToExcel(rows);
  };

  const handleSelectRow = (globalIndex) => {
    setSelectedRows((prev) =>
      prev.includes(globalIndex)
        ? prev.filter((i) => i !== globalIndex)
        : [...prev, globalIndex],
    );
  };

  const renderSortableHeader = (
    title,
    sortKey,
    align = "left",
    className = "",
  ) => (
    <th
      className={`py-3 px-4 text-sm font-semibold text-[#22333B] whitespace-nowrap ${className}`}
    >
      <div
        className={`flex items-center gap-1 cursor-pointer hover:text-gray-600 ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"}`}
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
    <div
      className="flex flex-col min-w-0 h-[calc(100vh-170px)] min-h-[560px]"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-4 sm:gap-0">
        <h2 className="text-xl font-bold text-[#22333B]">
          Ayush Card Applications
        </h2>
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap w-full sm:w-auto">
          <button
            onClick={handleExport}
            className="flex-1 sm:flex-none px-4 py-1.5 border border-[#F68E5F] bg-[#FFFCFB] rounded-lg text-[15px] font-medium text-[#F68E5F] hover:bg-[#F68E5F] hover:text-[#FFFCFB] flex items-center justify-center gap-2 transition-colors"
          >
            Export to Excel <Download size={16} />
          </button>
          {/* Create Button (Tablet/Mobile Only) */}
          <button
            onClick={() => navigate("/admin/health-card/create")}
            className="flex lg:hidden flex-1 sm:flex-none px-4 py-1.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[15px] font-medium hover:bg-[#ff7535] transition-colors items-center justify-center gap-2"
          >
            Create New Application <Plus size={16} />
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mb-3 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[13px]">
          {fetchError}
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex items-center justify-between lg:flex-row flex-col gap-3 mb-4 shrink-0">
        <div className="flex items-stretch sm:items-center gap-3 sm:gap-4 flex-col sm:flex-row flex-wrap flex-1 lg:flex-nowrap w-full">
          {/* Search */}
          <div className="relative w-full lg:max-w-[300px]">
            <input
              type="text"
              placeholder="Search by name, id, phone"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 text-[16px] border border-[#E5E7EB] bg-white rounded-full text-sm placeholder:text-[#9CA3AF] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]"
            />
            <Search
              size={18}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1E1E1E] pointer-events-none"
            />
          </div>

          {/* Date */}
          <ThemedDatePicker
            value={createdAt}
            onChange={(iso) => {
              setCreatedAt(iso);
              setCurrentPage(1);
              setSelectedRows([]);
            }}
            className="w-full lg:w-auto"
            aria-label="Filter by created date"
          />

          {/* Status Tabs */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-nowrap gap-1.5 p-1.5 bg-[#F7F7F7] rounded-xl w-full lg:w-auto"
            style={{ fontFamily: "ABeeZee, sans-serif" }}
          >
            {["All", "Not Verified", "Rejected", "Expired"].map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setActiveFilter(filter);
                  setCurrentPage(1);
                }}
                className={`px-3 sm:px-4 py-2 whitespace-nowrap text-[15px] rounded-lg text-sm font-medium transition-colors text-center shrink-0 ${activeFilter === filter
                  ? "bg-[#F68E5F] text-[#FFFCFB] shadow-sm"
                  : "text-[#6B7280] hover:text-[#22333B]"
                  }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Create Button (Desktop only) */}
        <button
          onClick={() => navigate("/admin/health-card/create")}
          className="hidden lg:flex px-5 py-2.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[16px] font-medium hover:bg-[#ff6e2b] transition-colors items-center gap-2 whitespace-nowrap"
        >
          Create New Application <Plus size={16} />
        </button>
      </div>

      {/* Table & Fallbacks */}
      <div className="bg-white border border-[#D9D9D9] rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 py-12">
            <Loader2 size={32} className="animate-spin text-[#F68E5F] mb-3" />
            <p className="text-sm text-gray-500">Loading Applications…</p>
          </div>
        ) : paginatedData.length > 0 ? (
          <div className="overflow-y-auto overflow-x-auto flex-1">
            <table className="min-w-[1300px] w-full text-left border-collapse relative">
              <thead className="sticky top-0 z-10 bg-[#FFFFFF]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={
                        paginatedData.length > 0 &&
                        selectedRows.length === paginatedData.length
                      }
                      className="w-4 h-4 rounded border-[#D1D5DB] border text-[#22333B] focus:ring-[#111827]"
                    />
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-17.5">
                    Sr.no
                  </th>
                  {renderSortableHeader("Card ID", "id", "left", "w-[130px]")}
                  {renderSortableHeader(
                    "Applicant",
                    "applicant",
                    "left",
                    "min-w-[180px]",
                  )}
                  {renderSortableHeader("Phone", "phone", "left", "w-[140px]")}
                  {renderSortableHeader(
                    "Members",
                    "members",
                    "center",
                    "w-[120px]",
                  )}
                  {renderSortableHeader(
                    "Amount",
                    "amount",
                    "right",
                    "w-[120px]",
                  )}
                  {renderSortableHeader(
                    "Pincode",
                    "pincode",
                    "left",
                    "w-[120px]",
                  )}
                  {renderSortableHeader(
                    "Created At",
                    "createdAt",
                    "left",
                    "w-[190px]",
                  )}
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-[190px] whitespace-nowrap">
                    Created By
                  </th>
                  {renderSortableHeader(
                    "Status",
                    "status",
                    "left",
                    "w-[160px]",
                  )}
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-32.5">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, index) => {
                  const globalIndex = startIndex + index;
                  return (
                    <tr
                      key={index}
                      className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(globalIndex)}
                          onChange={() => handleSelectRow(globalIndex)}
                          className="w-4 h-4 rounded border-[#D1D5DB] text-[#22333B] focus:ring-[#111827]"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B]">
                        {globalIndex + 1}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        {row.id}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        <div
                          className="max-w-[160px] truncate"
                          title={row.applicant}
                        >
                          {row.applicant}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        {row.phone}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] text-center">
                        {row.totalMembers ?? ((row.members?.length || 0) + 1)}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] text-right whitespace-nowrap">
                        ₹{Number(row.payment?.totalPaid || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        {row.pincode || "—"}
                      </td>
                      <td
                        className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap"
                        title={
                          getCardCreatedAt(row)
                            ? String(getCardCreatedAt(row))
                            : undefined
                        }
                      >
                        {formatCardCreatedAt(getCardCreatedAt(row))}
                      </td>
                      <td
                        className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap"
                        title={row?.createdBy ? String(resolveCreatedById(row.createdBy) || "") : undefined}
                      >
                        <div className="max-w-[180px] truncate">
                          {resolveCreatedByLabel(row)}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge
                          status={row.status}
                          isLoading={statusUpdateLoading === row._id}
                          onStatusChange={(newStatus) => handleStatusChange(row._id, newStatus)}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <ActionButtons
                          item={row}
                          navigate={navigate}
                          onDelete={setItemToDelete}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 py-12 bg-white">
            <div className="w-24 h-24 bg-[#F8FAFC] rounded-full flex items-center justify-center mb-6">
              <img src="/admin_images/folder.svg" alt="no card found" />
            </div>
            <h3 className="text-[20px] font-bold text-[#0F172A] mb-3">
              No Card Applications Found
            </h3>
            {!isFiltered && (
              <button
                onClick={() => navigate("/admin/health-card/create")}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#F68E5F] hover:bg-[#ff7535] text-[#FFFCFB] rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <PlusCircle size={18} />
                Create New Application
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
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
              <h3 className="text-lg font-bold text-[#22333B]">
                Are you sure?
              </h3>
            </div>
            <p className="text-[#4B5563] text-sm mb-4 pl-12 line-clamp-3">
              Do you really want to delete the ayush card application for{" "}
              <strong>{itemToDelete.applicant}</strong> ({itemToDelete.id})?
              This process cannot be undone.
            </p>
            {deleteError && (
              <p className="mb-4 pl-12 text-sm text-red-500">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setItemToDelete(null);
                  setDeleteError("");
                }}
                disabled={deleteLoading}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-sm font-medium hover:bg-[#ff702d] transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                {deleteLoading && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {deleteLoading ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthCard;
