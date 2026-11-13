# USV Campus Frontend

Frontend-ul aplicației pentru facilitățile sportive USV, cu rezervări, disponibilitate, listă de așteptare și pagină administrativă mockată.

## Tehnologii folosite

- React 19
- Vite
- TypeScript
- React Router
- Tailwind CSS
- Mock API local pentru dezvoltare fără backend

## Cerințe locale

- Node.js 18+
- npm


## Conectare la backend

1. Pornește backend-ul (vezi README-ul din repository-ul Backend): `http://localhost:8000`.
2. Copiază `.env.example` ca `.env` (implicit folosește backend-ul real, utilizatorul cu id 1).
3. `npm install`, apoi `npm run dev` și deschide http://localhost:5173.

## Endpoint-uri folosite (prefix `/v1`)

- `GET /facilities`
- `GET /facilities/{id}/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /bookings?scope=all&pageSize=100`
- `POST /bookings`
- `POST /bookings/{id}/cancel`

Până la autentificarea JWT, utilizatorul este trimis prin antetul `X-User-Id` (`VITE_USER_ID`).
