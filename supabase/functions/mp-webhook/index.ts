import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Mercado Pago puede enviar query params o body
    const url = new URL(req.url);
    let topic = url.searchParams.get("topic") || url.searchParams.get("type");
    let paymentId = url.searchParams.get("id") || url.searchParams.get("data.id");

    // También intentar leer del body (IPN / Webhooks modernos)
    if (req.method === "POST") {
      try {
        const body = await req.json();
        topic = topic || body.type || body.topic || body.action;
        paymentId = paymentId || body.data?.id || body.id;
      } catch {
        // body vacío o no JSON, continuar con query params
      }
    }

    // Solo nos interesan notificaciones de payment
    if (topic !== "payment" && topic !== "payment.created" && topic !== "payment.updated") {
      return new Response(JSON.stringify({ message: "Ignored topic" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ error: "No payment id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      console.error("MP_ACCESS_TOKEN missing");
      return new Response(JSON.stringify({ error: "Config error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar el pago directamente con la API de Mercado Pago (anti-fraude)
    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    });

    if (!paymentRes.ok) {
      console.error("Error fetching payment from MP:", await paymentRes.text());
      return new Response(JSON.stringify({ error: "Payment not found in MP" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await paymentRes.json();

    const externalReference = payment.external_reference;
    const status = payment.status; // approved, rejected, pending, etc.
    const transactionAmount = payment.transaction_amount;
    const fee = payment.fee_details?.reduce((acc: number, f: any) => acc + (f.amount || 0), 0) || 0;
    const netAmount = transactionAmount - fee;

    if (!externalReference) {
      console.error("Payment without external_reference:", paymentId);
      return new Response(JSON.stringify({ message: "No external_reference" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente admin (service_role) para poder actualizar status
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Buscar la contribución por external_reference (idempotencia)
    const { data: contribution, error: findError } = await supabaseAdmin
      .from("contributions")
      .select("id, status")
      .eq("external_reference", externalReference)
      .single();

    if (findError || !contribution) {
      console.error("Contribution not found for external_reference:", externalReference);
      return new Response(JSON.stringify({ message: "Contribution not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotencia: si ya está approved, no hacer nada
    if (contribution.status === "approved") {
      return new Response(JSON.stringify({ message: "Already processed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newStatus: "approved" | "rejected" | "pending" = "pending";

    if (status === "approved") {
      newStatus = "approved";
    } else if (status === "rejected" || status === "cancelled" || status === "refunded") {
      newStatus = "rejected";
    } else {
      // pending, in_process, etc. → dejamos en pending
      return new Response(JSON.stringify({ message: "Payment still pending" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Actualizar contribución (esto dispara Realtime)
    const updateData: Record<string, any> = {
      status: newStatus,
      mp_payment_id: String(paymentId),
      mp_fee: fee,
      net_amount: newStatus === "approved" ? netAmount : null,
    };

    if (newStatus === "approved") {
      updateData.payment_date = payment.date_approved || new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from("contributions")
      .update(updateData)
      .eq("id", contribution.id)
      .eq("status", "pending"); // solo si sigue pending (doble check de idempotencia)

    if (updateError) {
      console.error("Error updating contribution:", updateError);
      return new Response(JSON.stringify({ error: "Update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Contribution ${contribution.id} updated to ${newStatus}`);

    return new Response(JSON.stringify({ message: "OK", status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
