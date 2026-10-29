const express = require('express');
const path = require('path');
const fs = require('fs');
const Reglas = require('./js/reglas.js');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const CLEANINGS_FILE = path.join(DATA_DIR, 'cleanings.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function ensureFile(file, inicial) {
  if (!fs.existsSync(file)) writeJSON(file, inicial);
}

const leerPropiedades = () => readJSON(PROPERTIES_FILE).map(Reglas.normalizarPropiedad);
const leerReservas = () => {
  ensureFile(BOOKINGS_FILE, { bookings: [] });
  return readJSON(BOOKINGS_FILE).bookings;
};
const leerLimpiezas = () => {
  ensureFile(CLEANINGS_FILE, { cleanings: [] });
  return readJSON(CLEANINGS_FILE).cleanings;
};

const ARCHIVOS_PRIVADOS = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/data/bookings.json',
  '/data/cleanings.json'
];

app.use(express.json());
app.use((req, res, next) => {
  if (
    req.path.startsWith('/node_modules') ||
    ARCHIVOS_PRIVADOS.includes(req.path)
  ) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(__dirname));

// ---------- Alojamientos ----------

app.get('/api/properties', (req, res) => {
  let properties = leerPropiedades();
  const { ciudad, destino, categoria, huespedes, precioMax, precioMin, llegada, salida, anfitrionId } = req.query;

  if (anfitrionId) {
    properties = properties.filter((p) => p.anfitrionId === anfitrionId);
  }
  if (ciudad) {
    properties = properties.filter((p) => Reglas.coincideDestino(p, ciudad));
  }
  if (destino) {
    properties = properties.filter((p) => Reglas.coincideDestino(p, destino));
  }
  if (categoria) {
    const catNorm = categoria.toLowerCase();
    properties = properties.filter((p) => p.categoria.toLowerCase() === catNorm);
  }
  if (huespedes) {
    properties = properties.filter((p) => p.huespedes >= Number(huespedes));
  }
  if (precioMin) {
    properties = properties.filter((p) => p.precioPorNoche >= Number(precioMin));
  }
  if (precioMax) {
    properties = properties.filter((p) => p.precioPorNoche <= Number(precioMax));
  }
  if (llegada && salida && llegada < salida) {
    const reservas = leerReservas();
    properties = properties.filter((p) => !Reglas.hayTraslape(reservas, p.id, llegada, salida));
  }

  res.json(properties);
});

app.get('/api/properties/categorias', (req, res) => {
  const categorias = [...new Set(leerPropiedades().map((p) => p.categoria))];
  res.json(categorias);
});

app.get('/api/properties/ciudades', (req, res) => {
  const ciudades = [...new Set(leerPropiedades().map((p) => `${p.ciudad}, ${p.pais}`))];
  res.json(ciudades);
});

app.get('/api/properties/:id', (req, res) => {
  const property = leerPropiedades().find((p) => p.id === Number(req.params.id));
  if (!property) {
    return res.status(404).json({ error: 'Alojamiento no encontrado' });
  }
  res.json(property);
});

// Fechas ya reservadas (de hoy en adelante) para mostrarlas en el detalle
app.get('/api/properties/:id/ocupadas', (req, res) => {
  const id = Number(req.params.id);
  const hoy = Reglas.hoyISO();
  const ocupadas = leerReservas()
    .filter((b) => Number(b.propertyId) === id && b.fechaFin >= hoy)
    .map((b) => ({ fechaInicio: b.fechaInicio, fechaFin: b.fechaFin }))
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  res.json(ocupadas);
});

// Publicar una casa
app.post('/api/properties', (req, res) => {
  const v = Reglas.validarPropiedad(req.body || {});
  if (!v.ok) return res.status(400).json({ error: v.error });

  const todas = readJSON(PROPERTIES_FILE);
  const id = todas.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  const nueva = {
    id,
    ...v.data,
    valoracion: 0,
    numValoraciones: 0,
    usuario: true,
    creadoEn: new Date().toISOString()
  };
  todas.unshift(nueva);
  writeJSON(PROPERTIES_FILE, todas);

  res.status(201).json({ message: 'Casa publicada', property: nueva });
});

function propiedadDelAnfitrion(req, res) {
  const anfitrionId = (req.body && req.body.anfitrionId) || req.query.anfitrionId;
  const todas = readJSON(PROPERTIES_FILE);
  const idx = todas.findIndex((p) => p.id === Number(req.params.id));
  if (idx === -1) {
    res.status(404).json({ error: 'Alojamiento no encontrado' });
    return null;
  }
  if (!anfitrionId || todas[idx].anfitrionId !== anfitrionId) {
    res.status(403).json({ error: 'No eres el anfitrión de este alojamiento' });
    return null;
  }
  return { todas, idx };
}

// Cambiar horarios y limpieza de una casa propia
app.patch('/api/properties/:id/limpieza', (req, res) => {
  const ctx = propiedadDelAnfitrion(req, res);
  if (!ctx) return;
  const { todas, idx } = ctx;
  const cfg = Reglas.aplicarConfigLimpieza(todas[idx], req.body || {});
  if (!cfg.ok) return res.status(400).json({ error: cfg.error });
  const candidata = cfg.data;

  todas[idx] = {
    ...todas[idx],
    horaCheckin: candidata.horaCheckin,
    horaCheckout: candidata.horaCheckout,
    limpieza: candidata.limpieza
  };
  writeJSON(PROPERTIES_FILE, todas);

  // Las limpiezas pendientes adoptan el nuevo horario (o se cancelan si se desactiva)
  const limpiezas = leerLimpiezas();
  limpiezas.forEach((t) => {
    if (t.propertyId === todas[idx].id && t.estado === 'pendiente') {
      if (!candidata.limpieza.activa) {
        t.estado = 'cancelada';
      } else {
        t.hora = candidata.limpieza.hora;
        t.duracionHoras = candidata.limpieza.duracionHoras;
      }
    }
  });
  writeJSON(CLEANINGS_FILE, { cleanings: limpiezas });

  res.json({ message: 'Horarios actualizados', property: todas[idx] });
});

// Despublicar una casa propia (si no tiene reservas por venir)
app.delete('/api/properties/:id', (req, res) => {
  const ctx = propiedadDelAnfitrion(req, res);
  if (!ctx) return;
  const { todas, idx } = ctx;
  const id = todas[idx].id;

  const hoy = Reglas.hoyISO();
  const pendientes = leerReservas().some((b) => Number(b.propertyId) === id && b.fechaFin >= hoy);
  if (pendientes) {
    return res.status(409).json({ error: 'No puedes eliminarla: tiene reservas vigentes o futuras' });
  }

  todas.splice(idx, 1);
  writeJSON(PROPERTIES_FILE, todas);
  writeJSON(CLEANINGS_FILE, { cleanings: leerLimpiezas().filter((t) => t.propertyId !== id) });
  res.json({ message: 'Anuncio eliminado' });
});

// ---------- Reservas ----------

app.get('/api/bookings', (req, res) => {
  res.json(leerReservas());
});

app.post('/api/bookings', (req, res) => {
  const { propertyId, nombre, email, fechaInicio, fechaFin, huespedes } = req.body;

  if (!propertyId || !nombre || !email || !fechaInicio || !fechaFin || !huespedes) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (!Reglas.FECHA_RE.test(fechaInicio) || !Reglas.FECHA_RE.test(fechaFin)) {
    return res.status(400).json({ error: 'Formato de fecha inválido' });
  }

  const property = leerPropiedades().find((p) => p.id === Number(propertyId));
  if (!property) {
    return res.status(404).json({ error: 'Alojamiento no encontrado' });
  }

  if (fechaInicio < Reglas.hoyISO(-1)) {
    return res.status(400).json({ error: 'La fecha de llegada no puede estar en el pasado' });
  }
  if (fechaInicio >= fechaFin) {
    return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la de inicio' });
  }
  if (Number(huespedes) < 1 || Number(huespedes) > property.huespedes) {
    return res.status(400).json({ error: `Este alojamiento admite de 1 a ${property.huespedes} huéspedes` });
  }

  const reservas = leerReservas();
  if (Reglas.hayTraslape(reservas, property.id, fechaInicio, fechaFin)) {
    return res.status(409).json({ error: 'Esas fechas ya no están disponibles para este alojamiento' });
  }

  const noches = Math.round((new Date(fechaFin) - new Date(fechaInicio)) / 86400000);
  const total = noches * property.precioPorNoche;

  const booking = {
    id: Date.now(),
    propertyId: property.id,
    propertyTitulo: property.titulo,
    nombre: String(nombre).trim(),
    email: String(email).trim(),
    fechaInicio,
    fechaFin,
    noches,
    huespedes: Number(huespedes),
    horaCheckin: property.horaCheckin,
    horaCheckout: property.horaCheckout,
    total
  };

  reservas.push(booking);
  writeJSON(BOOKINGS_FILE, { bookings: reservas });

  // Programar automáticamente la limpieza para el día de salida
  const tarea = Reglas.crearTareaLimpieza(booking, property);
  if (tarea) {
    const limpiezas = leerLimpiezas();
    limpiezas.push(tarea);
    writeJSON(CLEANINGS_FILE, { cleanings: limpiezas });
  }

  res.status(201).json({ message: 'Reserva confirmada', booking, limpieza: tarea });
});

// ---------- Limpiezas (panel del anfitrión) ----------

app.get('/api/cleanings', (req, res) => {
  const { anfitrionId } = req.query;
  if (!anfitrionId) return res.status(400).json({ error: 'Falta anfitrionId' });
  const lista = leerLimpiezas()
    .filter((t) => t.anfitrionId === anfitrionId)
    .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
  res.json(lista);
});

app.patch('/api/cleanings/:id', (req, res) => {
  const { anfitrionId, hora, estado } = req.body;
  const limpiezas = leerLimpiezas();
  const tarea = limpiezas.find((t) => t.id === req.params.id);
  if (!tarea) return res.status(404).json({ error: 'Limpieza no encontrada' });
  if (!anfitrionId || tarea.anfitrionId !== anfitrionId) {
    return res.status(403).json({ error: 'No tienes permiso sobre esta limpieza' });
  }

  if (estado !== undefined) {
    if (!Reglas.ESTADOS_LIMPIEZA.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    tarea.estado = estado;
  }

  if (hora !== undefined) {
    const propiedad = leerPropiedades().find((p) => p.id === tarea.propertyId);
    if (!propiedad) return res.status(404).json({ error: 'El alojamiento ya no existe' });
    const errHora = Reglas.validarHoraTarea(tarea, hora, propiedad, leerReservas());
    if (errHora) return res.status(400).json({ error: errHora });
    tarea.hora = hora;
  }

  writeJSON(CLEANINGS_FILE, { cleanings: limpiezas });
  res.json({ message: 'Limpieza actualizada', limpieza: tarea });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`HabitaGo corriendo en http://localhost:${PORT}`);
});
