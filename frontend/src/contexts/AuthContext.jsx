
import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import otpService from "../services/otpService.js";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("token"));

  // Set up axios defaults
  useEffect(() => {
    axios.defaults.baseURL = import.meta.env.VITE_API_URL || "";
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // Check if user is logged in on app start
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const response = await axios.get("/api/auth/me");
          setUser(response.data.user);
        } catch (err) {
          localStorage.removeItem("token");
          console.error(err);
          setToken(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await axios.post("/api/auth/login", { email, password });
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem("token", newToken);
      setToken(newToken);
      setUser(userData);

      toast.success("Login successful!");
      return { success: true };
    } catch (error) {
      // Check for validation errors
      if (error.response?.data?.error?.code === 'VALIDATION_ERROR') {
        const details = error.response.data.error.details;
        if (details && details.length > 0) {
          toast.error(details[0].message);
        } else {
          toast.error(error.response.data.error.message || "Invalid input data");
        }
        return { 
          success: false, 
          error: error.response.data.error,
          validationErrors: details 
        };
      }
      
      // Handle other errors
      const message = error.response?.data?.error?.message || 
                     error.response?.data?.message || 
                     "Login failed";
      toast.error(message);
      return { success: false, message };
    }
  };

  const signup = async (name, email, password) => {
    try {
      const response = await axios.post("/api/auth/register", {
        name,
        email,
        password,
      });
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem("token", newToken);
      setToken(newToken);
      setUser(userData);

      toast.success("Registration successful!");
      return { success: true };
    } catch (error) {
      // Check for validation errors
      if (error.response?.data?.error?.code === 'VALIDATION_ERROR') {
        const details = error.response.data.error.details;
        if (details && details.length > 0) {
          // Show first validation error
          toast.error(details[0].message);
        } else {
          toast.error(error.response.data.error.message || "Invalid input data");
        }
        return { 
          success: false, 
          error: error.response.data.error,
          validationErrors: details 
        };
      }
      
      // Handle other errors
      const message = error.response?.data?.error?.message || 
                     error.response?.data?.message || 
                     "Registration failed";
      toast.error(message);
      return { success: false, message };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
    toast.success("Logged out successfully");
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  // OTP-based login
  const requestLoginOTP = async (email) => {
    try {
      const result = await otpService.requestOTP(email);
      if (result.success) {
        toast.success(result.message);
        return { success: true };
      } else {
        toast.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      const message = "Failed to send OTP";
      toast.error(message);
      return { success: false, message };
    }
  };

  const loginWithOTP = async (email, code) => {
    try {
      const result = await otpService.verifyOTP(email, code);
      if (result.success) {
        localStorage.setItem("token", result.token);
        setToken(result.token);
        setUser(result.user);
        toast.success("Login successful!");
        return { success: true };
      } else {
        toast.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      const message = "Login failed";
      toast.error(message);
      return { success: false, message };
    }
  };

  // Password reset flow
  const requestPasswordReset = async (email) => {
    try {
      const result = await otpService.forgotPassword(email);
      if (result.success) {
        toast.success(result.message);
        return { success: true };
      } else {
        toast.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      const message = "Failed to request password reset";
      toast.error(message);
      return { success: false, message };
    }
  };

  const verifyResetOTP = async (email, code) => {
    try {
      const result = await otpService.verifyResetOTP(email, code);
      if (result.success) {
        return { success: true, tempToken: result.tempToken };
      } else {
        toast.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      const message = "Failed to verify OTP";
      toast.error(message);
      return { success: false, message };
    }
  };

  const resetPassword = async (email, tempToken, newPassword) => {
    try {
      const result = await otpService.resetPassword(email, tempToken, newPassword);
      if (result.success) {
        toast.success(result.message);
        return { success: true };
      } else {
        toast.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      const message = "Failed to reset password";
      toast.error(message);
      return { success: false, message };
    }
  };

  const resendOTP = async (email, purpose) => {
    try {
      const result = await otpService.resendOTP(email, purpose);
      if (result.success) {
        toast.success(result.message);
        return { success: true };
      } else {
        toast.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      const message = "Failed to resend OTP";
      toast.error(message);
      return { success: false, message };
    }
  };

  const value = {
    user,
    login,
    signup,
    logout,
    updateUser,
    loading,
    isAuthenticated: !!user,
    // OTP methods
    requestLoginOTP,
    loginWithOTP,
    requestPasswordReset,
    verifyResetOTP,
    resetPassword,
    resendOTP,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
