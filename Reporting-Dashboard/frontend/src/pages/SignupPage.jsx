import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { UserPlus, User, Mail, Lock } from 'lucide-react';
import { toast } from 'react-toastify';
import { FormField } from '../components/FormField.jsx';
import { getErrorMessage, getValidationErrors, isValidationError } from '../utils/errorHandler.js';
import axios from 'axios';


const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(null); // null = checking, true/false = result

  const { signup, isAuthenticated } = useAuth();

  // Check if signup is allowed
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

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  // If signup is not allowed, redirect to login
  if (signupAllowed === false) {
    toast.error('Signup is disabled. Please contact an administrator.');
    return <Navigate to="/login" replace />
  }

  // Show loading while checking
  if (signupAllowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
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

    if (!formData.name.trim()) {
      errors.name = 'Full name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.password)) {
      errors.password = 'Password must contain uppercase, lowercase, number, and special symbol';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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
      const result = await signup(formData.name, formData.email, formData.password);
      if (!result.success) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast.error(getErrorMessage(error, 'Registration failed'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-700 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="card animate-fade-in">
          <div className="text-center mb-8">
            <UserPlus className="mx-auto h-8 w-8 text-primary-600 mb-2" />
            <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
            <p className="text-xs text-gray-600">
              Sign up for a new account
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-y-4">
            <FormField
              label="Full Name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              error={fieldErrors.name}
              placeholder="Enter your full name"
              required
              icon={User}
              autoComplete="name"
            />

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
              autoComplete="new-password"
              helperText={
                formData.password && !fieldErrors.password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.password)
                  ? 'Password should include uppercase, lowercase, number, and special symbol.'
                  : 'Minimum 8 characters'
              }
            />

            <FormField
              label="Confirm Password"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={fieldErrors.confirmPassword}
              placeholder="Confirm your password"
              required
              icon={Lock}
              autoComplete="new-password"
            />

            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-1">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
};

export default SignupPage;