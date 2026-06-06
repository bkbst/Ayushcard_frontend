import React, { useEffect } from "react";
import { Navigate, useNavigate, Outlet } from "react-router-dom";
import { canSessionContinue, clearTokens, getStoredUserRole } from "../../utils/auth";

const ProtectedRoute = ({ allowedRole }) => {
    const navigate = useNavigate();

    const userRole = getStoredUserRole();
    const isAdminLike = userRole === "Admin" || userRole === "Editor";

    // ── Helper: clear tokens and go to /login ────────────────────────────────
    const logout = (reason = "") => {
        if (reason) console.warn("[ProtectedRoute] Logout:", reason);
        clearTokens();
        navigate("/login", { replace: true });
    };

    useEffect(() => {
        if (!canSessionContinue()) {
            logout("no valid session on mount");
            return;
        }

        // Role check
        if (allowedRole) {
            const hasAccess =
                allowedRole === "Admin"
                    ? isAdminLike
                    : userRole === allowedRole;

            if (!hasAccess) {
                console.error(`[ProtectedRoute] Access denied. Required: ${allowedRole}, Found: ${userRole}`);
                if (isAdminLike) navigate("/admin", { replace: true });
                else if (userRole === "Employee") navigate("/employee", { replace: true });
                else navigate("/login", { replace: true });
                return;
            }
        }

        const handleStorage = (e) => {
            if ((e.key === "token" || e.key === "refreshToken") && !e.newValue) {
                logout("token removed in another tab");
            }
        };
        window.addEventListener("storage", handleStorage);

        const handleForceLogout = () => logout("server forced logout");
        window.addEventListener("auth:logout", handleForceLogout);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("auth:logout", handleForceLogout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedRole, userRole]);

    // Initial basic check
    if (!canSessionContinue()) {
        return <Navigate to="/login" replace />;
    }

    // Role check for initial render
    if (allowedRole) {
        const hasAccess =
            allowedRole === "Admin"
                ? isAdminLike
                : userRole === allowedRole;

        if (!hasAccess) {
            const target =
                userRole === "Admin" || userRole === "Editor"
                    ? "/admin"
                    : userRole === "Employee"
                        ? "/employee"
                        : "/login";
            return <Navigate to={target} replace />;
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;
