import { useState, useEffect } from 'react'
import axios from 'axios'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { LogIn, Mail, Lock } from 'lucide-react'
import { FormField } from '../components/FormField.jsx'
import { getErrorMessage } from '../utils/errorHandler.js'
import { toast } from 'react-toastify'

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(false);

  const { login, isAuthenticated } = useAuth();

  const [faviconPath, setFaviconPath] = useState(null);

  // Check if signup is allowed (only for first user)
  useEffect(() => {
    const checkSignupAllowed = async () => {
      try {
        const res = await axios.get('/api/auth/signup-allowed');
        setSignupAllowed(res.data.allowed);
      } catch (err) {
        console.error('Error checking signup status:', err);
        setSignupAllowed(false);
      }
    };
    checkSignupAllowed();
  }, []);

  useEffect(() => {
    let mounted = true;
    // Get server site config so login page shows branded icon/logo immediately
    (async () => {
      try {
        const res = await axios.get('/api/site-config');
        const site = res.data?.data;
        if (!mounted || !site) return;
        // Prefer favicon for the login card, fall back to logo
        if (site.faviconPath) setFaviconPath(site.faviconPath);
        else if (site.logoPath) setFaviconPath(site.logoPath);
        else {
          const link = document.querySelector("link[rel*='icon']");
          if (link && link.href) setFaviconPath(link.getAttribute('href'));
        }
      } catch (e) {
        // fallback to existing link tag
        try {
          const link = document.querySelector("link[rel*='icon']");
          if (link && link.href) setFaviconPath(link.getAttribute('href'));
        } catch (err) { /* ignore */ }
      }
    })();

    return () => { mounted = false };
  }, []);

  useEffect(() => {
    const handler = (ev) => {
      try {
        const payload = ev?.detail || {};
        if (payload.faviconPath) setFaviconPath(payload.faviconPath);
        else if (payload.logoPath) setFaviconPath(payload.logoPath);
        else setFaviconPath(null);
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('site-customization-updated', handler);
    return () => window.removeEventListener('site-customization-updated', handler);
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    // Client-side validation
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Field errors are visible - no need for toast
      return;
    }

    setLoading(true);

    try {
      const result = await login(formData.email, formData.password);
      if (!result.success) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(getErrorMessage(error, 'Login failed'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ background: 'var(--site-login-bg, linear-gradient(45deg, var(--primary, #3b82f6), var(--secondary, #06b6d4)))' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="card animate-fade-in">
          <div className="text-center mb-8">
            {faviconPath ? (
              <img src={faviconPath} alt="favicon" className="mx-auto h-8 w-8 mb-4 object-contain" />
            ) : (
              <LogIn className="mx-auto h-8 w-8 text-primary-600 mb-4" />
            )}
            <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
            <p className="text-xs text-gray-600">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-y-4">
            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              error={fieldErrors.email}
              placeholder="Enter your email"
              required
              icon={Mail}
              autoComplete="email"
            />

            <FormField
              label="Password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              error={fieldErrors.password}
              placeholder="Enter your password"
              required
              icon={Lock}
              autoComplete="current-password"
            />

            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-1">
            <p className="text-sm text-gray-600">
              <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500 transition-colors">
                Forgot password?
              </Link>
            </p>
            {signupAllowed && (
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <Link to="/signup" className="font-medium text-primary-600 hover:text-primary-500 transition-colors">
                  Sign up
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage;