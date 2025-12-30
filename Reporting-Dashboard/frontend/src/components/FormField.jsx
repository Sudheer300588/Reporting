import { useState } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

/**
 * Reusable form field component with built-in validation display
 */
export const FormField = ({ 
  label, 
  name, 
  type = 'text', 
  value, 
  onChange, 
  error,
  placeholder,
  required = false,
  disabled = false,
  icon: Icon,
  autoComplete,
  maxLength,
  minLength,
  pattern,
  helperText,
  className = ''
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div className={`form-field-container ${className}`}>
      {label && (
        <label htmlFor={name} className="form-label flex items-center">
          {Icon && <Icon className="mr-2 h-5 w-5" />}
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          id={name}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={maxLength}
          minLength={minLength}
          pattern={pattern}
          className={`form-input ${error ? 'border-red-500 focus:ring-red-500' : ''} ${
            isPassword ? 'pr-10' : ''
          }`}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
        />
        
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {error && (
        <div 
          id={`${name}-error`}
          className="flex items-start gap-1 mt-1 text-sm text-red-600"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && helperText && (
        <p 
          id={`${name}-helper`}
          className="mt-1 text-sm text-gray-500"
        >
          {helperText}
        </p>
      )}
    </div>
  );
};

/**
 * Textarea component with validation
 */
export const FormTextarea = ({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  required = false,
  disabled = false,
  rows = 4,
  maxLength,
  helperText,
  className = ''
}) => {
  return (
    <div className={`form-field-container ${className}`}>
      {label && (
        <label htmlFor={name} className="form-label">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        className={`form-input ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
      />

      {maxLength && (
        <div className="flex justify-end mt-1">
          <span className="text-xs text-gray-500">
            {value.length}/{maxLength}
          </span>
        </div>
      )}

      {error && (
        <div 
          id={`${name}-error`}
          className="flex items-start gap-1 mt-1 text-sm text-red-600"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && helperText && (
        <p 
          id={`${name}-helper`}
          className="mt-1 text-sm text-gray-500"
        >
          {helperText}
        </p>
      )}
    </div>
  );
};

/**
 * Select dropdown with validation
 */
export const FormSelect = ({
  label,
  name,
  value,
  onChange,
  options = [],
  error,
  required = false,
  disabled = false,
  placeholder = 'Select an option',
  helperText,
  className = ''
}) => {
  return (
    <div className={`form-field-container ${className}`}>
      {label && (
        <label htmlFor={name} className="form-label">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={`form-input ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option 
            key={option.value} 
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <div 
          id={`${name}-error`}
          className="flex items-start gap-1 mt-1 text-sm text-red-600"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && helperText && (
        <p 
          id={`${name}-helper`}
          className="mt-1 text-sm text-gray-500"
        >
          {helperText}
        </p>
      )}
    </div>
  );
};

export default FormField;
