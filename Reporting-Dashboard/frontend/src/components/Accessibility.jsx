import { useEffect, useRef } from 'react';

/**
 * Accessibility Utilities and Components
 * Helps make the application WCAG 2.1 AA compliant
 */

/**
 * VisuallyHidden Component
 * Hides content visually but keeps it accessible to screen readers
 */
export const VisuallyHidden = ({ children, as: Component = 'span' }) => (
  <Component
    style={{
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    }}
  >
    {children}
  </Component>
);

/**
 * SkipToContent Component
 * Allows keyboard users to skip navigation and jump to main content
 */
export const SkipToContent = ({ targetId = 'main-content' }) => (
  <a
    href={`#${targetId}`}
    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
  >
    Skip to main content
  </a>
);

/**
 * FocusTrap Hook
 * Traps focus within a modal or dialog (for accessibility)
 */
export const useFocusTrap = (isActive) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    const element = ref.current;
    if (!element) return;

    // Get all focusable elements
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element on mount
    firstElement?.focus();

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape' && e.target.closest('[data-dialog]')) {
        // Let parent component handle close
        element.dispatchEvent(new CustomEvent('close-dialog'));
      }
    };

    element.addEventListener('keydown', handleTab);
    element.addEventListener('keydown', handleEscape);

    return () => {
      element.removeEventListener('keydown', handleTab);
      element.removeEventListener('keydown', handleEscape);
    };
  }, [isActive]);

  return ref;
};

/**
 * Accessible Modal Component
 * Modal with proper focus management and ARIA attributes
 */
export const AccessibleModal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}) => {
  const modalRef = useFocusTrap(isOpen);

  useEffect(() => {
    // Prevent body scroll when modal is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle close dialog event
  useEffect(() => {
    const handleCloseDialog = () => onClose();
    const element = modalRef.current;

    element?.addEventListener('close-dialog', handleCloseDialog);
    return () => element?.removeEventListener('close-dialog', handleCloseDialog);
  }, [onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      data-dialog
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-lg shadow-xl p-6 ${sizeClasses[size]} w-full mx-4`}
      >
        {title && (
          <h2 id="modal-title" className="text-2xl font-bold mb-4">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
};

/**
 * Accessible Button Component
 * Button with proper ARIA attributes and loading state
 */
export const AccessibleButton = ({
  children,
  loading = false,
  disabled = false,
  onClick,
  variant = 'primary',
  type = 'button',
  ariaLabel,
  className = '',
  ...props
}) => {
  const baseClasses = 'px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 disabled:bg-gray-400',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400 disabled:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-gray-400',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      aria-busy={loading}
      aria-disabled={disabled}
      {...props}
    >
      {loading ? (
        <>
          <span className="sr-only">Loading...</span>
          <span aria-hidden="true">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

/**
 * Accessible Form Field Component
 * Form input with proper labels and error messages
 */
export const AccessibleFormField = ({
  label,
  id,
  error,
  required = false,
  type = 'text',
  helpText,
  ...inputProps
}) => {
  const inputId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-600 ml-1" aria-label="required">*</span>}
      </label>
      
      {helpText && (
        <p id={helpId} className="text-sm text-gray-500 mb-1">
          {helpText}
        </p>
      )}
      
      <input
        id={inputId}
        type={type}
        required={required}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={`${error ? errorId : ''} ${helpText ? helpId : ''}`.trim()}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:ring-primary-500'
        }`}
        {...inputProps}
      />
      
      {error && (
        <p id={errorId} className="text-sm text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * Announce to Screen Readers
 * Dynamically announce messages to screen readers
 */
export const LiveRegion = ({ message, priority = 'polite' }) => {
  return (
    <div
      role={priority === 'assertive' ? 'alert' : 'status'}
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

/**
 * Keyboard Navigation Hook
 * Handle keyboard shortcuts
 */
export const useKeyboardShortcut = (keys, callback, deps = []) => {
  useEffect(() => {
    const handleKeyPress = (e) => {
      const { key, ctrlKey, shiftKey, metaKey, altKey } = e;
      const modifiers = { ctrl: ctrlKey, shift: shiftKey, meta: metaKey, alt: altKey };

      const matches = keys.every((k) => {
        if (k === 'ctrl') return modifiers.ctrl;
        if (k === 'shift') return modifiers.shift;
        if (k === 'meta') return modifiers.meta;
        if (k === 'alt') return modifiers.alt;
        return key.toLowerCase() === k.toLowerCase();
      });

      if (matches) {
        e.preventDefault();
        callback(e);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, deps);
};
