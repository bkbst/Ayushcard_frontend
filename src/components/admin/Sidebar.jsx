import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, CreditCard, HelpCircle, LogOut, Tent, ClipboardCheck, ClipboardList } from "lucide-react";
import { clearTokens, getStoredUserRole } from "../../utils/auth";

const Sidebar = () => {
  const [isHovered, setIsHovered] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const userRole = getStoredUserRole() || "Admin";

  const handleLogout = () => {
    clearTokens();
    navigate("/login");
  };

  const basePath = userRole === "Employee" ? "/employee" : "/admin";

  const mainMenuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: `${basePath}` },
    {
      name: "Ayush Card",
      icon: CreditCard,
      path: `${basePath}/health-card`,
      subItems: [
        { name: "Ayush Card Apply", path: `${basePath}/health-card` },
        { name: "Verified Cards", path: `${basePath}/health-card/verified` },
        { name: "Exported Cards", path: `${basePath}/health-card/exported` },
        { name: "Settlement Card", path: `${basePath}/health-card/settlement` },
        { name: "Ayush Vitran", path: `${basePath}/health-card/vitran` },
      ],
    },
    {
      name: "Partners",
      customIcon: "/admin_images/partner.svg",
      path: `${basePath}/partners`,
    },
    {
      name: "Camps",
      icon: Tent,
      path: `${basePath}/camps`,
    },
    {
      name: "Attendance",
      icon: ClipboardCheck,
      path: `${basePath}/attendance`,
      employeeOnly: true,
    },
    {
      name: "Donations",
      customIcon: "/admin_images/donations.svg",
      path: `${basePath}/donations`,
    },
    {
      name: "Attendance",
      icon: ClipboardList,
      path: `${basePath}/attendance`,
      adminOnly: true,
    },
    {
      name: "HR & Payroll",
      customIcon: "/admin_images/hr_payroll.svg",
      path: `${basePath}/hr`,
      subItems: [
        { name: "Employees", path: `${basePath}/hr/employees` },
        { name: "Salary", path: `${basePath}/hr/salary` },
      ],
    },
  ];

  const filteredMainMenuItems = mainMenuItems
    .filter((item) => {
      if (item.name === "HR & Payroll" && userRole === "Employee") return false;
      if (item.name === "Donations" && userRole === "Employee") return false;
      if (item.employeeOnly && userRole !== "Employee" && userRole !== "Editor") return false;
      if (item.adminOnly && userRole !== "Admin") return false;
      return true;
    })
    .map((item) => {
      if (item.employeeOnly && userRole === "Editor") {
        return {
          ...item,
          path: "/admin/my-attendance",
        };
      }
      if (item.name === "Ayush Card" && userRole === "Employee") {
        return {
          ...item,
          subItems: item.subItems.filter(
            (sub) => sub.name !== "Exported Cards"
          ),
        };
      }
      return item;
    });

  const systemItems = [
    {
      name: "Reports",
      customIcon: "/admin_images/reports.svg",
      path: `${basePath}/reports`,
    },
    {
      name: "Help & Support",
      icon: HelpCircle,
      path: `${basePath}/help-support`,
    },
  ];

  const renderNavLinks = (items) => {
    return items.map((item) => {
      const isParentActive =
        item.subItems &&
        (location.pathname === item.path ||
          location.pathname.startsWith(item.path + "/"));

      return (
        <div key={item.name} className="flex flex-col">
          <NavLink
            to={item.subItems ? item.subItems[0].path : item.path}
            end={item.path === basePath}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 mx-4 rounded-lg text-sm font-medium transition-colors ${isActive || isParentActive
                ? "bg-[#F68E5F] text-[#FFFCFB] shadow-sm"
                : "text-[#4B5563] hover:bg-gray-100 hover:text-[#4B5563]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {item.customIcon ? (
                  <img
                    src={item.customIcon}
                    alt={item.name}
                    className="w-5 h-5"
                    style={
                      isActive || isParentActive
                        ? { filter: "brightness(0) invert(1)" }
                        : { filter: "brightness(0)" }
                    }
                  />
                ) : (
                  item.icon && (
                    <item.icon
                      size={20}
                      className={
                        isActive || isParentActive
                          ? "text-[#FFFCFB]"
                          : "text-[#22333B]"
                      }
                    />
                  )
                )}
                {item.name}
              </>
            )}
          </NavLink>

          {/* Render SubItems */}
          {item.subItems && isParentActive && (
            <div className="flex flex-col mt-1 mb-1 relative">
              {item.subItems.map((subItem) => (
                <div key={subItem.name} className="flex px-4 mx-4">
                  <NavLink
                    to={subItem.path}
                    end={subItem.path === `${basePath}/health-card`}
                    className={({ isActive }) =>
                      `pl-12 py-1.5 text-sm font-medium transition-colors border-l-2 ml-4 ${isActive
                        ? "text-[#F68E5F] border-[#F68E5F]"
                        : "text-[#6B7280] border-transparent hover:text-[#F68E5F]"
                      }`
                    }
                  >
                    {subItem.name}
                  </NavLink>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Logo Area */}
        <div className="flex items-center gap-3 px-6 py-8">
          <img src="/logo.svg" alt="BKBS Trust Logo" className="h-10 w-auto" />
        </div>

        {/* Navigation Menus */}
        <nav className="flex flex-col gap-6 mt-4 pb-4">
          <div>
            <p className="px-8 text-[10px] font-semibold text-[#9CA3AF] mb-2 tracking-widest">
              MAIN MENU
            </p>
            <div className="flex flex-col gap-1">
              {renderNavLinks(filteredMainMenuItems)}
            </div>
          </div>

          <div>
            <p className="px-8 text-[10px] font-semibold text-[#9CA3AF] mb-2 tracking-wider">
              SYSTEM
            </p>
            <div className="flex flex-col gap-1">
              {renderNavLinks(systemItems)}
            </div>
          </div>
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-gray-50 shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-[16px] font-medium text-[#22333B] hover:bg-red-50 hover:text-red-500 transition-colors w-full group"
        >
          <LogOut
            size={20}
            strokeWidth={2}
            className="text-[#22333B] group-hover:text-red-500 transition-colors"
          />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className="hidden lg:flex shrink-0 w-64 border-r border-gray-200 flex-col"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        {sidebarContent}
      </aside>

      {/* iPad Mini / Mobile Horizontal Sidebar */}
      <aside
        className="flex lg:hidden shrink-0 w-full bg-[#FFFFFF] border-b border-gray-200 flex-row items-center overflow-x-auto relative z-40 py-2 custom-scrollbar shadow-sm"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        <div className="flex items-center pl-4 pr-2 shrink-0">
          <img src="/logo1.svg" alt="Logo" className="h-8 max-w-none object-contain" />
        </div>
        
        <div className="w-px h-8 bg-gray-200 mx-2 shrink-0 hidden sm:block"></div>

        {/* Horizontal Navigation Icons */}
        <nav className="flex flex-row gap-2 px-2 items-center shrink-0">
          <div className="flex flex-row gap-2 shrink-0">
            {filteredMainMenuItems.map((item) => {
              const isParentActive =
                item.subItems &&
                (location.pathname === item.path ||
                  location.pathname.startsWith(item.path + "/"));

              return (
                <NavLink
                  key={item.name}
                  to={item.subItems ? item.subItems[0].path : item.path}
                  end={
                    item.path === basePath ||
                    item.path === `${basePath}/health-card`
                  }
                  className={({ isActive }) =>
                    `flex justify-center items-center w-10 h-10 shrink-0 rounded-lg transition-colors ${isActive || isParentActive
                      ? "bg-[#F68E5F] text-[#FFFCFB] shadow-sm"
                      : "text-[#4B5563] hover:bg-gray-100 hover:text-[#4B5563]"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.customIcon ? (
                        <img
                          src={item.customIcon}
                          alt={item.name}
                          className="w-5 h-5"
                          style={
                            isActive || isParentActive
                              ? { filter: "brightness(0) invert(1)" }
                              : { filter: "brightness(0)" }
                          }
                        />
                      ) : (
                        item.icon && (
                          <item.icon
                            size={20}
                            className={
                              isActive || isParentActive
                                ? "text-[#FFFCFB]"
                                : "text-[#22333B]"
                            }
                          />
                        )
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>

          <div className="w-px h-8 bg-gray-200 mx-2 shrink-0"></div>

          <div className="flex flex-row gap-2 shrink-0 pr-4">
            {systemItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.path === basePath}
                className={({ isActive }) =>
                  `flex justify-center items-center w-10 h-10 shrink-0 rounded-lg transition-colors ${isActive
                    ? "bg-[#F68E5F] text-[#FFFCFB] shadow-sm"
                    : "text-[#4B5563] hover:bg-gray-100 hover:text-[#4B5563]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.customIcon ? (
                      <img
                        src={item.customIcon}
                        alt={item.name}
                        className="w-5 h-5"
                        style={
                          isActive
                            ? { filter: "brightness(0) invert(1)" }
                            : { filter: "brightness(0)" }
                        }
                      />
                    ) : (
                      item.icon && (
                        <item.icon
                          size={20}
                          className={
                            isActive ? "text-[#FFFCFB]" : "text-[#22333B]"
                          }
                        />
                      )
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>

      {/* Mobile Sub-Menu Bar — shown below the top bar when a parent with subItems is active */}
      {(() => {
        const activeParent = filteredMainMenuItems.find(
          (item) =>
            item.subItems &&
            (location.pathname === item.path ||
              location.pathname.startsWith(item.path + "/"))
        );
        if (!activeParent) return null;
        return (
          <div
            className="flex lg:hidden w-full bg-white border-b border-gray-100 overflow-x-auto custom-scrollbar z-30"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            <nav className="flex flex-row gap-1 px-4 py-1.5 items-center">
              {activeParent.subItems.map((subItem) => (
                <NavLink
                  key={subItem.name}
                  to={subItem.path}
                  end={subItem.path === `${basePath}/health-card`}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                      isActive
                        ? "bg-[#F68E5F] text-white shadow-sm"
                        : "text-[#6B7280] hover:bg-orange-50 hover:text-[#F68E5F]"
                    }`
                  }
                >
                  {subItem.name}
                </NavLink>
              ))}
            </nav>
          </div>
        );
      })()}
    </>
  );
};

export default Sidebar;
