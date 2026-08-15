import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PiggyBank, LogOut, User, Plus, Shield } from "lucide-react";

export default function Layout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-brand-700 text-lg">
            <PiggyBank className="w-7 h-7" />
            Alcanzia Digital
          </Link>

          <div className="flex items-center gap-3">
            {profile?.is_superadmin && (
              <Link
                to="/admin"
                className="p-2 text-gray-500 hover:text-brand-600 transition"
                title="Panel de Administración"
              >
                <Shield className="w-5 h-5" />
              </Link>
            )}

            <Link
              to="/create"
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-700 transition"
            >
              <Plus className="w-4 h-4" />
              Nueva
            </Link>

            <Link
              to="/profile"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-brand-600" />
                )}
              </div>
              <span className="hidden sm:inline max-w-[120px] truncate">
                {profile?.full_name || "Usuario"}
              </span>
            </Link>

            <button
              onClick={handleSignOut}
              className="p-2 text-gray-500 hover:text-red-600 transition"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
