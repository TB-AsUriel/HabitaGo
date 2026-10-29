const R = window.Reglas;

const API = {
  properties: '/api/properties',
  categorias: '/api/properties/categorias',
  ciudades: '/api/properties/ciudades',
  bookings: '/api/bookings',
  cleanings: '/api/cleanings'
};

const BOOKINGS_KEY = 'habitago-reservas';
const FAVORITOS_KEY = 'habitago-favoritos';
const PROPS_USER_KEY = 'habitago-propiedades';
const CLEAN_KEY = 'habitago-limpiezas';
const ANF_ID_KEY = 'habitago-anfitrion-id';
const ANF_NOMBRE_KEY = 'habitago-anfitrion-nombre';

let modo = 'api';

const moneda = (n) => `$${Number(n).toLocaleString('es-MX')}`;

const $ = (sel) => document.querySelector(sel);
const grid = $('#gridPropiedades');
const emptyState = $('#emptyState');
const resultadoCount = $('#resultadoCount');

let favoritos = new Set(leerLocal(FAVORITOS_KEY));

// ---------- Utilidades ----------

function escaparHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function leerLocal(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function guardarLocal(key, valor) {
  localStorage.setItem(key, JSON.stringify(valor));
}

async function fetchJSON(url, opciones) {
  const res = await fetch(url, opciones);
  let cuerpo = null;
  try {
    cuerpo = await res.json();
  } catch {
    /* sin cuerpo JSON */
  }
  if (!res.ok) throw new Error((cuerpo && cuerpo.error) || `Error ${res.status}`);
  return cuerpo;
}

const enviarJSON = (url, metodo, datos) =>
  fetchJSON(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  });

function imgSrc(url, ancho) {
  if (/^https:\/\/images\.unsplash\.com\//.test(url)) {
    return `${url}${url.includes('?') ? '&' : '?'}w=${ancho}&q=80`;
  }
  return url;
}

function protegerImagenes(raiz) {
  raiz.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      img.onerror = null;
      img.src = imgSrc(R.IMG_DEFAULT, 600);
    }, { once: true });
  });
}

