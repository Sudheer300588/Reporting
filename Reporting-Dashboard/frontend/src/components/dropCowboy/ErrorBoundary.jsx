/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors in child components and displays a fallback UI
 * instead of crashing the entire application.
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        // Update state so next render shows fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error details
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
                            <AlertCircle className="w-6 h-6 text-red-600" />
                        </div>
                        <h2 className="mt-4 text-xl font-semibold text-gray-900 text-center">
                            Something went wrong
                        </h2>
                        <p className="mt-2 text-sm text-gray-600 text-center">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>

                        {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                            <details className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-700 overflow-auto max-h-48">
                                <summary className="cursor-pointer font-medium">Error Details</summary>
                                <pre className="mt-2 whitespace-pre-wrap">
                                    {this.state.error?.stack}
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </details>
                        )}

                        <div className="mt-6 flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={this.handleReset}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;