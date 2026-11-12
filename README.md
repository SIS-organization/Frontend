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


## Endpoint-uri principale

Fluxul de rezervare este construit pe următoarele endpoint-uri:

- `GET /users/me/quota`
- `GET /facilities`
- `GET /facilities/:id/availability?date=YYYY-MM-DD`
- `POST /bookings`
- `GET /bookings/:id`

