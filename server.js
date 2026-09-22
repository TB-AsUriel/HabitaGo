const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/properties', (req, res) => {
  let properties = readJSON(PROPERTIES_FILE);
  const { ciudad, categoria, huespedes, precioMax, precioMin } = req.query;

  if (ciudad) {
    const ciudadNorm = ciudad.toLowerCase();
    properties = properties.filter((p) => p.ciudad.toLowerCase().includes(ciudadNorm));
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

  res.json(properties);
});

app.get('/api/properties/categorias', (req, res) => {
  const properties = readJSON(PROPERTIES_FILE);
  const categorias = [...new Set(properties.map((p) => p.categoria))];
  res.json(categorias);
});

app.get('/api/properties/ciudades', (req, res) => {
  const properties = readJSON(PROPERTIES_FILE);
  const ciudades = [...new Set(properties.map((p) => `${p.ciudad}, ${p.pais}`))];
  res.json(ciudades);
});

app.get('/api/properties/:id', (req, res) => {
  const properties = readJSON(PROPERTIES_FILE);
  const property = properties.find((p) => p.id === Number(req.params.id));
  if (!property) {
    return res.status(404).json({ error: 'Alojamiento no encontrado' });
  }
  res.json(property);
});

function ensureBookingsFile() {
  if (!fs.existsSync(BOOKINGS_FILE)) {
    writeJSON(BOOKINGS_FILE, { bookings: [] });
  }
}

app.get('/api/bookings', (req, res) => {
  ensureBookingsFile();
  const bookings = readJSON(BOOKINGS_FILE);
  res.json(bookings.bookings);
});

app.post('/api/bookings', (req, res) => {
  const { propertyId, nombre, email, fechaInicio, fechaFin, huespedes } = req.body;

  if (!propertyId || !nombre || !email || !fechaInicio || !fechaFin || !huespedes) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const properties = readJSON(PROPERTIES_FILE);
  const property = properties.find((p) => p.id === Number(propertyId));
  if (!property) {
    return res.status(404).json({ error: 'Alojamiento no encontrado' });
  }

  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  if (inicio >= fin) {
    return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la de inicio' });
  }

  const noches = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
  const total = noches * property.precioPorNoche;

  const booking = {
    id: Date.now(),
    propertyId: Number(propertyId),
    propertyTitulo: property.titulo,
    nombre,
    email,
    fechaInicio,
    fechaFin,
    noches,
    huespedes: Number(huespedes),
    total
  };

  ensureBookingsFile();
  const data = readJSON(BOOKINGS_FILE);
  data.bookings.push(booking);
  writeJSON(BOOKINGS_FILE, data);

  res.status(201).json({ message: 'Reserva confirmada', booking });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`HabitaGo corriendo en http://localhost:${PORT}`);
});