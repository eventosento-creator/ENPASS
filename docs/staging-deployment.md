# Entorno STAGING / BETA

Este documento describe un entorno remoto de prueba. No es producción, no usa dominio comercial, compradores reales ni dinero real.

## Topología

```text
GitHub privado / main
        ↓
Vercel staging (*.vercel.app)
        ↓
Supabase Cloud staging
```

`main` representa el staging estable. Cada pull request puede generar un Preview separado. No se usa GitFlow ni force push.

## Secretos

Los secretos viven únicamente en Supabase/Vercel y nunca en Git. Staging genera valores propios para:

- service role de Supabase;
- cifrado de credenciales de pago;
- cifrado de tokens QR;
- Mercado Pago sandbox;
- SMTP sandbox o proveedor transaccional en modo testing.

`.env.example` contiene nombres reales y placeholders. Antes de cada push se revisan working tree, staged files e historial por credenciales. El service role solo se importa desde módulos server-only.

## Supabase staging

1. Crear o reutilizar un proyecto dedicado a staging en una región sudamericana disponible.
2. Vincular la CLI al project ref de staging.
3. Comparar estado con `npx supabase migration list`.
4. Aplicar exclusivamente las migrations versionadas con `npx supabase db push`.
5. Crear datos demo controlados; no copiar tokens QR, PINs, buyers ni contraseñas del seed local.
6. Configurar Site URL y redirects exactos para la URL estable de Vercel y los previews necesarios.
7. Verificar bucket `event-covers`, lectura pública y policies de upload/replace.

`supabase db reset` es válido en local. No debe ejecutarse sobre staging una vez que haya testers sin una decisión explícita de borrar esos datos.

## Vercel

Conectar el repositorio existente, sin crear otro repo. Configurar las variables de `.env.example` en el scope correspondiente:

- Production de ese proyecto se usa como staging estable mientras no exista producción comercial.
- Preview usa el mismo Supabase staging solo durante esta beta controlada; los datos no están aislados por branch.
- Development permanece local.

`APP_URL`, `NEXT_PUBLIC_SITE_URL` y `MERCADO_PAGO_REDIRECT_URI` deben usar la URL HTTPS real asignada. No asociar DNS final.

## Email

Mailpit es local y no existe en Vercel. Staging debe usar SMTP sandbox o proveedor transaccional en modo testing mediante `EmailProvider`. Validar magic link de comprador, invitación RRPP y entrega de accesos sin habilitar email masivo.

## Mercado Pago sandbox

Usar solamente aplicación y usuarios de prueba. Registrar el callback OAuth y webhook HTTPS de staging. El journey obligatorio es seller test → OAuth → buyer test → Checkout Pro → webhook firmado → Payment approved → Order paid → hold consumed → credencial → email. Reenviar el webhook debe producir cero efectos extra.

## Scanner y fixtures

`/dev/qr` responde 404 en builds de producción y no debe abrirse públicamente. Para staging, generar una compra sandbox real y mostrar su QR desde “Mis accesos”. Los PINs deben ser temporales y generados por un Producer; nunca usar los PINs conocidos del seed local.

Validar cámara y permisos desde iPhone/Android reales sobre HTTPS. Browser emulation complementa, pero no reemplaza, esa prueba física.

## Verificación y rollback

Antes del push/deploy:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:concurrency
npx supabase db lint --local --schema public --level warning --fail-on warning
npm run build
```

Después del deploy verificar `/`, `/eventos`, `/e/noche-2000`, `/app`, RRPP, Mesas, Mis accesos y `/scan`. Para rollback, promover el último deployment Vercel sano. Las migrations son forward-only: un rollback de aplicación no revierte automáticamente PostgreSQL.
