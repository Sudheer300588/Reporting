import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import { AuthProvider } from './contexts/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Navbar from './components/Navbar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { PageLoader } from './components/SkeletonLoader.jsx'
import { useSiteBranding } from './hooks/useSiteBranding.js'
import AIChatWidget from './components/AIChatWidget.jsx'

// Eagerly load auth pages (needed immediately)
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import VicidialDashboard from './components/vicidial/pages/VicidialDashboard.jsx'

// Lazy load dashboard and feature pages (code splitting)
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Employees = lazy(() => import('./pages/Employees.jsx'))
const Activities = lazy(() => import('./pages/Activities.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Notifications = lazy(() => import('./pages/Notifications.jsx'))
const Services = lazy(() => import('./pages/Services.jsx'))
const Clients = lazy(() => import('./pages/Clients.jsx'))
const HierarchyPage = lazy(() => import('./components/HierarchyPage.jsx'))

// Common protected layout wrapper
const ProtectedLayout = ({ children }) => (
  <ProtectedRoute>
    <Navbar />
    {children}
    <AIChatWidget />
  </ProtectedRoute>
)

function App() {
  // Apply site branding (title, favicon, login background)
  useSiteBranding();

  // 🔹 Define all protected routes in one place
  const protectedRoutes = [
    { path: '/dashboard', element: <Dashboard /> },
    { path: '/users', element: <Employees /> },
    { path: '/clients', element: <Clients /> },
    { path: '/activities', element: <Activities /> },
    { path: '/services', element: <Services /> },
    { path: '/settings', element: <Settings /> },
    { path: '/profile', element: <Profile /> },
    { path: '/notifications', element: <Notifications /> },
    // Employees Hierarchy routes
    { path: '/employees', element: <HierarchyPage /> },
    // NEW — Agents page route
    { path: "/agents", element: <VicidialDashboard /> },

  ]

  return (
    <>
      <AuthProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <div className="min-h-screen bg-gray-50">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                {/* Protected routes (looped dynamically) */}
                {protectedRoutes.map(({ path, element }) => (
                  <Route
                    key={path}
                    path={path}
                    element={<ProtectedLayout>{element}</ProtectedLayout>}
                  />
                ))}

                {/* Catch-all fallback */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>

            {/* Global Toast Notifications */}
            <ToastContainer
              position="top-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="light"
            />
          </div>
        </Router>
      </AuthProvider>
    </>
  )
}

export default App