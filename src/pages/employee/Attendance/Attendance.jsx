import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, MapPin, CheckCircle2, Clock, ClipboardCheck, LogOut, Loader2, CalendarCheck2, Sun } from "lucide-react";
import apiService from "../../../api/service";
import { getStoredUser } from "../../../utils/auth";
import { useAttendance } from "../../../context/AttendanceContext";
import Pagination from "../../../components/ui/Pagination";
import {
  formatClock,
  formatWorkingHours,
  getCheckInDate,
  getCheckOutDate,
  getRowCalendarDate,
  getDisplayAttendanceStatus,
  attendanceStatusClass,
  formatAttendanceStatusLabel,
  summarizeAttendanceRecords,
} from "../../../utils/attendanceTiming";

const ATTENDANCE_STATS_FETCH_LIMIT = 2000;

function recordStatusBadge(rec) {
  const slug = getDisplayAttendanceStatus(rec);
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${attendanceStatusClass(slug)}`}>
      {formatAttendanceStatusLabel(slug)}
    </span>
  );
}

const EmployeeAttendance = () => {
  const {
    attendanceMarked,
    checkedOutToday,
    todayCampId,
    openModal,
    lastMarkedAt,
    refreshTodayAttendance,
  } = useAttendance();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(10);
  const [statsRecords, setStatsRecords] = useState([]);
  const [statsTotal, setStatsTotal] = useState(0);

  // Date filter
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchAttendance = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        const user = getStoredUser();
        if (!user?._id) {
          if (!silent) setLoading(false);
          return;
        }

        const res = await apiService.getUserAttendance(user._id, {
          fromDate,
          toDate,
          page: currentPage,
          limit: itemsPerPage,
        });

        const list = res?.data?.attendances || [];
        setRecords(list);

        const pag = res?.data?.pagination || {};
        setTotalItems(Number(pag.total || list.length));
        setTotalPages(Number(pag.pages || Math.ceil((pag.total || list.length) / itemsPerPage) || 1));
      } catch (err) {
        console.error("Failed to load attendance", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [currentPage, fromDate, toDate, itemsPerPage, lastMarkedAt],
  );

  const fetchAttendanceRangeStats = useCallback(async () => {
    try {
      const user = getStoredUser();
      if (!user?._id) {
        setStatsRecords([]);
        setStatsTotal(0);
        return;
      }
      const res = await apiService.getUserAttendance(user._id, {
        fromDate,
        toDate,
        page: 1,
        limit: ATTENDANCE_STATS_FETCH_LIMIT,
      });
      const list = res?.data?.attendances || [];
      const pag = res?.data?.pagination || {};
      setStatsRecords(list);
      setStatsTotal(Number(pag.total ?? list.length));
    } catch (err) {
      console.error("Failed to load attendance summary", err);
    }
  }, [fromDate, toDate, lastMarkedAt]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    fetchAttendanceRangeStats();
  }, [fetchAttendanceRangeStats]);

  const attendancePeriodSummary = useMemo(
    () => summarizeAttendanceRecords(statsRecords),
    [statsRecords],
  );

  const statsTruncated = statsTotal > statsRecords.length;

  useEffect(() => {
    const pollMs = 30000;
    const tick = () => {
      if (document.visibilityState === "visible") {
        fetchAttendance(true);
        fetchAttendanceRangeStats();
      }
    };
    const id = setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fetchAttendance, fetchAttendanceRangeStats]);

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const todayRecord = records.find((r) => {
    const day = getRowCalendarDate(r);
    if (!day) return false;
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}` === todayStr;
  });
  const checkoutCampId =
    todayCampId ||
    (todayRecord?.campId?._id ? String(todayRecord.campId._id) : "") ||
    (todayRecord?.campId && typeof todayRecord.campId === "string" ? todayRecord.campId : "");

  const handleCheckout = async () => {
    if (!checkoutCampId) {
      setCheckoutError("Could not determine today's camp. Try refreshing the list.");
      return;
    }
    if (!navigator.geolocation) {
      setCheckoutError("Geolocation is not supported by your browser.");
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
        });
      });
      await apiService.checkoutAttendance({
        campId: checkoutCampId,
        currentLat: pos.coords.latitude,
        currentLong: pos.coords.longitude,
      });
      await refreshTodayAttendance();
      await fetchAttendance();
      await fetchAttendanceRangeStats();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Checkout failed. Please try again.";
      setCheckoutError(msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const todayTiming = todayRecord
    ? {
        checkIn: getCheckInDate(todayRecord),
        checkOut: getCheckOutDate(todayRecord),
        working: formatWorkingHours(todayRecord),
      }
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-170px)] min-h-[560px]" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#22333B]">My Attendance</h2>
          <p className="text-sm text-[#6B7280] mt-0.5">Track your daily attendance records</p>
        </div>
        {!attendanceMarked ? (
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#F68E5F] text-white font-medium rounded-xl hover:bg-[#ff7535] transition-colors shadow-sm text-sm"
          >
            <MapPin size={16} />
            Mark Today's Attendance
          </button>
        ) : checkedOutToday ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium">
            <CheckCircle2 size={16} className="text-slate-500" />
            Checked out for today
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
              <CheckCircle2 size={16} className="text-green-500" />
              Checked in — check out when you leave
            </div>
            <button
              type="button"
              disabled={checkoutLoading || !checkoutCampId}
              onClick={handleCheckout}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#22333B] text-white font-medium rounded-xl hover:bg-[#1a2830] transition-colors shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              Check out
            </button>
          </div>
        )}
      </div>

      {/* Today's status card */}
      <div
        className={`flex items-center gap-4 p-4 rounded-2xl border mb-4 shrink-0 ${
          !attendanceMarked
            ? "bg-orange-50 border-orange-100"
            : checkedOutToday
              ? "bg-slate-50 border-slate-100"
              : "bg-green-50 border-green-100"
        }`}
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
            !attendanceMarked ? "bg-orange-100" : checkedOutToday ? "bg-slate-100" : "bg-green-100"
          }`}
        >
          <ClipboardCheck
            size={24}
            className={!attendanceMarked ? "text-[#F68E5F]" : checkedOutToday ? "text-slate-600" : "text-green-600"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#22333B]">
            {!attendanceMarked
              ? "Not checked in yet"
              : checkedOutToday
                ? "You're checked out for today"
                : "You're checked in for today"}
          </p>
          <p className="text-xs text-[#6B7280]">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          {attendanceMarked && todayTiming?.checkIn ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#22333B]">
              <span>
                <span className="text-[#6B7280] font-normal">Check-in: </span>
                <span className="font-semibold">{formatClock(todayTiming.checkIn)}</span>
              </span>
              {todayTiming.checkOut ? (
                <span>
                  <span className="text-[#6B7280] font-normal">Check-out: </span>
                  <span className="font-semibold">{formatClock(todayTiming.checkOut)}</span>
                </span>
              ) : null}
              {todayTiming.checkOut && todayTiming.working !== "—" ? (
                <span>
                  <span className="text-[#6B7280] font-normal">Working hours: </span>
                  <span className="font-semibold">{todayTiming.working}</span>
                </span>
              ) : null}
            </div>
          ) : null}
          {checkoutError ? <p className="text-xs text-red-600 mt-1">{checkoutError}</p> : null}
        </div>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[#6B7280]" />
          <span className="text-sm text-[#6B7280] font-medium">From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
            className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#F68E5F]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B7280] font-medium">To</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
            className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#F68E5F]"
          />
        </div>
        <button
          onClick={() => {
            fetchAttendance();
            fetchAttendanceRangeStats();
          }}
          className="px-4 py-1.5 bg-[#F68E5F] text-white text-sm rounded-lg hover:bg-[#ff7535] transition-colors"
        >
          Apply
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-[#FFF4ED] flex items-center justify-center shrink-0">
            <CalendarDays size={18} className="text-[#F68E5F]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#6B7280]">Days worked</p>
            <p className="text-lg font-bold text-[#22333B] tabular-nums">{attendancePeriodSummary.daysWorked}</p>
            <p className="text-[11px] text-[#9CA3AF]">With check-in in this range</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <CalendarCheck2 size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#6B7280]">Full days</p>
            <p className="text-lg font-bold text-[#22333B] tabular-nums">{attendancePeriodSummary.fullDays}</p>
            <p className="text-[11px] text-[#9CA3AF]">4+ hours worked with check-out</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <Sun size={18} className="text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#6B7280]">Half days</p>
            <p className="text-lg font-bold text-[#22333B] tabular-nums">{attendancePeriodSummary.halfDays}</p>
            <p className="text-[11px] text-[#9CA3AF]">Under 4 hours worked with check-out</p>
          </div>
        </div>
      </div>
      {statsTruncated ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          Totals reflect the first {statsRecords.length.toLocaleString()} of {statsTotal.toLocaleString()} records in this date range. Narrow the range for complete counts.
        </p>
      ) : null}

      {/* Table */}
      <div className="bg-white border border-[#D9D9D9] rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#F68E5F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length > 0 ? (
          <div className="overflow-y-auto overflow-x-auto flex-1">
            <table className="min-w-[960px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-[#F3F4F6]">
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] w-12">Sr.</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] whitespace-nowrap">Check-in</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] whitespace-nowrap">Check-out</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B] whitespace-nowrap">Working hours</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B]">Camp</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B]">Location</th>
                  <th className="py-3 px-4 text-sm font-semibold text-[#22333B]">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => {
                  const rowDay = getRowCalendarDate(rec);
                  const cin = getCheckInDate(rec);
                  const cout = getCheckOutDate(rec);
                  const duration = formatWorkingHours(rec);
                  return (
                  <tr key={rec._id} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3 px-4 text-sm text-[#22333B]">{(currentPage - 1) * itemsPerPage + i + 1}</td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-[#22333B]">
                        {rowDay
                          ? rowDay.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : "—"}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-[#22333B] flex items-center gap-1">
                        <Clock size={12} className="text-[#9CA3AF] shrink-0" />
                        {formatClock(cin)}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-[#22333B] flex items-center gap-1">
                        <Clock size={12} className="text-[#9CA3AF] shrink-0" />
                        {formatClock(cout)}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-[#22333B] whitespace-nowrap">{duration}</td>
                    <td className="py-3 px-4">
                      {rec.campId ? (
                        <>
                          <p className="text-sm font-medium text-[#22333B]">{rec.campId.name}</p>
                          <p className="text-xs text-[#6B7280]">{rec.campId.city}, {rec.campId.state}</p>
                        </>
                      ) : (
                        <span className="text-xs text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-[#22333B]">{rec.city || "—"}</p>
                      <p className="text-xs text-[#6B7280] font-mono">{rec.lat != null && rec.long != null ? `${Number(rec.lat).toFixed(4)}, ${Number(rec.long).toFixed(4)}` : "—"}</p>
                    </td>
                    <td className="py-3 px-4">{recordStatusBadge(rec)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#6B7280] gap-3">
            <CalendarDays size={40} className="text-gray-300" />
            <p className="text-base font-semibold text-[#22333B]">No attendance records found</p>
            <p className="text-sm text-[#9CA3AF]">Try adjusting the date range above.</p>
          </div>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={() => {}}
        totalItems={totalItems}
      />
    </div>
  );
};

export default EmployeeAttendance;
