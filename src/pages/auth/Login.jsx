import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import apiService from "../../api/service";
import { clearTokens } from "../../utils/auth";

const Login = () => {
  const [activeTab, setActiveTab] = useState("Admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLogged, setKeepLogged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    setIsLoading(true);
    try {
      const data = await apiService.login(email, password);

      // API response shape:
      // { success, message, data: { user: {...}, accessToken: "...", refreshToken: "..." } }
      const userData = data?.data?.user || data?.user || data;
      const accessToken =
        data?.data?.accessToken || data?.accessToken || data?.token;
      const refreshToken =
        data?.data?.refreshToken || data?.refreshToken || null;

      let userRole = userData?.role || activeTab;
      userRole = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase();

      const isEmployee = userRole === "Employee";
      const isEditor = userRole === "Editor";
      const isAdmin = userRole === "Admin";

      // Ensure the user is logging in from the correct tab based on their actual role
      // Employee tab should allow both Employee and Editor
      if (activeTab === "Employee" && !isEmployee && !isEditor) {
        throw new Error("Access denied: You are an Admin. Please login from the Admin tab.");
      }
      // Admin tab should only allow Admin
      if (activeTab === "Admin" && !isAdmin) {
        throw new Error("Access denied: You are an Employee/Editor. Please login from the Employee tab.");
      }

      // Clear stale auth from both storages before saving the new session
      clearTokens();

      // Save to localStorage (keep logged in) or sessionStorage (session only)
      const store = keepLogged ? localStorage : sessionStorage;
      store.setItem("token", accessToken);
      store.setItem("user", JSON.stringify(userData));
      if (refreshToken) store.setItem("refreshToken", refreshToken);
      store.setItem("userRole", userRole);

      if (isEmployee) {
        navigate("/employee");
      } else if (isAdmin || isEditor) {
        navigate("/admin");
      } else {
        navigate("/login");
      }
    } catch (err) {
      let message = 'Invalid email or password. Please try again.';

      if (err.response?.data?.message) {
        message = err.response.data.message;
      } else if (err.response?.data?.error) {
        if (typeof err.response.data.error === 'string') {
          message = err.response.data.error;
        } else if (err.response.data.error.message) {
          message = err.response.data.error.message;
        }
      } else if (err.message) {
        message = err.message;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#FCF3EB" }}
    >
      {/* Corner Shapes */}
      <img
        src="/orange2.svg"
        alt="decoration"
        className="absolute top-0 left-0 w-36 sm:w-48 md:w-104 select-none pointer-events-none"
      />
      <img
        src="/orange1.svg"
        alt="decoration"
        className="absolute top-0 left-0 w-16 sm:w-20 md:w-42 select-none pointer-events-none"
      />
      <img
        src="/orange3.svg"
        alt="decoration"
        className="absolute -bottom-14 right-0 w-40 sm:w-64 md:w-156 select-none pointer-events-none"
      />
      <img
        src="/orange4.svg"
        alt="decoration"
        className="absolute -bottom-6 right-0 w-28 sm:w-40 md:w-96 select-none pointer-events-none"
      />

      {/* Main Login Card Wrapper to allow Logo positioning */}
      <div className="relative w-full max-w-[600px] px-4 sm:px-6 md:px-0 flex flex-col justify-center items-center">
        {/* Logo protruding from top */}
        <div className="absolute -top-14 sm:-top-20 left-0 right-0 z-10 flex justify-center w-full pointer-events-none">
          <img
            src="/logo_whitebg.svg"
            alt="Logo"
            className="w-28 h-28 sm:w-43 sm:h-43 drop-shadow-sm rounded-full object-cover"
          />
        </div>

        {/* Card Component */}
        <div className="bg-white rounded-3xl sm:rounded-4xl shadow-xl p-5 sm:p-8 pt-10 sm:pt-14 relative w-full max-w-[540px] min-h-[680px] sm:min-h-[620px] border border-gray-100 flex flex-col justify-center">
          {/* Tabs */}
          <div
            className="flex w-full mb-6 border rounded-xl border-[#F68E5F] p-2"
            style={{ fontFamily: "'Nunito Sans', sans-serif" }}
          >
            <button
              type="button"
              className={`flex-1 py-2 text-[16px] font-semibold rounded-xl transition-colors duration-200 ${activeTab === "Admin"
                  ? "bg-[#F68E5F] text-white shadow-sm"
                  : "text-[#F68E5F] bg-transparent"
                }`}
              onClick={() => {
                setActiveTab("Admin");
                setError("");
              }}
            >
              Admin
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-[16px] font-semibold rounded-xl transition-colors duration-200 ${activeTab === "Employee"
                  ? "bg-[#F68E5F] text-white shadow-sm"
                  : "text-[#F68E5F] bg-transparent"
                }`}
              onClick={() => {
                setActiveTab("Employee");
                setError("");
              }}
            >
              Employee
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1">
              <label className="block text-[16px] font-normal font-['Inter'] text-gray-700">
                Email
              </label>
              <input
                type="text"
                placeholder={
                  activeTab === "Admin"
                    ? "admin123@gmail.com"
                    : "employee123@gmail.com"
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-full text-gray-800 font-['Inter'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F68E5F]/30 transition-colors disabled:opacity-60"
                required
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label className="block text-[16px] font-normal font-['Inter'] text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-full text-gray-800 font-['Inter'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F68E5F]/30 transition-colors disabled:opacity-60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                >
                  {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-red-500 font-['Inter'] text-center -mt-1">
                {error}
              </p>
            )}

            {/* Checkbox and Forgot Password */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 gap-2 sm:gap-0">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <input
                    type="checkbox"
                    checked={keepLogged}
                    onChange={(e) => setKeepLogged(e.target.checked)}
                    className="peer appearance-none w-5 h-5 border-2 border-gray-400 rounded bg-white checked:bg-[#F68E5F] checked:border-[#F68E5F] focus:outline-none focus:ring-2 focus:ring-[#F68E5F]/30 focus:ring-offset-1 transition-all"
                  />
                  <svg
                    className="absolute w-3.5 h-3.5 pointer-events-none opacity-0 peer-checked:opacity-100 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <span className="text-sm font-normal font-['Inter'] text-[#757575] group-hover:text-gray-700 transition-colors">
                  Keep me logged in
                </span>
              </label>

              <button
                type="button"
                className="text-sm sm:text-[16px] font-normal font-['Inter'] text-[#F68E5F] mt-0 hover:text-[#ff702d] transition-colors underline-offset-4 hover:underline self-start sm:self-auto"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 mt-10 sm:mt-14 text-white font-medium font-['Nunito_Sans'] rounded-full shadow-md transition-transform active:scale-[0.98] bg-[#F68E5F] hover:bg-[#ff702d] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>
        </div>

        {/* Back to Home Button BELOW card */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-4 mb-2 inline-flex items-center justify-center gap-2 text-[15px] font-medium font-['Inter'] text-[#F68E5F] hover:text-[#ff702d] transition-all px-5 py-2.5 rounded-full hover:bg-[#F68E5F]/5 z-10"
        >
          <ArrowLeft size={18} />
          <span>Back to Home</span>
        </button>
      </div>
    </div>
  );
};

export default Login;
