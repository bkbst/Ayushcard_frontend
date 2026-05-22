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
import { useToast } from "../../../components/ui/Toast";
import apiService from "../../../api/service";
import Pagination from "../../../components/ui/Pagination";
import {
  normalizeHealthCard,
  isApplicationCard,
  parseHealthCardsResponse,
  formatCardCreatedAt,
  getCardCreatedAt,
} from "../../../utils/healthCardUtils";

const StatusBadge = ({ status }) => {
  let bg = "";
  let dot = "";
  let text = "";

  switch (status) {
    case "Not verified":
      bg = "bg-[#FFA10033]";
      dot = "bg-[#FFA100]";
      text = "text-[#FFA100]";
      break;
    case "Verified":
      bg = "bg-[#76DB1E33]";
      dot = "bg-[#76DB1E]";
      text = "text-[#76DB1E]";
      break;
    case "Expired":
      bg = "bg-[#FF383C33]";
      dot = "bg-[#FF383C]";
      text = "text-[#FF383C]";
      break;
    default:
      bg = "bg-gray-100";
      dot = "bg-gray-400";
      text = "text-gray-600";
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

const ActionButtons = ({ item, navigate }) => {
  const isExpired = (item.status || "").toLowerCase().includes("expir");
  return (
    <div className="flex items-center gap-4">
      {isExpired && (
        <button
          onClick={() =>
            navigate(`/employee/health-card/${item._id || item.id}`, {
              state: { editMode: true },
            })
          }
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-[#F68E5F] text-white hover:bg-[#ff7535]"
        >
          Renew
          <RotateCw size={14} />
        </button>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            navigate(`/employee/health-card/${item._id || item.id}`)
          }
          className="text-[#F68E5F] hover:text-[#ff6e2b] cursor-pointer transition-colors p-1.5"
        >
          <Eye size={20} />
        </button>
      </div>
    </div>
  );
};
const HealthCard = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [healthCards, setHealthCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchCards();
  }, [location.key]);

  const fetchCards = async () => {
    try {
      setLoading(true);
      setFetchError("");
      const res = await apiService.getHealthCards();
      const { raw } = parseHealthCardsResponse(res);
      const applicationsOnly = raw
        .map(normalizeHealthCard)
        .filter(isApplicationCard);
      setHealthCards(applicationsOnly);
    } catch (err) {
      console.error("[HealthCard] API fetch failed:", err);
      setFetchError("Could not load cards from server.");
    } finally {
      setLoading(false);
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
    let result = [...healthCards].filter((item) => {
      const applicant = (item.applicant || "").toLowerCase();
      const id = (item.id || "").toLowerCase();
      const phone = item.phone || "";
      const status = item.status || "";
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        applicant.includes(query) ||
        id.includes(query) ||
        phone.includes(searchQuery);

      if (activeFilter === "All") return matchesSearch;
      return (
        matchesSearch && status.toLowerCase() === activeFilter.toLowerCase()
      );
    });

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
  }, [healthCards, searchQuery, activeFilter, sortConfig]);

  const totalPages = Math.ceil(processedData.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = processedData.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const isFiltered = searchQuery !== "" || activeFilter !== "All";

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
        <div className="flex items-center gap-4">
          {/* Create Button (Tablet/Mobile Only) */}
          <button
            onClick={() => navigate("/employee/health-card/create")}
            className="flex lg:hidden px-4 py-1.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[15px] font-medium hover:bg-[#ff7535] transition-colors items-center gap-2"
          >
            Apply Ayush card <Plus size={16} />
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
          <div className="relative w-full lg:max-w-[360px]">
            <input
              type="text"
              placeholder="Search by name, id, phone"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-4 pr-10 py-2.5 text-[16px] border border-[#E5E7EB] bg-white rounded-full text-sm placeholder:text-[#9CA3AF] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]"
            />
            <Search
              size={18}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1E1E1E]"
            />
          </div>

          {/* Status Tabs */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1.5 bg-[#F7F7F7] rounded-xl w-full lg:w-auto"
            style={{ fontFamily: "ABeeZee, sans-serif" }}
          >
            {["All", "Not Verified", "Expired"].map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setActiveFilter(filter);
                  setCurrentPage(1);
                }}
                className={`px-3 sm:px-4 py-2 whitespace-nowrap text-[15px] rounded-lg text-sm font-medium transition-colors text-center ${
                  activeFilter === filter
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
          onClick={() => navigate("/employee/health-card/create")}
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
            <table className="min-w-[1080px] w-full text-left border-collapse relative">
              <thead className="sticky top-0 z-10 bg-[#FFFFFF]">
                <tr>
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
                  {renderSortableHeader(
                    "Status",
                    "status",
                    "left",
                    "w-[140px]",
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
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-3 px-4">
                        <ActionButtons item={row} navigate={navigate} />
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
                onClick={() => navigate("/employee/health-card/create")}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#F68E5F] hover:bg-[#ff7535] text-[#FFFCFB] rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <PlusCircle size={18} />
                Create New Application
              </button>
            )}
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
        totalItems={processedData.length}
      />
    </div>
  );
};

export default HealthCard;
