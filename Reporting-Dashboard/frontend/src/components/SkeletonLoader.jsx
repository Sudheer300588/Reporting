/**
 * Skeleton Loader Components
 * Provides better perceived performance with loading placeholders
 * 
 * WHY: Skeleton loaders improve perceived performance by showing
 * content structure while data loads, reducing user frustration
 */

// Table Skeleton - Enhanced with better animation
export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="animate-pulse">
    {/* Table Header */}
    <div className="flex gap-4 p-4 border-b bg-gray-50">
      {[...Array(columns)].map((_, j) => (
        <div 
          key={j} 
          className="h-4 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 rounded flex-1 bg-[length:200%_100%] animate-shimmer" 
        />
      ))}
    </div>
    
    {/* Table Rows */}
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex gap-4 p-4 border-b hover:bg-gray-50">
        {[...Array(columns)].map((_, j) => (
          <div 
            key={j} 
            className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded flex-1 bg-[length:200%_100%] animate-shimmer"
            style={{ 
              width: j === 0 ? '30%' : 'auto',
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
    ))}
  </div>
);

// Card Skeleton
export const CardSkeleton = () => (
  <div className="animate-pulse p-6 bg-white rounded-lg shadow-md">
    <div className="h-6 bg-gray-300 rounded w-3/4 mb-4" />
    <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-4 bg-gray-200 rounded w-2/3" />
  </div>
);

// Stats Card Skeleton
export const StatsCardSkeleton = () => (
  <div className="animate-pulse p-6 bg-white rounded-lg shadow-md">
    <div className="flex items-center justify-between mb-4">
      <div className="h-4 bg-gray-300 rounded w-24" />
      <div className="h-8 w-8 bg-gray-200 rounded" />
    </div>
    <div className="h-8 bg-gray-300 rounded w-20 mb-2" />
    <div className="h-3 bg-gray-200 rounded w-32" />
  </div>
);

// List Item Skeleton
export const ListItemSkeleton = () => (
  <div className="animate-pulse flex items-center gap-4 p-4 border-b">
    <div className="h-12 w-12 bg-gray-300 rounded-full flex-shrink-0" />
    <div className="flex-1">
      <div className="h-4 bg-gray-300 rounded w-1/3 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/2" />
    </div>
    <div className="h-8 w-20 bg-gray-200 rounded" />
  </div>
);

// Form Skeleton
export const FormSkeleton = () => (
  <div className="animate-pulse space-y-6">
    {[1, 2, 3].map((i) => (
      <div key={i}>
        <div className="h-4 bg-gray-300 rounded w-24 mb-2" />
        <div className="h-10 bg-gray-200 rounded w-full" />
      </div>
    ))}
    <div className="h-10 bg-gray-300 rounded w-32" />
  </div>
);

// Dashboard Grid Skeleton
export const DashboardGridSkeleton = ({ cards = 3 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {[...Array(cards)].map((_, i) => (
      <StatsCardSkeleton key={i} />
    ))}
  </div>
);

// Page Loader (Full Screen)
export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto mb-4" />
      <p className="text-gray-600 font-medium">Loading...</p>
    </div>
  </div>
);

// Inline Spinner
export const Spinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div
      className={`animate-spin rounded-full border-primary-600 border-t-transparent ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

// Button with Loading State
export const LoadingButton = ({ loading, children, disabled, ...props }) => (
  <button
    {...props}
    disabled={loading || disabled}
    className={`${props.className} relative`}
  >
    {loading && (
      <span className="absolute inset-0 flex items-center justify-center">
        <Spinner size="sm" />
      </span>
    )}
    <span className={loading ? 'invisible' : ''}>{children}</span>
  </button>
);
