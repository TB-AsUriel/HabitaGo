const API = {
  properties: '/api/properties',
  categorias: '/api/properties/categorias',
  ciudades: '/api/properties/ciudades',
  bookings: '/api/bookings'
};

const moneda = (n) => `$${Number(n).toLocaleString('es-MX')}`;

const FAVORITOS_KEY = 'habitago-favoritos';
let favoritos = new Set(JSON.parse(localStorage.getItem(FAVORITOS_KEY) || '[]'));

const $ = (sel) => document.querySelector(sel);
const grid = $('#gridPropiedades');
const emptyState = $('#emptyState');
const resultadoCount = $('#resultadoCount');

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

function renderCard(p) {
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <div class="card__img-wrap">
      <img class="card__img" src="${p.imagenes[0]}?w=600&q=80" alt="${p.titulo}" loading="lazy">
      <span class="card__badge">${p.categoria}</span>
      <button class="card__favorito" data-id="${p.id}" aria-label="Añadir a favoritos">${favoritos.has(p.id) ? '❤️' : '🤍'}</button>
    </div>
    <div class="card__body">
      <p class="card__title">${p.ciudad}, ${p.pais}</p>
      <p class="card__subtitle">${p.titulo}</p>
      <div class="card__bottom">
        <p class="card__rating">⭐ ${p.valoracion.toFixed(1)} <span style="color:var(--texto-suave);font-weight:500;">· ${p.numValoraciones} reseñas</span></p>
        <p class="card__price"><strong>${moneda(p.precioPorNoche)}</strong> / noche</p>
      </div>
    </div>`;

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
  localStorage.setItem(FAVORITOS_KEY, JSON.stringify([...favoritos]));
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
  if (destino) params.set('ciudad', destino);
  const huespedes = $('#inputHuespedes').value;
  if (huespedes) params.set('huespedes', huespedes);
  const cat = $('#filtroCategoria').value;
  if (cat) params.set('categoria', cat);
  const ciudad = $('#filtroCiudad').value;
  if (ciudad) params.set('ciudad', ciudad);
  const precio = $('#filtroPrecio').value;
  if (precio && precio !== '20000') params.set('precioMax', precio);

  try {
    const props = await fetchJSON(`${API.properties}?${params.toString()}`);
    props.forEach((p) => grid.appendChild(renderCard(p)));
    mostrarResultado(props.length);
    $('#btnLimpiarFiltros').hidden = params.size === 0;
  } catch {
    mostrarToast('Error al cargar los alojamientos');
  }
}

async function cargarFiltros() {
  const [categorias, ciudades] = await Promise.all([
    fetchJSON(API.categorias),
    fetchJSON(API.ciudades)
  ]);
  const selCat = $('#filtroCategoria');
  categorias.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    selCat.appendChild(opt);
  });
  const selCiu = $('#filtroCiudad');
  ciudades.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    selCiu.appendChild(opt);
  });
}

function escaparHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

async function abrirDetalle(id) {
  try {
    const p = await fetchJSON(`${API.properties}/${id}`);
    const galeria = p.imagenes
      .map((img, i) => `<img src="${img}?w=800&q=80" alt="${escaparHTML(p.titulo)} ${i + 1}">`)
      .join('');
    const hoy = new Date().toISOString().split('T')[0];

    $('#modalBody').innerHTML = `
      <div class="detalle__galeria">${galeria}</div>
      <h1 class="detalle__titulo">${escaparHTML(p.titulo)}</h1>
      <div class="detalle__meta">
        <span>📍 ${escaparHTML(p.ubicacion)}</span>
        <span>⭐ ${p.valoracion.toFixed(1)} (${p.numValoraciones} reseñas)</span>
        <span>👥 ${p.huespedes} huéspedes</span>
        <span>🛏 ${p.habitaciones} habitaciones</span>
        <span>🚿 ${p.banos} baño${p.banos > 1 ? 's' : ''}</span>
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
          <button type="submit" class="btn-primario form-reserva__full">Reservar ahora</button>
        </form>
      </div>`;

    $('#modalDetalle').hidden = false;
    document.body.style.overflow = 'hidden';

    const inicio = $('#fechaInicio');
    const fin = $('#fechaFin');
    const resumen = $('#resumenReserva');

    const calcular = () => {
      const a = new Date(inicio.value);
      const b = new Date(fin.value);
      const hues = Number($('#huespedesReserva').value) || 1;
      if (inicio.value && fin.value && a < b) {
        const noches = Math.ceil((b - a) / 86400000);
        const total = noches * p.precioPorNoche;
        resumen.innerHTML = `
          <div class="resumen-reserva__row"><span>${moneda(p.precioPorNoche)} × ${noches} noche${noches === 1 ? '' : 's'}</span><span>${moneda(total)}</span></div>
          <div class="resumen-reserva__row resumen-reserva__total"><span>Total por ${noches} noche${noches === 1 ? '' : 's'}${hues > 1 ? `, ${hues} huéspedes` : ''}</span><span>${moneda(total)}</span></div>`;
      } else {
        resumen.innerHTML = '<span style="color:var(--texto-suave);">Selecciona fechas válidas para ver el total</span>';
      }
    };
    inicio.addEventListener('input', calcular);
    fin.addEventListener('input', calcular);
    $('#huespedesReserva').addEventListener('input', calcular);

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

    $('#modalOverlay').onclick = cerrarDetalle;
  } catch {
    mostrarToast('No se pudo abrir el alojamiento');
  }
}

function cerrarDetalle() {
  $('#modalDetalle').hidden = true;
  document.body.style.overflow = '';
}

async function crearReserva(propertyId, datos) {
  try {
    const res = await fetch(API.bookings, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, ...datos })
    });
    const resultado = await res.json();
    if (!res.ok) throw new Error(resultado.error);
    await verReservas();
    cerrarDetalle();
    mostrarToast(`✅ Reserva confirmada (n° ${resultado.booking.id})`);
  } catch (err) {
    mostrarToast(`❌ ${err.message}`);
  }
}

async function verReservas() {
  try {
    const bookings = await fetchJSON(API.bookings);
    const body = $('#modalReservasBody');
    if (!bookings.length) {
      body.innerHTML = '<h2>Mis reservas</h2><p style="color:var(--texto-suave);margin-top:10px;">Aún no tienes reservas. ¡Explora y encuentra tu próximo destino!</p>';
    } else {
      body.innerHTML = `<h2>Mis reservas (${bookings.length})</h2><ul class="reservas-list">${bookings
        .map(
          (b) => `
          <li class="reservas-item">
            <div>
              <h4>${escaparHTML(b.propertyTitulo)}</h4>
              <p>${b.fechaInicio} → ${b.fechaFin} · ${b.noches} noche${b.noches === 1 ? '' : 's'} · ${b.huespedes} huésped${b.huespedes === 1 ? '' : 'es'}</p>
            </div>
            <strong>${moneda(b.total)}</strong>
          </li>`
        )
        .join('')}</ul>`;
    }
    $('#modalReservas').hidden = false;
    $('#modalReservasOverlay').onclick = () => {
      $('#modalReservas').hidden = true;
      document.body.style.overflow = '';
    };
    document.body.style.overflow = 'hidden';
  } catch {
    mostrarToast('No se pudieron cargar las reservas');
  }
}

let toastTimer;
function mostrarToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3000);
}

// ---------- Eventos ----------
$('#btnBuscar').addEventListener('click', cargarPropiedades);
$('#inputDestino').addEventListener('keydown', (e) => e.key === 'Enter' && cargarPropiedades());
$('#filtroCategoria').addEventListener('change', cargarPropiedades);
$('#filtroCiudad').addEventListener('change', cargarPropiedades);
$('#filtroPrecio').addEventListener('change', cargarPropiedades);
$('#btnLimpiarFiltros').addEventListener('click', () => {
  $('#inputDestino').value = '';
  $('#inputHuespedes').value = '';
  $('#filtroCategoria').value = '';
  $('#filtroCiudad').value = '';
  $('#filtroPrecio').value = '20000';
  cargarPropiedades();
});
$('#btnVerReservas').addEventListener('click', verReservas);
$('#modalCerrar').addEventListener('click', cerrarDetalle);
$('#modalReservasCerrar').addEventListener('click', () => {
  $('#modalReservas').hidden = true;
  document.body.style.overflow = '';
});
$('#logoLink').addEventListener('click', (e) => {
  e.preventDefault();
  $('#btnLimpiarFiltros').click();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cerrarDetalle();
    $('#modalReservas').hidden = true;
    document.body.style.overflow = '';
  }
});

// ---------- Init ----------
(async () => {
  await cargarFiltros();
  cargarPropiedades();
})();