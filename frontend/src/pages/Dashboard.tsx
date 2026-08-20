import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Alcanzia } from "../types/database";
import ProgressBar from "../components/ProgressBar";
import { PiggyBank, Users, ArrowRight } from "lucide-react";

interface AlcanziaWithBalance extends Alcanzia {
  balance: number;
  member_count: number;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [alcanzias, setAlcanzias] = useState<AlcanziaWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Obtener alcanzias del usuario
      const { data: memberships } = await supabase
        .from("alcanzia_members")
        .select("alcanzia_id")
        .eq("user_id", user.id);

      if (!memberships || memberships.length === 0) {
        setAlcanzias([]);
        setLoading(false);
        return;
      }

      const ids = (memberships as any[]).map((m) => m.alcanzia_id);

      const { data: list } = await supabase
        .from("alcanzias")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false });

      if (!list) {
        setLoading(false);
        return;
      }

      // Obtener balances y conteo de miembros
      const withBalance = await Promise.all(
        (list as any[]).map(async (a) => {
          const { data: balance } = await supabase.rpc("get_alcanzia_balance", {
            p_alcanzia_id: a.id,
          } as any);

          const { count } = await supabase
            .from("alcanzia_members")
            .select("*", { count: "exact", head: true })
            .eq("alcanzia_id", a.id);

          return {
            ...a,
            balance: balance ?? 0,
            member_count: count ?? 0,
          };
        })
      );

      setAlcanzias(withBalance);
      setLoading(false);
    };

    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mis Alcanzias</h1>
      </div>

      {alcanzias.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
          <PiggyBank className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-700 mb-2">Aún no tienes alcanzias</h2>
          <p className="text-gray-500 mb-6">
            {profile?.is_superadmin 
              ? "Crea una o únete con un link de invitación" 
              : "Únete a una mediante un link de invitación"}
          </p>
          {profile?.is_superadmin && (
            <Link
              to="/create"
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-lg hover:bg-brand-700 transition"
            >
              Crear mi primera alcanzia
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {alcanzias.map((a) => (
            <Link
              key={a.id}
              to={`/alcanzia/${a.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-brand-300 transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition line-clamp-1">
                  {a.title}
                </h2>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition shrink-0" />
              </div>

              {a.description && (
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{a.description}</p>
              )}

              <ProgressBar current={a.balance} goal={a.goal_amount} currency={a.currency} />

              <div className="flex items-center gap-1.5 mt-4 text-xs text-gray-500">
                <Users className="w-3.5 h-3.5" />
                {a.member_count} miembro{a.member_count !== 1 ? "s" : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
