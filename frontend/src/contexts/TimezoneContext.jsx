import { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

const TimezoneContext = createContext(null);

export const useTimezone = () => {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within TimezoneProvider');
  }
  return context;
};

/**
 * List of common timezones for the selector.
 */
export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York',      label: 'Eastern Time (ET) — New York' },
  { value: 'America/Chicago',       label: 'Central Time (CT) — Chicago' },
  { value: 'America/Denver',        label: 'Mountain Time (MT) — Denver' },
  { value: 'America/Phoenix',       label: 'Mountain Time (no DST) — Phoenix' },
  { value: 'America/Los_Angeles',   label: 'Pacific Time (PT) — Los Angeles' },
  { value: 'America/Anchorage',     label: 'Alaska Time (AKT) — Anchorage' },
  { value: 'Pacific/Honolulu',      label: 'Hawaii Time (HT) — Honolulu' },
  { value: 'America/Puerto_Rico',   label: 'Atlantic Time (AT) — Puerto Rico' },
  { value: 'America/Toronto',       label: 'Eastern Time — Toronto' },
  { value: 'America/Vancouver',     label: 'Pacific Time — Vancouver' },
  { value: 'America/Mexico_City',   label: 'Central Time — Mexico City' },
  { value: 'America/Sao_Paulo',     label: 'Brasilia Time — São Paulo' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina Time — Buenos Aires' },
  { value: 'Europe/London',         label: 'Greenwich Mean Time — London' },
  { value: 'Europe/Paris',          label: 'Central European Time — Paris' },
  { value: 'Europe/Berlin',         label: 'Central European Time — Berlin' },
  { value: 'Europe/Moscow',         label: 'Moscow Time — Moscow' },
  { value: 'Asia/Dubai',            label: 'Gulf Standard Time — Dubai' },
  { value: 'Asia/Kolkata',          label: 'India Standard Time — Mumbai' },
  { value: 'Asia/Dhaka',            label: 'Bangladesh Time — Dhaka' },
  { value: 'Asia/Bangkok',          label: 'Indochina Time — Bangkok' },
  { value: 'Asia/Singapore',        label: 'Singapore Time — Singapore' },
  { value: 'Asia/Shanghai',         label: 'China Standard Time — Shanghai' },
  { value: 'Asia/Tokyo',            label: 'Japan Standard Time — Tokyo' },
  { value: 'Asia/Seoul',            label: 'Korea Standard Time — Seoul' },
  { value: 'Australia/Sydney',      label: 'Australian Eastern Time — Sydney' },
  { value: 'Australia/Melbourne',   label: 'Australian Eastern Time — Melbourne' },
  { value: 'Pacific/Auckland',      label: 'New Zealand Time — Auckland' },
  { value: 'UTC',                   label: 'UTC — Coordinated Universal Time' },
];

export const TimezoneProvider = ({ children }) => {
  const { user } = useAuth();

  const timezone = useMemo(() => {
    return user?.timezone || 'America/Los_Angeles';
  }, [user?.timezone]);

  /**
   * Format a date value as a date string in the user's timezone.
   * e.g. "Apr 16, 2026"
   */
  const formatDate = (date, options = {}) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
      });
    } catch {
      return new Date(date).toLocaleDateString('en-US', options);
    }
  };

  /**
   * Format a date value as a date+time string in the user's timezone.
   * e.g. "Apr 16, 2026, 10:30 AM"
   */
  const formatDateTime = (date, options = {}) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...options,
      });
    } catch {
      return new Date(date).toLocaleString('en-US', options);
    }
  };

  /**
   * Format a date value as a short date+time string.
   * e.g. "Apr 16, 10:30 AM"
   */
  const formatShortDateTime = (date, options = {}) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleString('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...options,
      });
    } catch {
      return new Date(date).toLocaleString('en-US', options);
    }
  };

  /**
   * Format a date value as a short date only.
   * e.g. "Apr 16"
   */
  const formatShortDate = (date, options = {}) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        ...options,
      });
    } catch {
      return new Date(date).toLocaleDateString('en-US', options);
    }
  };

  /**
   * Get the current hour in the user's timezone (for greetings, etc.)
   */
  const getCurrentHour = () => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      });
      return parseInt(formatter.format(now), 10);
    } catch {
      return new Date().getHours();
    }
  };

  const value = {
    timezone,
    formatDate,
    formatDateTime,
    formatShortDateTime,
    formatShortDate,
    getCurrentHour,
  };

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
};
