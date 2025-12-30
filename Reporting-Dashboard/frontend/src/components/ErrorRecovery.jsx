/**
 * Error Recovery Components
 * Provides user-friendly error states with recovery options
 * 
 * WHY: Good error handling improves UX by:
 * - Explaining what went wrong in plain language
 * - Offering actionable recovery steps
 * - Preventing dead-end states
 * - Building user trust through transparency
 */

import { AlertCircle, RefreshCw, Home, ArrowLeft, WifiOff, ServerCrash, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Generic Error Display Component
 */
export const ErrorDisplay = ({ 
  title = 'Something went wrong',
  message = 'We encountered an unexpected error.',
  error = null,
  onRetry = null,
  onGoBack = null,
  showDetails = false
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-4">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-600 mb-6">{message}</p>

        {showDetails && error && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 font-medium">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs text-gray-700 overflow-auto max-h-32">
              {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          )}
          
          {onGoBack && (
            <button
              onClick={onGoBack}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </button>
          )}
          
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            <Home className="h-4 w-4" />
            Home
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Network Error Component
 */
export const NetworkError = ({ onRetry }) => (
  <ErrorDisplay
    title="Connection Lost"
    message="Unable to reach the server. Please check your internet connection and try again."
    onRetry={onRetry}
    error={null}
  >
    <WifiOff className="mx-auto h-16 w-16 text-orange-500 mb-4" />
  </ErrorDisplay>
);

/**
 * Server Error Component (500)
 */
export const ServerError = ({ onRetry }) => {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <ServerCrash className="mx-auto h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Server Error</h2>
        <p className="text-gray-600 mb-6">
          Our servers are experiencing issues. Our team has been notified and is working on a fix.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mx-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Not Found Error (404)
 */
export const NotFoundError = () => {
  const navigate = useNavigate();
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h2>
        <p className="text-gray-600 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Database Error Component
 */
export const DatabaseError = ({ onRetry }) => (
  <div className="flex items-center justify-center min-h-[400px] p-6">
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
      <Database className="mx-auto h-16 w-16 text-purple-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Data Unavailable</h2>
      <p className="text-gray-600 mb-6">
        We're having trouble accessing the data. This is usually temporary.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mx-auto"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Data
        </button>
      )}
    </div>
  </div>
);

/**
 * Permission Error Component
 */
export const PermissionError = () => {
  const navigate = useNavigate();
  
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-4">
          <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-3xl">🔒</span>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 mb-6">
          You don't have permission to view this content. Contact your administrator if you believe this is an error.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mx-auto"
        >
          <Home className="h-4 w-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

/**
 * Empty State Component (not an error, but useful)
 */
export const EmptyState = ({ 
  icon: Icon = AlertCircle,
  title = 'No Data',
  message = 'No items to display.',
  actionLabel = null,
  onAction = null
}) => (
  <div className="flex items-center justify-center min-h-[300px] p-6">
    <div className="text-center max-w-sm">
      <Icon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {actionLabel}
        </button>
      )}
    </div>
  </div>
);

/**
 * Inline Error Alert (for forms, inline errors)
 */
export const InlineError = ({ message, onDismiss = null }) => (
  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4" role="alert">
    <div className="flex items-start">
      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-red-700 font-medium">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-3 text-red-500 hover:text-red-700 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  </div>
);

/**
 * Loading with Error Fallback Hook
 * Usage: const { data, loading, error, retry } = useAsyncData(fetchFunction);
 */
export const useAsyncData = (asyncFunction, dependencies = []) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await asyncFunction();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, dependencies);

  return { data, loading, error, retry: fetchData };
};

export default ErrorDisplay;
