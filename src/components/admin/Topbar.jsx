import React, { useState, useRef, useEffect } from 'react';
import { Bell, LogOut, ChevronDown, Mail, Phone, Building, Calendar, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiService from '../../api/service';
import { clearTokens, getStoredUser, updateStoredUser } from '../../utils/auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name) => {
  if (!name) return 'A';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const parseProfileUser = (data) =>
  data?.data?.user || data?.data || data?.user || null;

// ─── Topbar ───────────────────────────────────────────────────────────────────
const Topbar = () => {
  const [user, setUser] = useState(getStoredUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const refreshProfile = async () => {
      try {
        const data = await apiService.getProfile();
        const profile = parseProfileUser(data);
        if (cancelled || !profile) return;

        setUser((prev) => {
          const merged = updateStoredUser({ ...prev, ...profile });
          return merged;
        });
      } catch {
        // Keep stored user if profile fetch fails
      }
    };

    refreshProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    clearTokens();
    setShowDropdown(false);
    navigate('/login');
  };

  const displayName = user?.name || user?.fullName || user?.username;
  const displayRole = user?.role || user?.userType;
  const displayEmail = user?.email || '';
  const displayPhone = user?.phone || user?.mobile || '';
  const displayDept = user?.department || '';
  const joinDate = user?.createdAt || user?.joinedAt || '';
  const isAdmin = user?.isAdmin || false;

  return (
    <div className="flex justify-between items-center h-[72px] px-4 sm:px-8 border-b border-[#F3F4F6] bg-white relative z-30">

      {/* ── Left: Greeting ─────────────────────────────── */}
      <div className="min-w-0 flex-1 mr-4">
        <h1 className="text-base sm:text-[22px] font-bold text-[#22333B] truncate">
          <span className="hidden sm:inline">{getGreeting()}, </span>
          <span className="text-[#F68E5F]">{displayName}</span>
          <span>!</span>
        </h1>
      </div>

      {/* ── Right: Bell + Profile ─────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">

        {/* Notification Bell */}
        <button className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center hover:bg-gray-200 transition-colors">
          <Bell size={16} className="text-[#22333B]" />
        </button>

        {/* Profile Button + Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown((p) => !p)}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity"
          >
            {/* Avatar Circle with Initials */}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#F68E5F] to-[#e47b4d] flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
              {getInitials(displayName)}
            </div>

            {/* Name + Role */}
            <div className="flex flex-col text-left">
              <span className="text-sm font-bold text-[#22333B] leading-tight truncate max-w-[100px] sm:max-w-none">
                {displayName || "Loading..."}
              </span>
              <span className="text-[10px] sm:text-xs text-[#9CA3AF] capitalize leading-tight">
                {displayRole || "User"}
              </span>
            </div>

            <ChevronDown
              size={14}
              className={`text-[#9CA3AF] hidden sm:block transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* ── Dropdown Menu ────────────────────── */}
          {showDropdown && (
            <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-[#F3F4F6] z-50 overflow-hidden">

              {/* Header with Avatar + Name + Role */}
              <div className="px-5 py-4 bg-gradient-to-br from-[#FFF7F4] to-white border-b border-[#F3F4F6]">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F68E5F] to-[#e47b4d] flex items-center justify-center text-white text-lg font-bold shadow-md shrink-0">
                    {getInitials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[#22333B] truncate">{displayName}</p>
                      {isAdmin && (
                        <ShieldCheck size={13} className="text-[#F68E5F] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-[#F68E5F] capitalize font-semibold">{displayRole}</p>
                    {displayEmail && (
                      <p className="text-xs text-[#9CA3AF] truncate mt-0.5">{displayEmail}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Details */}
              {(displayEmail || displayPhone || displayDept || joinDate) && (
                <div className="px-5 py-3 space-y-2.5 border-b border-[#F3F4F6]">
                  {displayEmail && (
                    <div className="flex items-center gap-2.5 text-xs text-[#6B7280]">
                      <Mail size={13} className="text-[#F68E5F] shrink-0" />
                      <span className="truncate">{displayEmail}</span>
                    </div>
                  )}
                  {displayPhone && (
                    <div className="flex items-center gap-2.5 text-xs text-[#6B7280]">
                      <Phone size={13} className="text-[#F68E5F] shrink-0" />
                      <span>{displayPhone}</span>
                    </div>
                  )}
                  {displayDept && (
                    <div className="flex items-center gap-2.5 text-xs text-[#6B7280]">
                      <Building size={13} className="text-[#F68E5F] shrink-0" />
                      <span>{displayDept}</span>
                    </div>
                  )}
                  {joinDate && (
                    <div className="flex items-center gap-2.5 text-xs text-[#6B7280]">
                      <Calendar size={13} className="text-[#F68E5F] shrink-0" />
                      <span>
                        Joined{' '}
                        {new Date(joinDate).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Sign Out Button */}
              <div className="p-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-semibold"
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Topbar;
