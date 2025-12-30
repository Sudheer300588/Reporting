import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { KeyRound, Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react'
import { toast } from 'react-toastify'
import axios from 'axios'

const ForgotPasswordPage = () => {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [formData, setFormData] = useState({
    email: '',
    otpCode: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState(3);
  const [faviconPath, setFaviconPath] = useState(null);

  const { requestPasswordReset, verifyResetOTP, resetPassword, resendOTP } = useAuth();
  const navigate = useNavigate();

  // Timer for resend OTP cooldown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Load favicon
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/site-config');
        const site = res.data?.data;
        if (!mounted || !site) return;
        if (site.faviconPath) setFaviconPath(site.faviconPath);
        else if (site.logoPath) setFaviconPath(site.logoPath);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    // Clear field error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Step 1: Request OTP
  const handleRequestOTP = async (e) => {
    e.preventDefault();
    
    if (!formData.email) {
      setFieldErrors({ email: 'Please enter your email address' });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setFieldErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setFieldErrors({});
    setLoading(true);
    const result = await requestPasswordReset(formData.email);
    setLoading(false);

    if (result.success) {
      setStep(2);
      setResendTimer(60);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    
    if (!formData.otpCode) {
      setFieldErrors({ otpCode: 'Please enter the verification code' });
      return;
    }

    if (formData.otpCode.length !== 6) {
      setFieldErrors({ otpCode: 'Code must be 6 digits' });
      return;
    }

    if (!/^\d+$/.test(formData.otpCode)) {
      setFieldErrors({ otpCode: 'Code must contain only numbers' });
      return;
    }

    setFieldErrors({});
    setLoading(true);
    const result = await verifyResetOTP(formData.email, formData.otpCode);
    setLoading(false);

    if (result.success) {
      setTempToken(result.tempToken);
      setStep(3);
    } else {
      // Track attempts if provided
      if (result.attemptsLeft !== undefined) {
        setOtpAttemptsLeft(result.attemptsLeft);
        if (result.attemptsLeft === 0) {
          toast.error('Too many failed attempts. Please request a new code.');
          setStep(1);
          setFormData({ ...formData, otpCode: '' });
        } else {
          setFieldErrors({ otpCode: `Invalid code. ${result.attemptsLeft} attempts remaining` });
        }
      }
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!formData.newPassword) {
      errors.newPassword = 'Password is required';
    } else if (formData.newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    } else if (formData.newPassword.length > 100) {
      errors.newPassword = 'Password is too long (max 100 characters)';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.newPassword)) {
      errors.newPassword = 'Password must contain uppercase, lowercase, number, and special symbol';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Don't show toast - field errors are visible
      return;
    }

    setFieldErrors({});
    setLoading(true);
    const result = await resetPassword(formData.email, tempToken, formData.newPassword);
    setLoading(false);

    if (result.success) {
      setStep(4); // Success screen
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } else {
      // Handle specific error codes
      if (result.error?.code === 'INVALID_TOKEN') {
        toast.error('Your verification code has expired. Please request a new one.');
        setStep(1);
      } else if (result.error?.code === 'VALIDATION_ERROR') {
        const details = result.error.details || [];
        details.forEach(detail => {
          if (detail.field === 'newPassword') {
            setFieldErrors(prev => ({ ...prev, newPassword: detail.message }));
          }
        });
      }
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    setLoading(true);
    const result = await resendOTP(formData.email, 'password_reset');
    setLoading(false);

    if (result.success) {
      setResendTimer(60);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ background: 'var(--site-login-bg, linear-gradient(45deg, var(--primary, #3b82f6), var(--secondary, #06b6d4)))' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="card animate-fade-in">
          {/* Header */}
          <div className="text-center mb-8">
            {faviconPath ? (
              <img src={faviconPath} alt="favicon" className="mx-auto h-8 w-8 mb-4 object-contain" />
            ) : (
              <KeyRound className="mx-auto h-8 w-8 text-primary-600 mb-4" />
            )}
            <h2 className="text-2xl font-bold text-gray-900">
              {step === 4 ? 'Password Reset!' : 'Reset Password'}
            </h2>
            <p className="text-xs text-gray-600">
              {step === 1 && 'Enter your email to receive a reset code'}
              {step === 2 && 'Enter the code sent to your email'}
              {step === 3 && 'Create your new password'}
              {step === 4 && 'Your password has been successfully reset'}
            </p>
          </div>

          {/* Progress Steps */}
          {step < 4 && (
            <div className="flex justify-center items-center mb-6 space-x-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      s === step
                        ? 'bg-primary-600 text-white'
                        : s < step
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {s < step ? '✓' : s}
                  </div>
                  {s < 3 && (
                    <div
                      className={`w-12 h-1 ${
                        s < step ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Email Input */}
          {step === 1 && (
            <form onSubmit={handleRequestOTP} noValidate className="flex flex-col gap-y-4">
              <div>
                <label className="form-label flex items-center">
                  <Mail className="mr-2 max-md:mr-1 h-5 max-md:h-3" />
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`form-input ${fieldErrors.email ? 'border-red-500' : ''}`}
                  placeholder="Enter your email"
                  required
                  autoFocus
                />
                {fieldErrors.email && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  'Send Reset Code'
                )}
              </button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 2 && (
            <form onSubmit={handleVerifyOTP} noValidate className="flex flex-col gap-y-4">
              <div>
                <label className="form-label flex items-center">
                  <Mail className="mr-2 max-md:mr-1 h-5 max-md:h-3" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  className="form-input bg-gray-50"
                  disabled
                />
              </div>

              <div>
                <label className="form-label flex items-center">
                  <KeyRound className="mr-2 max-md:mr-1 h-5 max-md:h-3" />
                  Verification Code
                </label>
                <input
                  type="text"
                  name="otpCode"
                  value={formData.otpCode}
                  onChange={handleChange}
                  className={`form-input text-center text-2xl tracking-widest ${fieldErrors.otpCode ? 'border-red-500' : ''}`}
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  required
                  autoFocus
                />
                {fieldErrors.otpCode ? (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.otpCode}</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the 6-digit code sent to your email
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={resendTimer > 0}
                  className={`text-primary-600 hover:text-primary-500 transition-colors ${
                    resendTimer > 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-gray-600 hover:text-gray-700 transition-colors"
                >
                  Change Email
                </button>
              </div>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === 3 && (
            <form onSubmit={handleResetPassword} noValidate className="flex flex-col gap-y-4">
              <div>
                <label className="form-label flex items-center">
                  <Lock className="mr-2 max-md:mr-1 h-5 max-md:h-3" />
                  New Password
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  className={`form-input ${fieldErrors.newPassword ? 'border-red-500' : ''}`}
                  placeholder="Enter new password"
                  required
                  autoFocus
                />
                {fieldErrors.newPassword ? (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.newPassword}</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.newPassword && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.newPassword)
                      ? 'Password should include uppercase, lowercase, number, and special symbol.'
                      : 'Must be at least 8 characters'}
                  </p>
                )}
              </div>

              <div>
                <label className="form-label flex items-center">
                  <Lock className="mr-2 max-md:mr-1 h-5 max-md:h-3" />
                  Confirm Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`form-input ${fieldErrors.confirmPassword ? 'border-red-500' : ''}`}
                  placeholder="Confirm new password"
                  required
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
              <p className="text-lg text-gray-700 mb-2">
                Your password has been successfully reset!
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Redirecting to login page...
              </p>
              <Link
                to="/login"
                className="btn btn-primary inline-flex items-center"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Back to Login */}
          {step < 4 && (
            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-sm text-gray-600 hover:text-gray-700 transition-colors inline-flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
