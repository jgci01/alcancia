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
    const { alcanzia_id, amount, title } = await req.json();

    if (!alcanzia_id || !amount || amount < 1000) {
      return new Response(
        JSON.stringify({ error: "Datos inválidos. Monto mínimo $1000 ARS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente con el JWT del usuario (para RLS)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Cliente service_role (para operaciones privilegiadas)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Obtener usuario autenticado
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "No autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar que el usuario es miembro de la alcanzia
    const { data: membership, error: memberError } = await supabaseUser
      .from("alcanzia_members")
      .select("id")
      .eq("alcanzia_id", alcanzia_id)
      .eq("user_id", user.id)
      .single();

    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ error: "No eres miembro de esta alcanzia" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtener datos de la alcanzia
    const { data: alcanzia, error: alcanziaError } = await supabaseUser
      .from("alcanzias")
      .select("title, currency")
      .eq("id", alcanzia_id)
      .single();

    if (alcanziaError || !alcanzia) {
      return new Response(
        JSON.stringify({ error: "Alcanzia no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Crear registro de contribución en estado pending
    const externalReference = crypto.randomUUID();

    const { data: contribution, error: contribError } = await supabaseAdmin
      .from("contributions")
      .insert({
        alcanzia_id,
        user_id: user.id,
        amount,
        currency: alcanzia.currency || "ARS",
        status: "pending",
        external_reference: externalReference,
      })
      .select()
      .single();

    if (contribError || !contribution) {
      console.error("Error creating contribution:", contribError);
      return new Response(
        JSON.stringify({ error: "No se pudo crear el aporte" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Crear preferencia en Mercado Pago
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: "MP_ACCESS_TOKEN no configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "http://localhost:5173";

    const preferenceBody = {
      items: [
        {
          title: title || `Aporte a ${alcanzia.title}`,
          quantity: 1,
          unit_price: Number(amount),
          currency_id: alcanzia.currency || "ARS",
        },
      ],
      external_reference: externalReference,
      back_urls: {
        success: `${frontendUrl}/alcanzia/${alcanzia_id}?payment=success`,
        failure: `${frontendUrl}/alcanzia/${alcanzia_id}?payment=failure`,
        pending: `${frontendUrl}/alcanzia/${alcanzia_id}?payment=pending`,
      },
      auto_return: "approved",
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      statement_descriptor: "Alcanzia Digital",
      binary_mode: true, // Solo approved o rejected (sin pending intermedio en algunos casos)
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    const preference = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Mercado Pago error:", preference);
      // Limpiar la contribución pendiente si falla
      await supabaseAdmin.from("contributions").delete().eq("id", contribution.id);
      return new Response(
        JSON.stringify({ error: "Error al crear preferencia de pago", details: preference }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guardar el preference_id
    await supabaseAdmin
      .from("contributions")
      .update({ mp_preference_id: preference.id })
      .eq("id", contribution.id);

    return new Response(
      JSON.stringify({
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        preference_id: preference.id,
        contribution_id: contribution.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
