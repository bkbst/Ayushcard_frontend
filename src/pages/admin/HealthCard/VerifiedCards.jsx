import React, { useState, useMemo, useEffect } from "react";
import { Search, Eye, Trash2, Plus, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import apiService from "../../../api/service";
import ExportPrintModal from "../../../components/admin/ExportPrintModal";
import { useToast } from "../../../components/ui/Toast";
import Pagination from "../../../components/ui/Pagination";
import ThemedDatePicker from "../../../components/ui/ThemedDatePicker";
import {
  normalizeHealthCard,
  isVerifiedCard,
  parseHealthCardsResponse,
  formatCardCreatedAt,
  getCardCreatedAt,
} from "../../../utils/healthCardUtils";

const StatusBadge = ({ status }) => {
  let bg = "bg-gray-100";
  let dot = "bg-gray-400";
  let text = "text-gray-600";

  switch (status) {
    case "Verified":
      bg = "bg-[#76DB1E33]";
      dot = "bg-[#76DB1E]";
      text = "text-[#76DB1E]";
      break;
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
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() =>
          navigate(`/admin/health-card/${item._id || item.id}`, {
            state: { editMode: true },
          })
        }
        className="flex items-center justify-center gap-1.5 px-3 py-1 bg-[#2C2C2C] text-[#FFFCFB] rounded-lg text-sm font-normal hover:bg-[#1F2937]"
      >
        Edit
        <img
          src="/admin_images/Edit 3.svg"
          alt="edit"
          className="w-3.5 h-3.5"
        />
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

export default function VerifiedCards() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toastWarn } = useToast();

  const [healthCards, setHealthCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState([]);
  const [exportRows, setExportRows] = useState([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

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
  }, [currentPage, itemsPerPage, search, createdAt, location.key]);

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
              const label =
                name || user?.employeeId || user?.email || user?.contact || String(id);
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

  useEffect(() => {
    setSelectedRows([]);
  }, [currentPage, itemsPerPage]);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (createdAt) params.createdAt = createdAt;
      params.sort = "createdAt";
      const res = await apiService.getVerifiedNotPrintedCards(params);
      const { raw, total, pages } = parseHealthCardsResponse(res);
      const verifiedOnly = raw.map(normalizeHealthCard);
      setHealthCards(verifiedOnly);
      setTotalItems(Number(total));
      setTotalPages(Number(pages ?? (Math.ceil(total / itemsPerPage) || 1)));
    } catch (err) {
      console.error("[VerifiedCards] Failed to fetch:", err);
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
      console.error("[VerifiedCards] Delete failed:", err);
      setDeleteError("Delete failed. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const processedData = useMemo(() => {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return healthCards;

    const start = (currentPage - 1) * itemsPerPage;

    const normalize = (v) => (v == null ? "" : String(v)).toLowerCase();

    return (healthCards || []).filter((row, idx) => {
      const srNo = start + idx + 1;
      const membersCount = row.totalMembers ?? ((row.members?.length || 0) + 1);
      const amountPaid = Number(row.payment?.totalPaid || 0);
      const createdAtRaw = getCardCreatedAt(row);
      const createdAtFormatted = formatCardCreatedAt(createdAtRaw);
      const createdByLabel = resolveCreatedByLabel(row);
      const createdById = resolveCreatedById(row?.createdBy);

      const haystack = [
        srNo,
        row.id,
        row.applicationId,
        row.cardNo,
        row._id,
        row.applicant,
        row.phone,
        membersCount,
        amountPaid,
        `₹${amountPaid}`,
        createdAtRaw,
        createdAtFormatted,
        createdByLabel,
        createdById,
      ]
        .map(normalize)
        .join(" |");

      return haystack.includes(term);
    });
  }, [healthCards, search, currentPage, itemsPerPage, createdByMap]);

  // totalPages is now managed via state from backend response
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = processedData;

  const getCardKey = (card) =>
    String(card._id || card.applicationId || card.id || "");

  const isCardSelected = (card) =>
    selectedRows.some((selected) => getCardKey(selected) === getCardKey(card));

  const selectedRowsOnCurrentPage = useMemo(
    () => paginatedData.filter((card) => isCardSelected(card)),
    [paginatedData, selectedRows],
  );

  const handleSelectAll = (e) => {
    setSelectedRows(e.target.checked ? paginatedData : []);
  };

  const handleSelectRow = (card) => {
    const key = getCardKey(card);
    setSelectedRows((prev) =>
      prev.some((selected) => getCardKey(selected) === key)
        ? prev.filter((selected) => getCardKey(selected) !== key)
        : [...prev, card],
    );
  };

  const handleExportClick = () => {
    if (selectedRowsOnCurrentPage.length === 0) {
      toastWarn("Please select at least one verified card to export for printing.");
      return;
    }
    setExportRows(selectedRowsOnCurrentPage);
    setIsExportModalOpen(true);
  };

  const handleExportSuccess = () => {
    // Refresh the list, clearing exported cards.
    setSelectedRows([]);
    setExportRows([]);
    fetchCards();
    setIsExportModalOpen(false);
  };

  return (
    <div
      className="flex flex-col h-[calc(100vh-170px)]"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3 sm:gap-0">
        <h2 className="text-xl font-bold text-[#22333B]">Verified Cards</h2>
        <button
          onClick={handleExportClick}
          className="w-full sm:w-auto px-4 py-2 border border-[#F68E5F] bg-[#ffffff] rounded-lg text-[15px] font-medium text-[#F68E5F] flex items-center justify-center gap-2 transition-colors hover:bg-orange-50"
        >
          Export +
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 shrink-0">
        <div className="relative w-full sm:max-w-[320px] lg:max-w-[300px]">
          <input
            type="text"
            placeholder="Search by name, id, phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 text-[16px] border border-[#E5E7EB] rounded-full text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-1 focus:ring-[#F68E5F] focus:border-[#F68E5F]"
          />
          <Search
            size={18}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1E1E1E] pointer-events-none"
          />
        </div>

        <ThemedDatePicker
          value={createdAt}
          onChange={(iso) => {
            setCreatedAt(iso);
            setCurrentPage(1);
            setSelectedRows([]);
          }}
          className="w-full sm:w-auto"
          aria-label="Filter by created date"
        />
      </div>

      <div className="bg-white border border-[#D9D9D9] rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 py-12">
            <Loader2 size={32} className="animate-spin text-[#F68E5F] mb-3" />
            <p className="text-sm text-gray-500">Loading Applications…</p>
          </div>
        ) : paginatedData.length > 0 ? (
          <div className="overflow-y-auto overflow-x-auto flex-1">
            <table className="w-full min-w-[980px] text-left border-collapse relative">
              <thead className="sticky top-0 z-10 bg-[#FFFFFF]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={
                        paginatedData.length > 0 &&
                        paginatedData.every((row) => isCardSelected(row))
                      }
                      className="w-4 h-4 rounded border-[#D1D5DB] border text-[#22333B] focus:ring-[#111827]"
                    />
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-17.5">
                    Sr.no
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B]">
                    Card ID
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] min-w-[180px]">
                    Applicant
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] hidden md:table-cell">
                    Phone
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] text-center hidden lg:table-cell">
                    Members
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] text-right hidden lg:table-cell">
                    Amount
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] hidden xl:table-cell min-w-[170px]">
                    Created At
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] min-w-[170px]">
                    Created By
                  </th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B]">
                    Status
                  </th>
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
                      key={getCardKey(row) || globalIndex}
                      className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <td className="py-2 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isCardSelected(row)}
                          onChange={() => handleSelectRow(row)}
                          className="w-4 h-3 rounded border-[#D1D5DB] text-[#22333B] focus:ring-[#111827]"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B]">
                        {globalIndex + 1}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        {row.id}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap">
                        {row.applicant}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap hidden md:table-cell">
                        {row.phone}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] text-center hidden lg:table-cell">
                        {row.totalMembers ?? ((row.members?.length || 0) + 1)}
                      </td>
                      <td className="py-3 px-4 text-sm font-normal text-[#22333B] text-right whitespace-nowrap hidden lg:table-cell">
                        ₹{Number(row.payment?.totalPaid || 0).toFixed(2)}
                      </td>
                      <td
                        className="py-3 px-4 text-sm font-normal text-[#22333B] whitespace-nowrap hidden xl:table-cell"
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
                        title={
                          row?.createdBy
                            ? String(resolveCreatedById(row.createdBy) || "")
                            : undefined
                        }
                      >
                        <div className="max-w-[180px] truncate">
                          {resolveCreatedByLabel(row)}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={row.status} />
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
            <h3 className="text-[20px] font-bold text-[#0F172A] mb-3">
              No Verified Applications Found
            </h3>
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
        pageSizeOptions={[50, 100, 150]}
      />

      {/* Export Modal */}
      {isExportModalOpen && (
        <ExportPrintModal
          isOpen={isExportModalOpen}
          onClose={() => {
            setIsExportModalOpen(false);
            setExportRows([]);
          }}
          selectedData={exportRows}
          onExportSuccess={handleExportSuccess}
          markPrintedOnDownload={true}
        />
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/50">
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
}
