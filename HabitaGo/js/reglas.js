/**
 * Reglas de negocio de HabitaGo.
 * Se usa tanto en el servidor (require) como en el navegador (window.Reglas),
 * así el modo API y el modo estático (GitHub Pages) validan exactamente igual.
 */
(function () {
  const CATEGORIAS_PUBLICABLES = ['Casa', 'Departamento', 'Cabaña', 'Estudio'];

  const COMODIDADES = [
    'Wifi', 'Cocina', 'Aire acondicionado', 'TV', 'Terraza', 'Piscina',
    'Jacuzzi', 'Aparcamiento', 'Chimenea', 'Lavadora', 'Patio', 'Cafetera',
    'Mascotas permitidas'
  ];

  const IMG_DEFAULT = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994';
  const ESTADOS_LIMPIEZA = ['pendiente', 'hecha', 'cancelada'];

  const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ID_RE = /^[\w-]{8,64}$/;

  const aMinutos = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const aHora = (min) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  const norm = (s) =>
    String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const esUrlHttp = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === 'http:' || x.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const hoyISO = (offsetDias = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /** Rellena los campos nuevos en alojamientos antiguos. */
  function normalizarPropiedad(p) {
    const l = p.limpieza || {};
    return {
      ...p,
      horaCheckin: p.horaCheckin || '15:00',
      horaCheckout: p.horaCheckout || '11:00',
      limpieza: {
        activa: l.activa !== false,
        hora: l.hora || '12:00',
        duracionHoras: Number(l.duracionHoras) || 2
      },
      anfitrion: p.anfitrion || 'HabitaGo'
    };
  }

  /** ¿Coincide el texto buscado con la ciudad / ubicación del alojamiento? */
  function coincideDestino(p, texto) {
    const q = norm(texto).trim();
    if (!q) return true;
    return (
      norm(`${p.ciudad}, ${p.pais}`).includes(q) ||
      norm(p.ubicacion).includes(q)
    );
  }

  /**
   * Valida la ventana: salida < limpieza < llegada del siguiente huésped.
   * Devuelve un mensaje de error o null si todo está bien.
   */
  function validarVentanaLimpieza({ horaCheckin, horaCheckout, limpieza }) {
    if (aMinutos(horaCheckout) >= aMinutos(horaCheckin)) {
      return 'La hora de salida debe ser anterior a la hora de llegada';
    }
    if (!limpieza.activa) return null;
    const ini = aMinutos(limpieza.hora);
    const fin = ini + limpieza.duracionHoras * 60;
    if (ini < aMinutos(horaCheckout)) {
      return `La limpieza no puede empezar antes de la salida del huésped (${horaCheckout})`;
    }
    if (fin > aMinutos(horaCheckin)) {
      return `La limpieza (${limpieza.hora}–${aHora(fin)}) debe terminar antes de que llegue el siguiente huésped (${horaCheckin})`;
    }
    return null;
  }

  /** Valida y limpia los datos de una casa publicada por un anfitrión. */
  function validarPropiedad(b) {
    const err = (error) => ({ ok: false, error });
    const txt = (v) => String(v ?? '').trim();
    const entero = (v, min, max) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };

    const titulo = txt(b.titulo);
    if (titulo.length < 5 || titulo.length > 80) return err('El título debe tener entre 5 y 80 caracteres');

    const categoria = txt(b.categoria);
    if (!CATEGORIAS_PUBLICABLES.includes(categoria)) return err('Selecciona un tipo de alojamiento válido');

    const ciudad = txt(b.ciudad);
    if (ciudad.length < 2 || ciudad.length > 60) return err('Indica la ciudad (2 a 60 caracteres)');
    const pais = txt(b.pais) || 'México';
    if (pais.length > 60) return err('El país es demasiado largo');
    const ubicacion = txt(b.ubicacion) || ciudad;
    if (ubicacion.length > 100) return err('La ubicación es demasiado larga (máx. 100)');

    const precioPorNoche = Number(b.precioPorNoche);
    if (!Number.isFinite(precioPorNoche) || precioPorNoche < 50 || precioPorNoche > 100000) {
      return err('El precio por noche debe estar entre $50 y $100,000');
    }

    const huespedes = entero(b.huespedes, 1, 16);
    if (huespedes === null) return err('Los huéspedes deben ser un número entre 1 y 16');
    const habitaciones = entero(b.habitaciones, 1, 20);
    if (habitaciones === null) return err('Las habitaciones deben ser un número entre 1 y 20');
    const banos = entero(b.banos, 1, 10);
    if (banos === null) return err('Los baños deben ser un número entre 1 y 10');

    const descripcion = txt(b.descripcion);
    if (descripcion.length < 20 || descripcion.length > 1000) {
      return err('La descripción debe tener entre 20 y 1000 caracteres');
    }

    const comodidades = Array.isArray(b.comodidades)
      ? [...new Set(b.comodidades.map(txt).filter((c) => COMODIDADES.includes(c)))]
      : [];

    let imagenes = Array.isArray(b.imagenes) ? b.imagenes.map(txt).filter(Boolean) : [];
    if (imagenes.length > 6) return err('Puedes añadir máximo 6 fotos');
    if (imagenes.some((u) => !esUrlHttp(u))) return err('Todas las fotos deben ser enlaces http(s) válidos');
    if (!imagenes.length) imagenes = [IMG_DEFAULT];

    const horaCheckin = txt(b.horaCheckin);
    const horaCheckout = txt(b.horaCheckout);
    if (!HORA_RE.test(horaCheckin) || !HORA_RE.test(horaCheckout)) {
      return err('Las horas de llegada y salida deben tener formato HH:MM');
    }

    const lim = b.limpieza || {};
    const limpieza = {
      activa: lim.activa !== false && lim.activa !== 'false',
      hora: txt(lim.hora) || '12:00',
      duracionHoras: entero(lim.duracionHoras ?? 2, 1, 6)
    };
    if (limpieza.duracionHoras === null) return err('La duración de la limpieza debe ser de 1 a 6 horas');
    if (!HORA_RE.test(limpieza.hora)) return err('La hora de limpieza debe tener formato HH:MM');

    const errVentana = validarVentanaLimpieza({ horaCheckin, horaCheckout, limpieza });
    if (errVentana) return err(errVentana);

    const anfitrion = txt(b.anfitrion);
    if (anfitrion.length < 2 || anfitrion.length > 60) return err('Escribe tu nombre de anfitrión (2 a 60 caracteres)');
    const anfitrionId = txt(b.anfitrionId);
    if (!ID_RE.test(anfitrionId)) return err('Identificador de anfitrión inválido');

    return {
      ok: true,
      data: {
        titulo, categoria, ciudad, pais, precioPorNoche, huespedes, habitaciones, banos,
        descripcion, comodidades, imagenes, ubicacion,
        horaCheckin, horaCheckout, limpieza, anfitrion, anfitrionId
      }
    };
  }

  /** Dos reservas se traslapan si una empieza antes de que la otra termine. */
  function hayTraslape(reservas, propertyId, inicio, fin) {
    return reservas.some(
      (b) => Number(b.propertyId) === Number(propertyId) && inicio < b.fechaFin && fin > b.fechaInicio
    );
  }

  /** Crea la tarea de limpieza para el día de salida de una reserva (o null si está desactivada). */
  function crearTareaLimpieza(reserva, propiedad) {
    const p = normalizarPropiedad(propiedad);
    if (!p.limpieza.activa) return null;
    return {
      id: `L${reserva.id}`,
      bookingId: reserva.id,
      propertyId: Number(p.id),
      propertyTitulo: p.titulo,
      huesped: reserva.nombre,
      fecha: reserva.fechaFin,
      hora: p.limpieza.hora,
      duracionHoras: p.limpieza.duracionHoras,
      estado: 'pendiente',
      anfitrionId: p.anfitrionId || null
    };
  }

  /** Valida una hora nueva para una limpieza ya programada. */
  function validarHoraTarea(tarea, hora, propiedad, reservas) {
    if (!HORA_RE.test(String(hora))) return 'Hora inválida (usa el formato HH:MM)';
    const p = normalizarPropiedad(propiedad);
    const ini = aMinutos(hora);
    const fin = ini + tarea.duracionHoras * 60;
    if (ini < aMinutos(p.horaCheckout)) {
      return `La limpieza no puede empezar antes de la salida del huésped (${p.horaCheckout})`;
    }
    const entraOtro = reservas.some(
      (b) => Number(b.propertyId) === Number(tarea.propertyId) && b.fechaInicio === tarea.fecha
    );
    if (entraOtro && fin > aMinutos(p.horaCheckin)) {
      return `Ese día llega otro huésped a las ${p.horaCheckin}; la limpieza debe terminar antes`;
    }
    if (fin > 24 * 60) return 'La limpieza debe terminar antes de la medianoche';
    return null;
  }

  /**
   * Aplica un cambio de horarios / limpieza sobre una casa existente y lo valida.
   * Devuelve { ok, error } o { ok, data: { horaCheckin, horaCheckout, limpieza } }.
   */
  function aplicarConfigLimpieza(actual, body) {
    const a = normalizarPropiedad(actual);
    const c = {
      horaCheckin: body.horaCheckin ?? a.horaCheckin,
      horaCheckout: body.horaCheckout ?? a.horaCheckout,
      limpieza: { ...a.limpieza, ...(body.limpieza || {}) }
    };
    if (!HORA_RE.test(c.horaCheckin) || !HORA_RE.test(c.horaCheckout) || !HORA_RE.test(c.limpieza.hora)) {
      return { ok: false, error: 'Las horas deben tener formato HH:MM' };
    }
    c.limpieza.duracionHoras = Number(c.limpieza.duracionHoras);
    if (!Number.isInteger(c.limpieza.duracionHoras) || c.limpieza.duracionHoras < 1 || c.limpieza.duracionHoras > 6) {
      return { ok: false, error: 'La duración debe ser de 1 a 6 horas' };
    }
    c.limpieza.activa = c.limpieza.activa !== false && c.limpieza.activa !== 'false';
    const error = validarVentanaLimpieza(c);
    return error ? { ok: false, error } : { ok: true, data: c };
  }

  const api = {
    CATEGORIAS_PUBLICABLES, COMODIDADES, IMG_DEFAULT, ESTADOS_LIMPIEZA,
    HORA_RE, FECHA_RE, ID_RE,
    aMinutos, aHora, norm, hoyISO,
    normalizarPropiedad, coincideDestino, validarVentanaLimpieza, validarPropiedad, aplicarConfigLimpieza,
    hayTraslape, crearTareaLimpieza, validarHoraTarea
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Reglas = api;
})();
