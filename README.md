# HabitaGo 🏠

Plataforma web estilo Airbnb para descubrir y reservar alojamientos únicos, y para que cualquier persona **publique su casa en renta**. Proyecto educativo con frontend en HTML/CSS/JS y backend en Node.js + Express.

## 🌐 Demo en vivo

Publicada con GitHub Pages: https://TB-AsUriel.github.io/HabitaGo/

La aplicación funciona en **modo híbrido**:
- En GitHub Pages (estático): los datos se cargan desde `data/properties.json`; reservas, casas publicadas y limpiezas se guardan en `localStorage` del navegador.
- En local con Node.js: usa la API REST y persiste todo en `data/*.json`.

Las reglas de negocio (validaciones, traslape de fechas, ventana de limpieza) viven en `js/reglas.js` y se comparten entre servidor y navegador, así ambos modos se comportan igual.

## Características

- 🔍 Búsqueda por destino (sin importar acentos), **fechas disponibles** y huéspedes
- 🏷️ Filtros por categoría, ciudad y precio
- 🖼️ Vista de detalle con galería, comodidades, horarios de llegada/salida y anfitrión
- 📅 Reserva con cálculo de total y **bloqueo de fechas ya ocupadas** (se permite salida y llegada el mismo día)
- ❤️ Favoritos guardados en el navegador
- 🗓️ Historial de reservas
- 🏡 **Publica tu casa**: formulario con tipo, precio, capacidad, comodidades, fotos y horarios
- 🧹 **Limpieza programada**: al reservar, se agenda automáticamente una limpieza para el día de salida del huésped, a la hora que definió el anfitrión
- 🧑‍💼 **Panel de anfitrión**: ver limpiezas pendientes, cambiar su hora, marcarlas como hechas, editar horarios de cada casa y eliminar anuncios
- 📱 Diseño responsive estilo Airbnb

### Cómo funciona la limpieza programada

Cada casa define: hora de llegada (`check-in`), hora de salida (`check-out`) y, si quiere, una limpieza automática con **hora** y **duración**. El sistema exige que `salida < inicio de limpieza` y que la limpieza **termine antes de la llegada del siguiente huésped**. Al crearse una reserva se genera una tarea de limpieza para su día de salida; el anfitrión puede mover la hora mientras respete esa ventana (si ese mismo día llega otro huésped, el margen se valida contra su hora de llegada).

> Sin cuentas de usuario todavía: el anfitrión se identifica con un ID aleatorio guardado en su navegador. Para probar, publica una casa, resérvala y abre **🧹 Panel anfitrión**.

## Estructura

```
HabitaGo/
├── server.js            # API REST con Express
├── package.json
├── index.html           # Interfaz (raíz requerida por GitHub Pages)
├── css/styles.css       # Estilos
├── js/
│   ├── reglas.js        # Reglas de negocio compartidas (servidor + navegador)
│   └── app.js           # Lógica del frontend (modo híbrido API/estático)
├── data/
│   ├── properties.json  # Catálogo (aquí se guardan también las casas publicadas)
│   ├── bookings.json    # Reservas (se crea automáticamente)
│   └── cleanings.json   # Limpiezas programadas (se crea automáticamente)
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

| Método | Ruta                              | Descripción |
|--------|-----------------------------------|-------------|
| GET    | `/api/properties`                 | Lista alojamientos. Filtros: `destino`, `ciudad`, `categoria`, `huespedes`, `precioMax`, `precioMin`, `llegada` + `salida` (solo disponibles), `anfitrionId` |
| GET    | `/api/properties/:id`             | Detalle de un alojamiento |
| GET    | `/api/properties/:id/ocupadas`    | Rangos de fechas ya reservados (de hoy en adelante) |
| GET    | `/api/properties/categorias`      | Categorías disponibles |
| GET    | `/api/properties/ciudades`        | Ciudades disponibles |
| POST   | `/api/properties`                 | Publica una casa (JSON: `titulo`, `categoria`, `ciudad`, `pais`, `ubicacion`, `precioPorNoche`, `huespedes`, `habitaciones`, `banos`, `descripcion`, `comodidades[]`, `imagenes[]`, `horaCheckin`, `horaCheckout`, `limpieza{activa,hora,duracionHoras}`, `anfitrion`, `anfitrionId`) |
| PATCH  | `/api/properties/:id/limpieza`    | Cambia horarios y limpieza de una casa propia (requiere `anfitrionId`) |
| DELETE | `/api/properties/:id?anfitrionId=`| Elimina un anuncio propio (si no tiene reservas vigentes o futuras) |
| GET    | `/api/bookings`                   | Lista todas las reservas |
| POST   | `/api/bookings`                   | Crea una reserva (`propertyId`, `nombre`, `email`, `fechaInicio`, `fechaFin`, `huespedes`); responde 409 si las fechas se cruzan y programa la limpieza |
| GET    | `/api/cleanings?anfitrionId=`     | Limpiezas de las casas de un anfitrión |
| PATCH  | `/api/cleanings/:id`              | Cambia `hora` o `estado` (`pendiente`/`hecha`/`cancelada`) de una limpieza |
