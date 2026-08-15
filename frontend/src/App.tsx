import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import AlcanziaDetail from "./pages/AlcanziaDetail";
import CreateAlcanzia from "./pages/CreateAlcanzia";
import JoinAlcanzia from "./pages/JoinAlcanzia";
import Profile from "./pages/Profile";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="create" element={<CreateAlcanzia />} />
        <Route path="alcanzia/:id" element={<AlcanziaDetail />} />
        <Route path="join/:token" element={<JoinAlcanzia />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={<SuperAdminDashboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
