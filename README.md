# HabitaGo 🏠

Plataforma web estilo Airbnb para descubrir y reservar alojamientos únicos. Proyecto educativo con frontend en HTML/CSS/JS y backend en Node.js + Express.

## Características

- 🔍 Búsqueda por destino, fechas y huéspedes
- 🏷️ Filtros por categoría, ciudad y precio
- 🖼️ Vista de detalle con galería de fotos, comodidades y valoraciones
- 📅 Reserva simulada con cálculo de total por noches
- ❤️ Favoritos guardados en el navegador
- 🗓️ Historial de reservas persistido en el servidor
- 📱 Diseño responsive estilo Airbnb

## Estructura

```
HabitaGo/
├── server.js            # API REST con Express
├── package.json
├── data/
│   ├── properties.json  # Catálogo de alojamientos
│   └── bookings.json    # Reservas (se crea automáticamente)
└── public/
    ├── index.html       # Interfaz
    ├── css/styles.css   # Estilos
    └── js/app.js        # Lógica del frontend
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