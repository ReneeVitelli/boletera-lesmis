Boletera Casera - Starter

Contenido:
- backend/: servidor Express con endpoints para crear preferencias (Mercado Pago sandbox),
  webhook para emitir boletos y generación de PDF con QR (envío por email).
- frontend/: app Vite + React con listado de funciones y botón para crear preferencia.

Instrucciones rápidas:
1) Backend:
   cd backend
   npm install
   cp .env.example .env
   # Edita .env y añade tus credenciales de prueba de Mercado Pago y SMTP.
   npm run dev

2) Frontend:
   cd frontend
   npm install
   npm run dev

3) Para recibir webhooks de MP en local usa ngrok:
   ngrok http 8080
   y configura la URL en Mercado Pago: https://<tu-ngrok>.ngrok.io/api/payments/webhook

Nota: los tokens en .env.example son placeholders; obtén tus credenciales sandbox en https://www.mercadopago.com.ar/developers
