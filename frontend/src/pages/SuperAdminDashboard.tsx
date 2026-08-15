import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Users, PiggyBank, Calendar, ToggleLeft, ToggleRight, CheckCircle, XCircle } from "lucide-react";

type AdminUser = { id: string; full_name: string | null; email: string | null; phone: string | null; created_at: string };
type AdminAlcanzia = { id: string; title: string; goal_amount: number; currency: string; is_active: boolean; balance: number; last_movement_date: string | null };

export default function SuperAdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"alcanzias" | "users">("alcanzias");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [alcanzias, setAlcanzias] = useState<AdminAlcanzia[]>([]);

  const formatMoney = (n: number, currency = "ARS") =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(n);

  const loadData = async () => {
    setLoading(true);
    const { data: usersData, error: uError } = await supabase.rpc("get_superadmin_users");
    const { data: alcanziasData, error: aError } = await supabase.rpc("get_superadmin_alcanzias");

    if (uError) console.error("Error users:", uError);
    if (aError) console.error("Error alcanzias:", aError);

    setUsers(usersData || []);
    setAlcanzias(alcanziasData || []);
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.is_superadmin) {
      loadData();
    }
  }, [profile]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.rpc("toggle_alcanzia_active", {
      p_alcanzia_id: id,
      p_is_active: !currentStatus
    } as any);

    if (error) {
      alert("Error al cambiar el estado: " + error.message);
    } else {
      // Optimistic update
      setAlcanzias(alcanzias.map(a => a.id === id ? { ...a, is_active: !currentStatus } : a));
    }
  };

  if (!profile?.is_superadmin) {
    return <div className="text-center py-20 text-red-500">Acceso denegado</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <span className="bg-brand-100 text-brand-700 p-2 rounded-lg">
            <PiggyBank className="w-6 h-6" />
          </span>
          Panel Super Admin
        </h1>
        <p className="text-gray-500 mt-2">Visión global de la plataforma.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab("alcanzias")}
            className={`flex items-center gap-1.5 px-6 py-4 text-sm font-medium whitespace-nowrap transition ${
              activeTab === "alcanzias"
                ? "text-brand-700 border-b-2 border-brand-600 bg-brand-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <PiggyBank className="w-4 h-4" />
            Alcanzias ({alcanzias.length})
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-1.5 px-6 py-4 text-sm font-medium whitespace-nowrap transition ${
              activeTab === "users"
                ? "text-brand-700 border-b-2 border-brand-600 bg-brand-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Users className="w-4 h-4" />
            Usuarios ({users.length})
          </button>
        </div>

        <div className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
          ) : activeTab === "alcanzias" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-6 py-3 font-medium">Alcanzia</th>
                    <th className="px-6 py-3 font-medium">Balance / Meta</th>
                    <th className="px-6 py-3 font-medium">Último Movimiento</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {alcanzias.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">{a.title}</p>
                        <p className="text-xs text-gray-500">ID: {a.id.slice(0,8)}...</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-green-600">{formatMoney(a.balance, a.currency)}</p>
                        <p className="text-xs text-gray-500 font-medium">de {formatMoney(a.goal_amount, a.currency)}</p>
                      </td>
                      <td className="px-6 py-4">
                        {a.last_movement_date ? (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {new Date(a.last_movement_date).toLocaleDateString("es-AR")}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Sin movimientos</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {a.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5" /> Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                            <XCircle className="w-3.5 h-3.5" /> Inactiva
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleToggleActive(a.id, a.is_active)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                            a.is_active 
                              ? "bg-red-50 text-red-600 hover:bg-red-100" 
                              : "bg-green-50 text-green-600 hover:bg-green-100"
                          }`}
                        >
                          {a.is_active ? (
                            <><ToggleRight className="w-4 h-4" /> Desactivar</>
                          ) : (
                            <><ToggleLeft className="w-4 h-4" /> Activar</>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-6 py-3 font-medium">Usuario</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Teléfono</th>
                    <th className="px-6 py-3 font-medium">Fecha de Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">
                            {(u.full_name || u.email || "?")[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{u.full_name || "Sin nombre"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{u.email}</td>
                      <td className="px-6 py-4 text-gray-600">{u.phone || "-"}</td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(u.created_at).toLocaleDateString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
