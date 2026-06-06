import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import apiService from "../api/service";
import { getStoredUser, getStoredUserRole } from "../utils/auth";

const AttendanceContext = createContext(null);

const TODAY_KEY = () => {
  const d = new Date();
  return `attendance_marked_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
};

function attendanceRecordCheckedOut(rec) {
  if (!rec || typeof rec !== "object") return false;
  const st = String(rec.status || "").toLowerCase();
  if (st.includes("checkout") || st === "checked_out" || st === "completed") return true;
  const nested = rec.checkOut ?? rec.checkout;
  if (nested != null && nested !== "") {
    if (typeof nested === "object" && (nested.time || nested.at || nested.date)) return true;
    if (typeof nested === "string" || typeof nested === "number") return true;
  }
  const keys = [
    "checkOutTime",
    "checkoutTime",
    "checkOutAt",
    "checkoutAt",
    "endTime",
    "clockOut",
  ];
  return keys.some((k) => {
    const v = rec[k];
    return v != null && v !== "";
  });
}

export function AttendanceProvider({ children }) {
  const [attendanceMarked, setAttendanceMarked] = useState(false);
  const [checkedOutToday, setCheckedOutToday] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);
  const [lastMarkedAt, setLastMarkedAt] = useState(null);
  const [todayCampId, setTodayCampId] = useState("");
  const [todayCampName, setTodayCampName] = useState("");

  const checkTodayAttendance = useCallback(async () => {
    try {
      setChecking(true);
      const user = getStoredUser();
      if (!user?._id) {
        setChecking(false);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const res = await apiService.getUserAttendance(user._id, { date: today });
      const list = res?.data?.attendances || [];

      if (list.length > 0) {
        const todayAt = list[0];
        const cid = todayAt.campId?._id || todayAt.campId || "";
        const cname = todayAt.campId?.name || "";
        sessionStorage.setItem(TODAY_KEY(), "true");
        setAttendanceMarked(true);
        setCheckedOutToday(attendanceRecordCheckedOut(todayAt));
        setTodayCampId(cid ? String(cid) : "");
        setTodayCampName(cname);
      } else {
        sessionStorage.removeItem(TODAY_KEY());
        setAttendanceMarked(false);
        setCheckedOutToday(false);
        setTodayCampId("");
        setTodayCampName("");
        setTimeout(() => setShowModal(true), 5000);
      }
    } catch (err) {
      console.error("[AttendanceContext] Failed to check attendance:", err);
      sessionStorage.removeItem(TODAY_KEY());
      setAttendanceMarked(false);
      setCheckedOutToday(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const userRole = getStoredUserRole();
    if (userRole !== "Employee" && userRole !== "Editor") {
      setChecking(false);
      return;
    }
    checkTodayAttendance();
  }, [checkTodayAttendance]);

  const markSuccessful = useCallback(
    (campId = "", campName = "") => {
      sessionStorage.setItem(TODAY_KEY(), "true");
      setAttendanceMarked(true);
      setCheckedOutToday(false);
      setTodayCampId(campId ? String(campId) : "");
      setTodayCampName(campName);
      setShowModal(false);
      setLastMarkedAt(Date.now());
      checkTodayAttendance();
    },
    [checkTodayAttendance],
  );

  const openModal = useCallback(() => setShowModal(true), []);
  const closeModal = useCallback(() => setShowModal(false), []);

  return (
    <AttendanceContext.Provider
      value={{
        attendanceMarked,
        checkedOutToday,
        todayCampId,
        todayCampName,
        showModal,
        checking,
        lastMarkedAt,
        openModal,
        closeModal,
        markSuccessful,
        refreshTodayAttendance: checkTodayAttendance,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) {
    return {
      attendanceMarked: false,
      checkedOutToday: false,
      todayCampId: "",
      todayCampName: "",
      showModal: false,
      checking: false,
      lastMarkedAt: null,
      openModal: () => {},
      closeModal: () => {},
      markSuccessful: () => {},
      refreshTodayAttendance: async () => {},
    };
  }
  return ctx;
}
