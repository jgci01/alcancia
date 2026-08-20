import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export default function JoinAlcanzia() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading || !token) return;

    if (!user) {
      localStorage.setItem("pendingJoinToken", token);
      navigate("/register");
      return;
    }

    const join = async () => {
      const { data, error } = await supabase.rpc("join_alcanzia_by_token", {
        p_token: token,
      } as any);

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("success");
      setMessage("¡Te uniste correctamente!");
      localStorage.removeItem("pendingJoinToken");
      setTimeout(() => navigate(`/alcanzia/${data}`), 1200);
    };

    join();
  }, [token, user, authLoading, navigate]);

  return (
    <div className="max-w-md mx-auto text-center py-20">
      {status === "loading" && (
        <>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Uniéndote a la alcanzia...</p>
        </>
      )}
      {status === "success" && (
        <div className="bg-green-50 text-green-700 p-6 rounded-xl">
          <p className="font-medium text-lg">{message}</p>
          <p className="text-sm mt-1">Redirigiendo...</p>
        </div>
      )}
      {status === "error" && (
        <div className="bg-red-50 text-red-700 p-6 rounded-xl">
          <p className="font-medium text-lg">No se pudo unir</p>
          <p className="text-sm mt-1">{message}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-sm underline"
          >
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}
