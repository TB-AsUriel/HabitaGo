# HabitaGo 🏠

Plataforma web estilo Airbnb para descubrir y reservar alojamientos únicos. Proyecto educativo con frontend en HTML/CSS/JS y backend en Node.js + Express.

## 🌐 Demo en vivo

Publicada con GitHub Pages: https://TB-AsUriel.github.io/HabitaGo/

La aplicación funciona en **modo híbrido**:
- En GitHub Pages (estático): los datos se cargan desde `data/properties.json` y las reservas se guardan en `localStorage` del navegador.
- En local con Node.js: usa la API REST y persiste las reservas en `data/bookings.json`.

## Características

- 🔍 Búsqueda por destino, fechas y huéspedes
- 🏷️ Filtros por categoría, ciudad y precio
- 🖼️ Vista de detalle con galería de fotos, comodidades y valoraciones
- 📅 Reserva simulada con cálculo de total por noches
- ❤️ Favoritos guardados en el navegador
- 🗓️ Historial de reservas (servidor en modo local / navegador en Pages)
- 📱 Diseño responsive estilo Airbnb

## Estructura

```
HabitaGo/
├── server.js            # API REST con Express (usa las mismas vistas para local)
├── package.json
├── index.html           # Interfaz (raíz requerida por GitHub Pages)
├── css/styles.css       # Estilos
├── js/app.js            # Lógica del frontend (modo híbrido API/estático)
├── data/
│   ├── properties.json  # Catálogo de alojamientos
│   └── bookings.json    # Reservas (se crea automáticamente)
└── .nojekyll            # Evita que Jekyll procese el sitio en Pages
```

## Requisitos

- Node.js 18 o superior

## Instalación y uso

```bash
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

Para desarrollo con recarga automática: `npm run dev`

## API REST

| Método | Ruta                    | Descripción                                    |
|--------|-------------------------|------------------------------------------------|
| GET    | `/api/properties`       | Lista alojamientos. Filtros por query: `ciudad`, `categoria`, `huespedes`, `precioMax`, `precioMin` |
| GET    | `/api/properties/:id`   | Detalle de un alojamiento                      |
| GET    | `/api/properties/categorias` | Categorías disponibles                    |
| GET    | `/api/properties/ciudades`   | Ciudades disponibles                      |
| GET    | `/api/bookings`         | Lista todas las reservas                       |
| POST   | `/api/bookings`         | Crea una reserva (JSON: `propertyId`, `nombre`, `email`, `fechaInicio`, `fechaFin`, `huespedes`) |