function formatoFecha(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function etiquetaDia(iso) {
  const dif = Math.round((new Date(`${iso}T00:00:00`) - new Date(`${R.hoyISO()}T00:00:00`)) / 86400000);
  if (dif < 0) return { texto: 'Atrasada', clase: 'chip--rojo' };
  if (dif === 0) return { texto: 'Hoy', clase: 'chip--naranja' };
  if (dif === 1) return { texto: 'Mañana', clase: 'chip--azul' };
  return null;
}

function anfitrionId() {
  let id = localStorage.getItem(ANF_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `h-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ANF_ID_KEY, id);
  }
  return id;
}

function abrirModal(sel) {
  $(sel).hidden = false;
  document.body.style.overflow = 'hidden';
}

function cerrarModal(sel) {
  $(sel).hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) document.body.style.overflow = '';
}

let toastTimer;
function mostrarToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// ---------- Capa de datos (modo híbrido: API o localStorage) ----------

async function detectarModo() {
  try {
    const res = await fetch('/api/properties');
    modo = res.ok ? 'api' : 'static';
  } catch {
    modo = 'static';
  }
}

let cachePropiedades = null;

async function obtenerPropiedades() {
  if (modo === 'api') return fetchJSON(API.properties);
  if (!cachePropiedades) cachePropiedades = await fetchJSON('data/properties.json');
  return [...leerLocal(PROPS_USER_KEY), ...cachePropiedades].map(R.normalizarPropiedad);
}

function filtrarPropiedades(lista, params, reservas) {
  const destino = params.get('destino') || '';
  const ciudad = params.get('ciudad') || '';
  const categoria = (params.get('categoria') || '').toLowerCase();
  const huespedes = params.get('huespedes');
  const precioMax = params.get('precioMax');
  const llegada = params.get('llegada');
  const salida = params.get('salida');

  return lista.filter((p) => {
    if (!R.coincideDestino(p, destino)) return false;
    if (!R.coincideDestino(p, ciudad)) return false;
    if (categoria && p.categoria.toLowerCase() !== categoria) return false;
    if (huespedes && p.huespedes < Number(huespedes)) return false;
    if (precioMax && p.precioPorNoche > Number(precioMax)) return false;
    if (llegada && salida && llegada < salida && R.hayTraslape(reservas, p.id, llegada, salida)) return false;
    return true;
  });
}

async function buscarPropiedades(params) {
  if (modo === 'api') {
    const qs = params.toString();
    return fetchJSON(`${API.properties}${qs ? `?${qs}` : ''}`);
  }
  const lista = await obtenerPropiedades();
  return filtrarPropiedades(lista, params, leerLocal(BOOKINGS_KEY));
}

async function obtenerPropiedad(id) {
  if (modo === 'api') return fetchJSON(`${API.properties}/${id}`);
  const prop = (await obtenerPropiedades()).find((p) => p.id === Number(id));
  if (!prop) throw new Error('No encontrado');
  return prop;
}

async function obtenerCategorias() {
  if (modo === 'api') return fetchJSON(API.categorias);
  return [...new Set((await obtenerPropiedades()).map((p) => p.categoria))];
}

async function obtenerCiudades() {
  if (modo === 'api') return fetchJSON(API.ciudades);
  return [...new Set((await obtenerPropiedades()).map((p) => `${p.ciudad}, ${p.pais}`))];
}

async function obtenerOcupadas(id) {
  if (modo === 'api') return fetchJSON(`${API.properties}/${id}/ocupadas`);
  const hoy = R.hoyISO();
  return leerLocal(BOOKINGS_KEY)
    .filter((b) => Number(b.propertyId) === Number(id) && b.fechaFin >= hoy)
    .map((b) => ({ fechaInicio: b.fechaInicio, fechaFin: b.fechaFin }))
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
}

async function enlistarReservas() {
  if (modo === 'api') return fetchJSON(API.bookings);
  return leerLocal(BOOKINGS_KEY);
}

async function crearReservaEnBD(propertyId, datos) {
  if (modo === 'api') {
    return enviarJSON(API.bookings, 'POST', { propertyId, ...datos });
  }

  const prop = await obtenerPropiedad(propertyId);
  const { fechaInicio, fechaFin } = datos;
  if (!datos.nombre || !datos.email || !fechaInicio || !fechaFin || !datos.huespedes) {
    throw new Error('Todos los campos son obligatorios');
  }
  if (fechaInicio < R.hoyISO(-1)) throw new Error('La fecha de llegada no puede estar en el pasado');
  if (fechaInicio >= fechaFin) throw new Error('La fecha de fin debe ser posterior a la de inicio');
  if (Number(datos.huespedes) < 1 || Number(datos.huespedes) > prop.huespedes) {
    throw new Error(`Este alojamiento admite de 1 a ${prop.huespedes} huéspedes`);
  }

  const reservas = leerLocal(BOOKINGS_KEY);
  if (R.hayTraslape(reservas, prop.id, fechaInicio, fechaFin)) {
    throw new Error('Esas fechas ya no están disponibles para este alojamiento');
  }

  const noches = Math.round((new Date(fechaFin) - new Date(fechaInicio)) / 86400000);
  const booking = {
    id: Date.now(),
    propertyId: prop.id,
    propertyTitulo: prop.titulo,
    nombre: datos.nombre.trim(),
    email: datos.email.trim(),
    fechaInicio,
    fechaFin,
    noches,
    huespedes: Number(datos.huespedes),
    horaCheckin: prop.horaCheckin,
    horaCheckout: prop.horaCheckout,
    total: noches * prop.precioPorNoche
  };
  reservas.push(booking);
  guardarLocal(BOOKINGS_KEY, reservas);

  const tarea = R.crearTareaLimpieza(booking, prop);
  if (tarea) guardarLocal(CLEAN_KEY, [...leerLocal(CLEAN_KEY), tarea]);
  return { booking, limpieza: tarea };
}

async function publicarPropiedadEnBD(datos) {
  if (modo === 'api') return enviarJSON(API.properties, 'POST', datos);

  const v = R.validarPropiedad(datos);
  if (!v.ok) throw new Error(v.error);
  const property = {
    id: Date.now(),
    ...v.data,
    valoracion: 0,
    numValoraciones: 0,
    usuario: true,
    creadoEn: new Date().toISOString()
  };
  guardarLocal(PROPS_USER_KEY, [property, ...leerLocal(PROPS_USER_KEY)]);
  return { property };
}

async function listarMisAnuncios() {
  const miId = anfitrionId();
  if (modo === 'api') return fetchJSON(`${API.properties}?anfitrionId=${encodeURIComponent(miId)}`);
  return leerLocal(PROPS_USER_KEY).filter((p) => p.anfitrionId === miId).map(R.normalizarPropiedad);
}

async function actualizarHorariosPropiedad(id, cambios) {
  const miId = anfitrionId();
  if (modo === 'api') {
    return enviarJSON(`${API.properties}/${id}/limpieza`, 'PATCH', { anfitrionId: miId, ...cambios });
  }
  const todas = leerLocal(PROPS_USER_KEY);
  const idx = todas.findIndex((p) => p.id === Number(id) && p.anfitrionId === miId);
  if (idx === -1) throw new Error('No eres el anfitrión de este alojamiento');
  const cfg = R.aplicarConfigLimpieza(todas[idx], cambios);
  if (!cfg.ok) throw new Error(cfg.error);
  todas[idx] = { ...todas[idx], ...cfg.data };
  guardarLocal(PROPS_USER_KEY, todas);

  const limpiezas = leerLocal(CLEAN_KEY).map((t) => {
    if (t.propertyId !== todas[idx].id || t.estado !== 'pendiente') return t;
    if (!cfg.data.limpieza.activa) return { ...t, estado: 'cancelada' };
    return { ...t, hora: cfg.data.limpieza.hora, duracionHoras: cfg.data.limpieza.duracionHoras };
  });
  guardarLocal(CLEAN_KEY, limpiezas);
}

async function eliminarPropiedad(id) {
  const miId = anfitrionId();
  if (modo === 'api') {
    return fetchJSON(`${API.properties}/${id}?anfitrionId=${encodeURIComponent(miId)}`, { method: 'DELETE' });
  }
  const todas = leerLocal(PROPS_USER_KEY);
  const prop = todas.find((p) => p.id === Number(id) && p.anfitrionId === miId);
  if (!prop) throw new Error('No eres el anfitrión de este alojamiento');
  const hoy = R.hoyISO();
  if (leerLocal(BOOKINGS_KEY).some((b) => Number(b.propertyId) === prop.id && b.fechaFin >= hoy)) {
    throw new Error('No puedes eliminarla: tiene reservas vigentes o futuras');
  }
  guardarLocal(PROPS_USER_KEY, todas.filter((p) => p.id !== prop.id));
  guardarLocal(CLEAN_KEY, leerLocal(CLEAN_KEY).filter((t) => t.propertyId !== prop.id));
}

async function listarLimpiezas() {
  const miId = anfitrionId();
  if (modo === 'api') return fetchJSON(`${API.cleanings}?anfitrionId=${encodeURIComponent(miId)}`);
  return leerLocal(CLEAN_KEY)
    .filter((t) => t.anfitrionId === miId)
    .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
}

async function actualizarLimpieza(id, cambios) {
  const miId = anfitrionId();
  if (modo === 'api') {
    return enviarJSON(`${API.cleanings}/${encodeURIComponent(id)}`, 'PATCH', { anfitrionId: miId, ...cambios });
  }
  const limpiezas = leerLocal(CLEAN_KEY);
  const tarea = limpiezas.find((t) => t.id === id && t.anfitrionId === miId);
  if (!tarea) throw new Error('Limpieza no encontrada');

  if (cambios.estado !== undefined) {
    if (!R.ESTADOS_LIMPIEZA.includes(cambios.estado)) throw new Error('Estado inválido');
    tarea.estado = cambios.estado;
  }
  if (cambios.hora !== undefined) {
    const prop = await obtenerPropiedad(tarea.propertyId);
    const err = R.validarHoraTarea(tarea, cambios.hora, prop, leerLocal(BOOKINGS_KEY));
    if (err) throw new Error(err);
    tarea.hora = cambios.hora;
  }
  guardarLocal(CLEAN_KEY, limpiezas);
}

// ---------- Render: catálogo ----------

function renderCard(p) {
  const card = document.createElement('article');
  card.className = 'card';
  const resenas = p.numValoraciones > 0
    ? `⭐ ${p.valoracion.toFixed(1)} <span class="card__resenas">· ${p.numValoraciones} reseñas</span>`
    : '✨ Nuevo';

  card.innerHTML = `
    <div class="card__img-wrap">
      <img class="card__img" src="${escaparHTML(imgSrc(p.imagenes[0], 600))}" alt="${escaparHTML(p.titulo)}" loading="lazy">
      <span class="card__badge">${escaparHTML(p.categoria)}</span>
      <button class="card__favorito" data-id="${p.id}" aria-label="Añadir a favoritos">${favoritos.has(p.id) ? '❤️' : '🤍'}</button>
    </div>
    <div class="card__body">
      <p class="card__title">${escaparHTML(p.ciudad)}, ${escaparHTML(p.pais)}</p>
      <p class="card__subtitle">${escaparHTML(p.titulo)}</p>
      <div class="card__bottom">
        <p class="card__rating">${resenas}</p>
        <p class="card__price"><strong>${moneda(p.precioPorNoche)}</strong> / noche</p>
      </div>
    </div>`;

  protegerImagenes(card);

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card__favorito')) return;
    abrirDetalle(p.id);
  });

  card.querySelector('.card__favorito').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorito(p.id, e.currentTarget);
  });

  return card;
}

function toggleFavorito(id, btn) {
  if (favoritos.has(id)) {
    favoritos.delete(id);
    btn.textContent = '🤍';
  } else {
    favoritos.add(id);
    btn.textContent = '❤️';
  }
  guardarLocal(FAVORITOS_KEY, [...favoritos]);
  mostrarToast(favoritos.has(id) ? 'Añadido a favoritos ❤️' : 'Eliminado de favoritos');
}

function mostrarResultado(count) {
  resultadoCount.textContent = count
    ? `${count} alojamiento${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`
    : '';
  emptyState.hidden = count > 0;
}

async function cargarPropiedades() {
  grid.innerHTML = '';
  const params = new URLSearchParams();
  const destino = $('#inputDestino').value.trim();
  if (destino) params.set('destino', destino);
  const huespedes = $('#inputHuespedes').value;
  if (huespedes) params.set('huespedes', huespedes);
  const llegada = $('#inputLlegada').value;
  const salida = $('#inputSalida').value;
  if (llegada && salida) {
    if (llegada < salida) {
      params.set('llegada', llegada);
      params.set('salida', salida);
    } else {
      mostrarToast('La salida debe ser posterior a la llegada');
    }
  }
  const cat = $('#filtroCategoria').value;
  if (cat) params.set('categoria', cat);
  const ciudad = $('#filtroCiudad').value;
  if (ciudad) params.set('ciudad', ciudad);
  const precio = $('#filtroPrecio').value;
  if (precio && precio !== '20000') params.set('precioMax', precio);

  try {
    const props = await buscarPropiedades(params);
    props.forEach((p) => grid.appendChild(renderCard(p)));
    mostrarResultado(props.length);
    $('#btnLimpiarFiltros').hidden = [...params].length === 0;
  } catch {
    mostrarToast('Error al cargar los alojamientos');
  }
}

function llenarSelect(sel, valores, etiqueta) {
  const actual = sel.value;
  sel.innerHTML = `<option value="">${etiqueta}</option>`;
  valores.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
  sel.value = valores.includes(actual) ? actual : '';
}

async function cargarFiltros() {
  const [categorias, ciudades] = await Promise.all([obtenerCategorias(), obtenerCiudades()]);
  llenarSelect($('#filtroCategoria'), categorias, 'Categoría');
  llenarSelect($('#filtroCiudad'), ciudades, 'Ciudad');
}

// ---------- Detalle + reserva ----------

async function abrirDetalle(id) {
  try {
    const [p, ocupadas] = await Promise.all([obtenerPropiedad(id), obtenerOcupadas(id)]);
    const galeria = p.imagenes
      .map((img, i) => `<img src="${escaparHTML(imgSrc(img, 800))}" alt="${escaparHTML(p.titulo)} ${i + 1}">`)
      .join('');
    const pocas = p.imagenes.length < 3;
    const hoy = R.hoyISO();
    const valoracion = p.numValoraciones > 0
      ? `⭐ ${p.valoracion.toFixed(1)} (${p.numValoraciones} reseñas)`
      : '✨ Nuevo en HabitaGo';
    const textoOcupadas = ocupadas
      .map((o) => `${formatoFecha(o.fechaInicio)} → ${formatoFecha(o.fechaFin)}`)
      .join(' · ');

    $('#modalBody').innerHTML = `
      <div class="detalle__galeria${pocas ? ' detalle__galeria--pocas' : ''}" ${pocas ? `style="grid-template-columns:repeat(${p.imagenes.length},1fr)"` : ''}>${galeria}</div>
      <h1 class="detalle__titulo">${escaparHTML(p.titulo)}</h1>
      <div class="detalle__meta">
        <span>📍 ${escaparHTML(p.ubicacion)}</span>
        <span>${valoracion}</span>
        <span>👥 ${p.huespedes} huéspedes</span>
        <span>🛏 ${p.habitaciones} habitaciones</span>
        <span>🚿 ${p.banos} baño${p.banos > 1 ? 's' : ''}</span>
      </div>
      <div class="detalle__meta">
        <span>🙋 Anfitrión: ${escaparHTML(p.anfitrion)}</span>
        <span>🔑 Llegada desde las ${escaparHTML(p.horaCheckin)}</span>
        <span>🚪 Salida antes de las ${escaparHTML(p.horaCheckout)}</span>
      </div>
      <p class="detalle__descripcion">${escaparHTML(p.descripcion)}</p>
      <div class="detalle__comodidades">
        <h3>Qué incluye este lugar</h3>
        <div class="detalle__comodidades-list">
          ${p.comodidades.map((c) => `<span class="comodidad">${escaparHTML(c)}</span>`).join('')}
        </div>
      </div>
      <div class="detalle__reserva">
        <p class="detalle__reserva-precio">${moneda(p.precioPorNoche)} <span>/ noche</span></p>
        ${ocupadas.length ? `<p class="nota nota--aviso">📅 Fechas no disponibles: ${escaparHTML(textoOcupadas)}</p>` : ''}
        <form class="form-reserva" id="formReserva">
          <div class="form-reserva__full">
            <label for="nombre">Nombre completo</label>
            <input type="text" id="nombre" required placeholder="Tu nombre">
          </div>
          <div class="form-reserva__full">
            <label for="email">Correo electrónico</label>
            <input type="email" id="email" required placeholder="tucorreo@ejemplo.com">
          </div>
          <div>
            <label for="fechaInicio">Llegada</label>
            <input type="date" id="fechaInicio" min="${hoy}" required>
          </div>
          <div>
            <label for="fechaFin">Salida</label>
            <input type="date" id="fechaFin" min="${hoy}" required>
          </div>
          <div class="form-reserva__full">
            <label for="huespedesReserva">Huéspedes</label>
            <input type="number" id="huespedesReserva" min="1" max="${p.huespedes}" value="1" required>
          </div>
          <div class="form-reserva__full resumen-reserva" id="resumenReserva"></div>
          <button type="submit" class="btn-primario form-reserva__full" id="btnReservar">Reservar ahora</button>
        </form>
      </div>`;

    protegerImagenes($('#modalBody'));
    abrirModal('#modalDetalle');

    const inicio = $('#fechaInicio');
    const fin = $('#fechaFin');
    const resumen = $('#resumenReserva');
    const btn = $('#btnReservar');

    // Si el usuario ya eligió fechas en la barra de búsqueda, las precargamos
    if ($('#inputLlegada').value) inicio.value = $('#inputLlegada').value;
    if ($('#inputSalida').value) fin.value = $('#inputSalida').value;

    const calcular = () => {
      const hues = Number($('#huespedesReserva').value) || 1;
      btn.disabled = false;
      if (inicio.value) fin.min = inicio.value;
      if (inicio.value && fin.value && inicio.value < fin.value) {
        if (ocupadas.some((o) => inicio.value < o.fechaFin && fin.value > o.fechaInicio)) {
          resumen.innerHTML = '<span class="texto-error">Esas fechas se cruzan con otra reserva. Elige otro rango.</span>';
          btn.disabled = true;
          return;
        }
        const noches = Math.round((new Date(fin.value) - new Date(inicio.value)) / 86400000);
        const total = noches * p.precioPorNoche;
        resumen.innerHTML = `
          <div class="resumen-reserva__row"><span>${moneda(p.precioPorNoche)} × ${noches} noche${noches === 1 ? '' : 's'}</span><span>${moneda(total)}</span></div>
          <div class="resumen-reserva__row resumen-reserva__total"><span>Total por ${noches} noche${noches === 1 ? '' : 's'}${hues > 1 ? `, ${hues} huéspedes` : ''}</span><span>${moneda(total)}</span></div>`;
      } else {
        resumen.innerHTML = '<span class="texto-suave">Selecciona fechas válidas para ver el total</span>';
      }
    };
    inicio.addEventListener('input', calcular);
    fin.addEventListener('input', calcular);
    $('#huespedesReserva').addEventListener('input', calcular);
    calcular();

    $('#formReserva').addEventListener('submit', (e) => {
      e.preventDefault();
      crearReserva(p.id, {
        nombre: $('#nombre').value,
        email: $('#email').value,
        fechaInicio: inicio.value,
        fechaFin: fin.value,
        huespedes: $('#huespedesReserva').value
      });
    });
  } catch {
    mostrarToast('No se pudo abrir el alojamiento');
  }
}

function cerrarDetalle() {
  cerrarModal('#modalDetalle');
}

async function crearReserva(propertyId, datos) {
  try {
    const { booking } = await crearReservaEnBD(propertyId, datos);
    cerrarDetalle();
    await verReservas();
    mostrarToast(`✅ Reserva confirmada (n° ${booking.id})`);
  } catch (err) {
    mostrarToast(`❌ ${err.message}`);
  }
}

async function verReservas() {
  try {
    const bookings = await enlistarReservas();
    const body = $('#modalReservasBody');
    if (!bookings.length) {
      body.innerHTML = '<h2>Mis reservas</h2><p class="texto-suave" style="margin-top:10px;">Aún no tienes reservas. ¡Explora y encuentra tu próximo destino!</p>';
    } else {
      body.innerHTML = `<h2>Mis reservas (${bookings.length})</h2><ul class="reservas-list">${bookings
        .map(
          (b) => `
          <li class="reservas-item">
            <div>
              <h4>${escaparHTML(b.propertyTitulo)}</h4>
              <p>${escaparHTML(b.fechaInicio)} → ${escaparHTML(b.fechaFin)} · ${b.noches} noche${b.noches === 1 ? '' : 's'} · ${b.huespedes} huésped${b.huespedes === 1 ? '' : 'es'}</p>
              ${b.horaCheckin ? `<p>🔑 Llegada ${escaparHTML(b.horaCheckin)} · 🚪 Salida ${escaparHTML(b.horaCheckout)}</p>` : ''}
            </div>
            <strong>${moneda(b.total)}</strong>
          </li>`
        )
        .join('')}</ul>`;
    }
    abrirModal('#modalReservas');
  } catch {
    mostrarToast('No se pudieron cargar las reservas');
  }
}

// ---------- Publicar casa ----------

function abrirPublicar() {
  const nombreGuardado = localStorage.getItem(ANF_NOMBRE_KEY) || '';
  const comodidades = R.COMODIDADES
    .map((c) => `<label class="check"><input type="checkbox" name="comodidad" value="${escaparHTML(c)}"> ${escaparHTML(c)}</label>`)
    .join('');
  const tipos = R.CATEGORIAS_PUBLICABLES.map((c) => `<option value="${c}">${c}</option>`).join('');
  const duraciones = [1, 2, 3, 4, 5, 6]
    .map((h) => `<option value="${h}"${h === 2 ? ' selected' : ''}>${h} hora${h === 1 ? '' : 's'}</option>`)
    .join('');

  $('#modalPublicarBody').innerHTML = `
    <h2 class="panel__titulo">🏡 Publica tu casa en HabitaGo</h2>
    <p class="panel__sub">Cuéntanos sobre tu alojamiento y empieza a recibir huéspedes.</p>
    <form class="form-publicar" id="formPublicar" novalidate>
      <fieldset>
        <legend>1. Sobre tu alojamiento</legend>
        <div class="campo campo--full">
          <label for="pubTitulo">Título del anuncio</label>
          <input type="text" id="pubTitulo" maxlength="80" placeholder="Ej. Casa con alberca cerca del centro" required>
        </div>
        <div class="campo">
          <label for="pubCategoria">Tipo</label>
          <select id="pubCategoria">${tipos}</select>
        </div>
        <div class="campo">
          <label for="pubPrecio">Precio por noche (MXN)</label>
          <input type="number" id="pubPrecio" min="50" max="100000" placeholder="1200" required>
        </div>
        <div class="campo">
          <label for="pubCiudad">Ciudad</label>
          <input type="text" id="pubCiudad" maxlength="60" placeholder="Puebla" required>
        </div>
        <div class="campo">
          <label for="pubPais">País</label>
          <input type="text" id="pubPais" maxlength="60" value="México">
        </div>
        <div class="campo campo--full">
          <label for="pubUbicacion">Zona o colonia</label>
          <input type="text" id="pubUbicacion" maxlength="100" placeholder="Ej. Centro Histórico">
        </div>
        <div class="campo campo--tercio">
          <label for="pubHuespedes">Huéspedes</label>
          <input type="number" id="pubHuespedes" min="1" max="16" value="2" required>
        </div>
        <div class="campo campo--tercio">
          <label for="pubHabitaciones">Habitaciones</label>
          <input type="number" id="pubHabitaciones" min="1" max="20" value="1" required>
        </div>
        <div class="campo campo--tercio">
          <label for="pubBanos">Baños</label>
          <input type="number" id="pubBanos" min="1" max="10" value="1" required>
        </div>
        <div class="campo campo--full">
          <label for="pubDescripcion">Descripción</label>
          <textarea id="pubDescripcion" rows="4" maxlength="1000" placeholder="Describe tu casa, el ambiente, qué hay cerca…" required></textarea>
        </div>
        <div class="campo campo--full">
          <span class="campo__etiqueta">Comodidades</span>
          <div class="checks">${comodidades}</div>
        </div>
        <div class="campo campo--full">
          <label for="pubFotos">Fotos (un enlace por línea, máx. 6)</label>
          <textarea id="pubFotos" rows="3" placeholder="https://…/foto1.jpg&#10;https://…/foto2.jpg"></textarea>
          <p class="ayuda">Si no agregas fotos usaremos una imagen de ejemplo.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>2. Horarios y limpieza 🧹</legend>
        <div class="campo">
          <label for="pubCheckin">Llegada desde</label>
          <input type="time" id="pubCheckin" value="15:00" required>
        </div>
        <div class="campo">
          <label for="pubCheckout">Salida antes de</label>
          <input type="time" id="pubCheckout" value="11:00" required>
        </div>
        <div class="campo campo--full">
          <label class="check check--grande">
            <input type="checkbox" id="pubLimpiezaActiva" checked>
            Programar limpieza automática después de la salida de cada huésped
          </label>
        </div>
        <div class="campo" id="campoLimpiezaHora">
          <label for="pubLimpiezaHora">Hora de limpieza</label>
          <input type="time" id="pubLimpiezaHora" value="12:00">
        </div>
        <div class="campo" id="campoLimpiezaDuracion">
          <label for="pubLimpiezaDuracion">Duración estimada</label>
          <select id="pubLimpiezaDuracion">${duraciones}</select>
        </div>
        <p class="ventana" id="pubVentana" role="status"></p>
      </fieldset>

      <fieldset>
        <legend>3. Anfitrión</legend>
        <div class="campo campo--full">
          <label for="pubAnfitrion">Tu nombre</label>
          <input type="text" id="pubAnfitrion" maxlength="60" value="${escaparHTML(nombreGuardado)}" placeholder="Como lo verán los huéspedes" required>
        </div>
      </fieldset>

      <p class="form-error" id="pubError" role="alert" hidden></p>
      <button type="submit" class="btn-primario" id="btnPublicarEnviar">Publicar mi casa</button>
    </form>`;

  abrirModal('#modalPublicar');
  $('#modalPublicar .modal__content').scrollTop = 0;

  const campos = ['#pubCheckin', '#pubCheckout', '#pubLimpiezaActiva', '#pubLimpiezaHora', '#pubLimpiezaDuracion'];
  campos.forEach((s) => $(s).addEventListener('input', actualizarVentanaLimpieza));
  actualizarVentanaLimpieza();

  $('#formPublicar').addEventListener('submit', enviarPublicacion);
}

function actualizarVentanaLimpieza() {
  const activa = $('#pubLimpiezaActiva').checked;
  $('#campoLimpiezaHora').hidden = !activa;
  $('#campoLimpiezaDuracion').hidden = !activa;

  const cfg = {
    horaCheckin: $('#pubCheckin').value,
    horaCheckout: $('#pubCheckout').value,
    limpieza: {
      activa,
      hora: $('#pubLimpiezaHora').value,
      duracionHoras: Number($('#pubLimpiezaDuracion').value)
    }
  };
  const aviso = $('#pubVentana');
  const boton = $('#btnPublicarEnviar');

  if (!R.HORA_RE.test(cfg.horaCheckin) || !R.HORA_RE.test(cfg.horaCheckout) ||
      (activa && !R.HORA_RE.test(cfg.limpieza.hora))) {
    aviso.className = 'ventana ventana--error';
    aviso.textContent = 'Completa todas las horas para continuar.';
    boton.disabled = true;
    return;
  }

  const error = R.validarVentanaLimpieza(cfg);
  boton.disabled = Boolean(error);
  if (error) {
    aviso.className = 'ventana ventana--error';
    aviso.textContent = `⚠️ ${error}`;
  } else if (!activa) {
    aviso.className = 'ventana';
    aviso.textContent = 'Sin limpieza programada: tendrás que coordinarla por tu cuenta.';
  } else {
    const fin = R.aHora(R.aMinutos(cfg.limpieza.hora) + cfg.limpieza.duracionHoras * 60);
    aviso.className = 'ventana ventana--ok';
    aviso.textContent = `✅ Salida ${cfg.horaCheckout} → limpieza ${cfg.limpieza.hora}–${fin} → llegada del siguiente huésped ${cfg.horaCheckin}`;
  }
}

async function enviarPublicacion(e) {
  e.preventDefault();
  const error = $('#pubError');
  error.hidden = true;

  const nombre = $('#pubAnfitrion').value.trim();
  const datos = {
    titulo: $('#pubTitulo').value,
    categoria: $('#pubCategoria').value,
    ciudad: $('#pubCiudad').value,
    pais: $('#pubPais').value,
    ubicacion: $('#pubUbicacion').value,
    precioPorNoche: $('#pubPrecio').value,
    huespedes: $('#pubHuespedes').value,
    habitaciones: $('#pubHabitaciones').value,
    banos: $('#pubBanos').value,
    descripcion: $('#pubDescripcion').value,
    comodidades: [...document.querySelectorAll('input[name="comodidad"]:checked')].map((i) => i.value),
    imagenes: $('#pubFotos').value.split('\n'),
    horaCheckin: $('#pubCheckin').value,
    horaCheckout: $('#pubCheckout').value,
    limpieza: {
      activa: $('#pubLimpiezaActiva').checked,
      hora: $('#pubLimpiezaHora').value,
      duracionHoras: $('#pubLimpiezaDuracion').value
    },
    anfitrion: nombre,
    anfitrionId: anfitrionId()
  };

  const boton = $('#btnPublicarEnviar');
  boton.disabled = true;
  try {
    await publicarPropiedadEnBD(datos);
    localStorage.setItem(ANF_NOMBRE_KEY, nombre);
    cerrarModal('#modalPublicar');
    await cargarFiltros();
    await cargarPropiedades();
    mostrarToast('🏡 ¡Tu casa ya está publicada!');
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    boton.disabled = false;
  }
}

// ---------- Panel del anfitrión ----------

let tabAnfitrion = 'limpiezas';

async function abrirAnfitrion(tab) {
  if (tab) tabAnfitrion = tab;
  abrirModal('#modalAnfitrion');
  await renderAnfitrion();
}

async function renderAnfitrion() {
  const body = $('#modalAnfitrionBody');
  let contenido;
  try {
    contenido = tabAnfitrion === 'limpiezas' ? await htmlLimpiezas() : await htmlAnuncios();
  } catch {
    contenido = '<p class="texto-error">No se pudo cargar el panel. Intenta de nuevo.</p>';
  }
  body.innerHTML = `
    <h2 class="panel__titulo">Panel de anfitrión</h2>
    <div class="tabs" role="tablist">
      <button class="tab${tabAnfitrion === 'limpiezas' ? ' tab--activa' : ''}" role="tab" data-tab="limpiezas">🧹 Limpiezas</button>
      <button class="tab${tabAnfitrion === 'anuncios' ? ' tab--activa' : ''}" role="tab" data-tab="anuncios">🏡 Mis anuncios</button>
    </div>
    <div class="tab-contenido">${contenido}</div>`;
  protegerImagenes(body);
}

const vacioSinCasas = `
  <div class="vacio">
    <span class="vacio__icono">🏡</span>
    <h3>Aún no has publicado ninguna casa</h3>
    <p>Publica tu primer alojamiento y aquí verás las limpiezas programadas después de cada salida.</p>
    <button class="btn-mini btn-mini--principal" data-accion="publicar">Publicar mi casa</button>
  </div>`;

function itemLimpieza(t, pendiente) {
  const dia = etiquetaDia(t.fecha);
  const chipDia = pendiente && dia ? `<span class="chip ${dia.clase}">${dia.texto}</span>` : '';
  const chipEstado = pendiente ? '' : `<span class="chip chip--${t.estado === 'hecha' ? 'verde' : 'gris'}">${t.estado === 'hecha' ? 'Hecha' : 'Cancelada'}</span>`;
  const fin = R.aHora(R.aMinutos(t.hora) + t.duracionHoras * 60);

  const acciones = pendiente
    ? `<label class="hora-edit">Hora
         <input type="time" data-hora="${escaparHTML(t.id)}" value="${escaparHTML(t.hora)}">
       </label>
       <button class="btn-mini" data-accion="guardar-hora" data-id="${escaparHTML(t.id)}">Guardar hora</button>
       <button class="btn-mini btn-mini--ok" data-accion="hecha" data-id="${escaparHTML(t.id)}">✓ Hecha</button>`
    : `<span class="texto-suave">${escaparHTML(t.hora)}–${fin}</span>
       <button class="btn-mini" data-accion="reabrir" data-id="${escaparHTML(t.id)}">Reabrir</button>`;

  return `
    <li class="limpieza">
      <div class="limpieza__info">
        <h4>${escaparHTML(t.propertyTitulo)} ${chipDia}${chipEstado}</h4>
        <p>Sale ${escaparHTML(t.huesped)} · <strong>${escaparHTML(formatoFecha(t.fecha))}</strong>${pendiente ? ` · limpieza de ${escaparHTML(t.hora)} a ${fin}` : ''}</p>
      </div>
      <div class="limpieza__acciones">${acciones}</div>
    </li>`;
}

async function htmlLimpiezas() {
  const [anuncios, limpiezas] = await Promise.all([listarMisAnuncios(), listarLimpiezas()]);
  if (!anuncios.length) return vacioSinCasas;

  const pendientes = limpiezas.filter((t) => t.estado === 'pendiente');
  const historial = limpiezas.filter((t) => t.estado !== 'pendiente').reverse();

  const listaPendientes = pendientes.length
    ? `<ul class="limpiezas-list">${pendientes.map((t) => itemLimpieza(t, true)).join('')}</ul>`
    : '<p class="texto-suave">No hay limpiezas pendientes. Cuando alguien reserve tu casa, la limpieza se programará sola para el día de salida.</p>';

  const listaHistorial = historial.length
    ? `<h3 class="subtitulo">Historial</h3><ul class="limpiezas-list limpiezas-list--historial">${historial.map((t) => itemLimpieza(t, false)).join('')}</ul>`
    : '';

  return `
    <p class="panel__sub">${pendientes.length} limpieza${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'}. Puedes ajustar la hora de cada una dentro del margen entre la salida y la siguiente llegada.</p>
    <h3 class="subtitulo">Próximas limpiezas</h3>
    ${listaPendientes}
    ${listaHistorial}`;
}

async function htmlAnuncios() {
  const anuncios = await listarMisAnuncios();
  if (!anuncios.length) return vacioSinCasas;

  const filas = anuncios.map((p) => {
    const duraciones = [1, 2, 3, 4, 5, 6]
      .map((h) => `<option value="${h}"${h === p.limpieza.duracionHoras ? ' selected' : ''}>${h} h</option>`)
      .join('');
    return `
      <li class="anuncio" data-prop="${p.id}">
        <div class="anuncio__head">
          <img src="${escaparHTML(imgSrc(p.imagenes[0], 200))}" alt="">
          <div>
            <h4>${escaparHTML(p.titulo)}</h4>
            <p class="texto-suave">${escaparHTML(p.ciudad)} · ${moneda(p.precioPorNoche)} / noche · ${p.huespedes} huéspedes</p>
          </div>
        </div>
        <div class="anuncio__config">
          <label>Llegada desde <input type="time" data-cfg="checkin" value="${escaparHTML(p.horaCheckin)}"></label>
          <label>Salida antes de <input type="time" data-cfg="checkout" value="${escaparHTML(p.horaCheckout)}"></label>
          <label class="check"><input type="checkbox" data-cfg="activa"${p.limpieza.activa ? ' checked' : ''}> Limpieza automática</label>
          <label>Hora de limpieza <input type="time" data-cfg="hora" value="${escaparHTML(p.limpieza.hora)}"></label>
          <label>Duración <select data-cfg="duracion">${duraciones}</select></label>
        </div>
        <div class="anuncio__acciones">
          <button class="btn-mini btn-mini--principal" data-accion="guardar-config" data-id="${p.id}">Guardar horarios</button>
          <button class="btn-mini btn-mini--peligro" data-accion="eliminar" data-id="${p.id}">Eliminar anuncio</button>
        </div>
      </li>`;
  }).join('');

  return `<p class="panel__sub">Ajusta los horarios de tus casas. Los cambios se aplican también a las limpiezas pendientes.</p>
          <ul class="anuncios-list">${filas}</ul>`;
}

async function manejarAccionPanel(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    tabAnfitrion = tab.dataset.tab;
    return renderAnfitrion();
  }

  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const { accion, id } = btn.dataset;

  try {
    if (accion === 'publicar') {
      cerrarModal('#modalAnfitrion');
      return abrirPublicar();
    }

    if (accion === 'guardar-hora') {
      const input = document.querySelector(`input[data-hora="${CSS.escape(id)}"]`);
      await actualizarLimpieza(id, { hora: input.value });
      mostrarToast('🕒 Hora de limpieza actualizada');
    } else if (accion === 'hecha') {
      await actualizarLimpieza(id, { estado: 'hecha' });
      mostrarToast('✅ Limpieza marcada como hecha');
    } else if (accion === 'reabrir') {
      await actualizarLimpieza(id, { estado: 'pendiente' });
      mostrarToast('Limpieza reabierta');
    } else if (accion === 'guardar-config') {
      const fila = btn.closest('.anuncio');
      const v = (k) => fila.querySelector(`[data-cfg="${k}"]`);
      await actualizarHorariosPropiedad(id, {
        horaCheckin: v('checkin').value,
        horaCheckout: v('checkout').value,
        limpieza: {
          activa: v('activa').checked,
          hora: v('hora').value,
          duracionHoras: v('duracion').value
        }
      });
      mostrarToast('💾 Horarios guardados');
    } else if (accion === 'eliminar') {
      if (!window.confirm('¿Eliminar este anuncio? Esta acción no se puede deshacer.')) return;
      await eliminarPropiedad(id);
      mostrarToast('Anuncio eliminado');
      await cargarFiltros();
      cargarPropiedades();
    }
    await renderAnfitrion();
  } catch (err) {
    mostrarToast(`❌ ${err.message}`);
  }
}

// ---------- Eventos ----------

$('#btnBuscar').addEventListener('click', cargarPropiedades);
$('#inputDestino').addEventListener('keydown', (e) => e.key === 'Enter' && cargarPropiedades());
$('#inputLlegada').addEventListener('change', () => {
  const llegada = $('#inputLlegada').value;
  $('#inputSalida').min = llegada || R.hoyISO();
});
$('#inputLlegada').min = R.hoyISO();
$('#inputSalida').min = R.hoyISO();
$('#filtroCategoria').addEventListener('change', cargarPropiedades);
$('#filtroCiudad').addEventListener('change', cargarPropiedades);
$('#filtroPrecio').addEventListener('change', cargarPropiedades);
$('#btnLimpiarFiltros').addEventListener('click', () => {
  $('#inputDestino').value = '';
  $('#inputHuespedes').value = '';
  $('#inputLlegada').value = '';
  $('#inputSalida').value = '';
  $('#filtroCategoria').value = '';
  $('#filtroCiudad').value = '';
  $('#filtroPrecio').value = '20000';
  cargarPropiedades();
});

$('#btnVerReservas').addEventListener('click', verReservas);
$('#btnPublicar').addEventListener('click', abrirPublicar);
$('#btnAnfitrion').addEventListener('click', () => abrirAnfitrion());

[
  ['#modalOverlay', '#modalDetalle'],
  ['#modalCerrar', '#modalDetalle'],
  ['#modalReservasOverlay', '#modalReservas'],
  ['#modalReservasCerrar', '#modalReservas'],
  ['#modalPublicarOverlay', '#modalPublicar'],
  ['#modalPublicarCerrar', '#modalPublicar'],
  ['#modalAnfitrionOverlay', '#modalAnfitrion'],
  ['#modalAnfitrionCerrar', '#modalAnfitrion']
].forEach(([boton, modal]) => $(boton).addEventListener('click', () => cerrarModal(modal)));

$('#modalAnfitrionBody').addEventListener('click', manejarAccionPanel);

$('#logoLink').addEventListener('click', (e) => {
  e.preventDefault();
  $('#btnLimpiarFiltros').click();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal:not([hidden])').forEach((m) => cerrarModal(`#${m.id}`));
});

// ---------- Init ----------
(async () => {
  await detectarModo();
  console.log(`HabitaGo en modo: ${modo}`);
  await cargarFiltros();
  cargarPropiedades();
})();
