# Alcanzia Digital

Aplicación de ahorro grupal ("vaquita") con React + Vite + Tailwind, Supabase y Mercado Pago Argentina.

## Estructura del proyecto

```
alcanzia-digital/
├── frontend/                  ← React + Vite + Tailwind (desplegar en Vercel)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── types/
│   │   └── contexts/
│   ├── package.json
│   └── ...
├── supabase/
│   ├── functions/
│   │   ├── create-preference/   ← Crea preferencia de MP + registro pending
│   │   └── mp-webhook/          ← Webhook idempotente de Mercado Pago
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
└── README.md
```

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/migrations/001_initial_schema.sql`.
3. En **Authentication → Providers** habilita Email.
4. Copia la **URL** y las keys (**anon** y **service_role**) desde Settings → API.

## 2. Variables de entorno (Edge Functions)

En el dashboard de Supabase → **Edge Functions → Secrets** agrega:

| Secret                    | Valor                                      |
|---------------------------|--------------------------------------------|
| `SUPABASE_URL`            | https://xxxx.supabase.co                   |
| `SUPABASE_ANON_KEY`       | eyJ... (anon key)                          |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJ... (service_role key)                |
| `MP_ACCESS_TOKEN`         | APP_USR-... (token de Mercado Pago)        |
| `FRONTEND_URL`            | https://tu-app.vercel.app                  |

## 3. Desplegar Edge Functions

```bash
# Instalar Supabase CLI si no lo tienes
npm i -g supabase

# Login
supabase login

# Link al proyecto
supabase link --project-ref TU_PROJECT_REF

# Desplegar funciones
supabase functions deploy create-preference
supabase functions deploy mp-webhook
```

**Importante:** En Mercado Pago (Credenciales → Webhooks / IPN) configura la URL:

```
https://TU_PROJECT.supabase.co/functions/v1/mp-webhook
```

## 4. Frontend (Vercel)

```bash
cd frontend
cp .env.example .env
# Edita .env con tu VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

npm install
npm run dev          # desarrollo local
npm run build        # build de producción
```

### Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel → New Project → selecciona el repo.
3. **Root Directory**: `frontend`
4. Agrega las environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

O desde la carpeta:

```bash
cd frontend
npx vercel
```

## 5. Mercado Pago (Sandbox)

1. Crea una cuenta en [developers.mercadopago.com](https://www.mercadopago.com.ar/developers).
2. Usa las **Credenciales de prueba** (`TEST-...` o `APP_USR-...` de test).
3. En el frontend, la Edge Function devuelve `sandbox_init_point` cuando corresponde.
4. Tarjetas de prueba: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/test-cards

## Funcionalidades incluidas

- Registro / Login (Supabase Auth)
- Crear alcanzia con meta
- Invitación por link único (`/join/{token}`)
- Aportes vía Mercado Pago Checkout Pro
- Webhook idempotente + verificación real del pago
- Realtime: el pozo se actualiza solo
- Ranking de aportantes
- Historial unificado (aportes + retiros)
- Retiros: solo el responsable designado solicita → Admin aprueba/rechaza → marca como pagado
- Auditoría de cambios de estado de retiros
- Campo teléfono en perfiles
- Moneda preparada para multi-currency (ARS ahora)
- Mínimo de aporte: $1.000 ARS
- La alcanzia **no se cierra** al alcanzar la meta

## Flujo de pago

1. Usuario hace clic en "Pagar con Mercado Pago".
2. Edge Function `create-preference` crea un registro `pending` + preferencia MP.
3. Usuario paga en Mercado Pago.
4. MP llama al webhook `mp-webhook`.
5. Se verifica el pago contra la API de MP.
6. Se actualiza el status a `approved` (o `rejected`) → Realtime actualiza la UI.

## Notas de seguridad

- El cliente **nunca** puede cambiar el `status` de un aporte (RLS bloquea updates).
- Solo la `SERVICE_ROLE_KEY` (usada en Edge Functions) puede modificar estados de pago.
- El webhook verifica el pago real contra la API de Mercado Pago (anti-fraude).
- Retiros validados contra el saldo disponible (trigger + función SQL).

---

Hecho con ❤️ para ahorrar en grupo.
