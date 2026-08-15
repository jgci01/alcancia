import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Alcanzia, Movimiento, AlcanziaMember, Withdrawal } from "../types/database";
import ProgressBar from "../components/ProgressBar";
import {
  Share2,
  Check,
  DollarSign,
  Trophy,
  History,
  Wallet,
  Users,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function AlcanziaDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [alcanzia, setAlcanzia] = useState<Alcanzia | null>(null);
  const [balance, setBalance] = useState(0);
  const [ranking, setRanking] = useState<{ user_id: string; total: number; full_name: string | null; avatar_url: string | null }[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [members, setMembers] = useState<AlcanziaMember[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [myRole, setMyRole] = useState<"admin" | "member" | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributing, setContributing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState("");
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDesc, setWithdrawDesc] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [activeTab, setActiveTab] = useState<"ranking" | "historial" | "retiros" | "miembros">("ranking");

  const formatMoney = (n: number, currency = "ARS") =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(n);

  const loadData = useCallback(async () => {
    if (!id || !user) return;

    // Alcanzia
    const { data: a } = await supabase.from("alcanzias").select("*").eq("id", id).single();
    if (!a) {
      setLoading(false);
      return;
    }
    setAlcanzia(a);

    // Balance
    const { data: bal } = await supabase.rpc("get_alcanzia_balance", { p_alcanzia_id: id } as any);
    setBalance(bal ?? 0);

    // Mi rol
    const { data: mem } = await supabase
      .from("alcanzia_members")
      .select("role")
      .eq("alcanzia_id", id)
      .eq("user_id", user.id)
      .single();
    setMyRole((mem as any)?.role ?? null);

    // Ranking (aportes aprobados agrupados)
    const { data: contribs } = await supabase
      .from("contributions")
      .select("user_id, net_amount, amount, profiles(full_name, avatar_url)")
      .eq("alcanzia_id", id)
      .eq("status", "approved");

    if (contribs) {
      const map = new Map<string, { total: number; full_name: string | null; avatar_url: string | null }>();
      contribs.forEach((c: any) => {
        const prev = map.get(c.user_id) || { total: 0, full_name: c.profiles?.full_name, avatar_url: c.profiles?.avatar_url };
        prev.total += Number(c.net_amount || c.amount || 0);
        map.set(c.user_id, prev);
      });
      const ranked = Array.from(map.entries())
        .map(([user_id, v]) => ({ user_id, ...v }))
        .sort((a, b) => b.total - a.total);
      setRanking(ranked);
    }

    // Movimientos
    const { data: movs } = await supabase
      .from("movimientos_alcanzia")
      .select("*")
      .eq("alcanzia_id", id)
      .order("fecha", { ascending: false });
    setMovimientos(movs || []);

    // Miembros
    const { data: mems } = await supabase
      .from("alcanzia_members")
      .select("*, profiles(full_name, email, phone, avatar_url)")
      .eq("alcanzia_id", id);
    setMembers(mems || []);

    // Retiros
    const { data: wds } = await supabase
      .from("withdrawals")
      .select("*, profiles:requested_by(full_name)")
      .eq("alcanzia_id", id)
      .order("created_at", { ascending: false });
    setWithdrawals(wds || []);

    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`alcanzia-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contributions", filter: `alcanzia_id=eq.${id}` },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "withdrawals", filter: `alcanzia_id=eq.${id}` },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadData]);

  // Mensaje de pago desde URL
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") setPaymentMsg("¡Pago exitoso! El aporte se acreditará en unos segundos.");
    if (payment === "failure") setPaymentMsg("El pago fue rechazado o cancelado.");
    if (payment === "pending") setPaymentMsg("Pago pendiente. Te avisaremos cuando se confirme.");
  }, [searchParams]);

  const handleContribute = async () => {
    if (!id || !user) return;
    const amount = parseFloat(contributeAmount);
    if (isNaN(amount) || amount < 1000) {
      alert("El monto mínimo es $1.000 ARS");
      return;
    }

    setContributing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-preference`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            alcanzia_id: id,
            amount,
            title: `Aporte a ${alcanzia?.title}`,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error al crear el pago");
        return;
      }

      // Redirigir a Mercado Pago
      const url = data.sandbox_init_point || data.init_point;
      window.location.href = url;
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
      setContributing(false);
    }
  };

  const copyInviteLink = () => {
    if (!alcanzia) return;
    const link = `${window.location.origin}/join/${alcanzia.invite_token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRequestWithdraw = async () => {
    if (!id || !user) return;
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Ingresa un monto válido");
      return;
    }
    if (amount > balance) {
      alert(`El saldo disponible es ${formatMoney(balance)}`);
      return;
    }

    setWithdrawing(true);
    const { error } = await supabase.from("withdrawals").insert({
      alcanzia_id: id,
      amount,
      currency: alcanzia?.currency || "ARS",
      description: withdrawDesc || null,
      requested_by: user.id,
    } as any);
    setWithdrawing(false);

    if (error) {
      alert(error.message);
      return;
    }

    setShowWithdrawForm(false);
    setWithdrawAmount("");
    setWithdrawDesc("");
    loadData();
  };

  const handleApproveWithdraw = async (withdrawalId: string, approve: boolean) => {
    const { error } = await (supabase.from("withdrawals") as any)
      .update({
        status: approve ? "approved" : "rejected",
        approved_by: user?.id,
        rejection_reason: approve ? null : "Rechazado por el administrador",
      })
      .eq("id", withdrawalId);

    if (error) alert(error.message);
    else loadData();
  };

  const handleMarkPaid = async (withdrawalId: string) => {
    const { error } = await (supabase.from("withdrawals") as any)
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", withdrawalId);

    if (error) alert(error.message);
    else loadData();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!alcanzia) {
    return <div className="text-center py-20 text-gray-500">Alcanzia no encontrada</div>;
  }

  const isResponsible = alcanzia.withdrawal_responsible_id === user?.id;
  const isAdmin = myRole === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{alcanzia.title}</h1>
            {alcanzia.description && (
              <p className="text-gray-500 mt-1">{alcanzia.description}</p>
            )}
          </div>
          <button
            onClick={copyInviteLink}
            className="inline-flex items-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
            {copied ? "¡Copiado!" : "Invitar"}
          </button>
        </div>

        <div className="mt-6">
          <ProgressBar current={balance} goal={alcanzia.goal_amount} currency={alcanzia.currency} />
        </div>

        {paymentMsg && (
          <div className="mt-4 bg-blue-50 text-blue-700 text-sm p-3 rounded-lg">{paymentMsg}</div>
        )}
      </div>

      {/* Aportar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-brand-600" />
          Hacer un aporte
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="number"
            value={contributeAmount}
            onChange={(e) => setContributeAmount(e.target.value)}
            min="1000"
            step="100"
            placeholder="Monto mínimo $1.000"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
          <button
            onClick={handleContribute}
            disabled={contributing}
            className="bg-brand-600 text-white font-medium px-6 py-2 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
          >
            {contributing ? "Procesando..." : "Pagar con Mercado Pago"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Las comisiones de Mercado Pago las abona el aportante en cada transacción.
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {[
            { key: "ranking", label: "Ranking", icon: Trophy },
            { key: "historial", label: "Historial", icon: History },
            { key: "retiros", label: "Retiros", icon: Wallet },
            { key: "miembros", label: "Miembros", icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition ${
                activeTab === key
                  ? "text-brand-700 border-b-2 border-brand-600 bg-brand-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Ranking */}
          {activeTab === "ranking" && (
            <div className="space-y-3">
              {ranking.length === 0 ? (
                <p className="text-gray-500 text-sm">Aún no hay aportes</p>
              ) : (
                ranking.map((r, i) => (
                  <div key={r.user_id} className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0
                          ? "bg-yellow-100 text-yellow-700"
                          : i === 1
                          ? "bg-gray-100 text-gray-600"
                          : i === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center overflow-hidden">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-brand-700 font-medium">
                          {(r.full_name || "?")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                      {r.full_name || "Usuario"}
                    </span>
                    <span className="text-sm font-semibold text-brand-700">
                      {formatMoney(r.total, alcanzia.currency)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Historial */}
          {activeTab === "historial" && (
            <div className="space-y-3">
              {movimientos.length === 0 ? (
                <p className="text-gray-500 text-sm">Sin movimientos aún</p>
              ) : (
                movimientos.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        m.tipo === "aporte" ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {m.usuario_nombre || "Usuario"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {m.tipo === "aporte" ? "Aporte" : "Retiro"} ·{" "}
                        {m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : ""}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        m.tipo === "aporte" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {m.tipo === "aporte" ? "+" : ""}
                      {formatMoney(m.monto_neto ?? m.monto, m.currency)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Retiros */}
          {activeTab === "retiros" && (
            <div className="space-y-4">
              {isResponsible && (
                <div>
                  {!showWithdrawForm ? (
                    <button
                      onClick={() => setShowWithdrawForm(true)}
                      className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition"
                    >
                      Solicitar retiro
                    </button>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Monto a retirar"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <input
                        type="text"
                        value={withdrawDesc}
                        onChange={(e) => setWithdrawDesc(e.target.value)}
                        placeholder="Descripción / motivo"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleRequestWithdraw}
                          disabled={withdrawing}
                          className="bg-brand-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                        >
                          {withdrawing ? "Enviando..." : "Confirmar solicitud"}
                        </button>
                        <button
                          onClick={() => setShowWithdrawForm(false)}
                          className="text-sm text-gray-500 px-3"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {withdrawals.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay retiros registrados</p>
              ) : (
                withdrawals.map((w: any) => (
                  <div key={w.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{formatMoney(w.amount, w.currency)}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          w.status === "approved" || w.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : w.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                    <p className="text-gray-500 mt-1">
                      {w.profiles?.full_name || "Usuario"} ·{" "}
                      {new Date(w.created_at).toLocaleDateString("es-AR")}
                    </p>
                    {w.description && <p className="text-gray-600 mt-1">{w.description}</p>}

                    {isAdmin && w.status === "pending" && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleApproveWithdraw(w.id, true)}
                          className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1 rounded"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Aprobar
                        </button>
                        <button
                          onClick={() => handleApproveWithdraw(w.id, false)}
                          className="inline-flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1 rounded"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Rechazar
                        </button>
                      </div>
                    )}

                    {isAdmin && w.status === "approved" && (
                      <button
                        onClick={() => handleMarkPaid(w.id)}
                        className="mt-2 text-xs bg-blue-600 text-white px-2.5 py-1 rounded"
                      >
                        Marcar como pagado
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Miembros */}
          {activeTab === "miembros" && (
            <div className="space-y-3">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center overflow-hidden">
                    {m.profiles?.avatar_url ? (
                      <img src={m.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm text-brand-700 font-medium">
                        {(m.profiles?.full_name || "?")[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {m.profiles?.full_name || "Usuario"}
                      {m.role === "admin" && (
                        <span className="ml-1.5 text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {m.profiles?.email}
                      {m.profiles?.phone ? ` · ${m.profiles.phone}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
