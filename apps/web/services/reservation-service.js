import { normalizePhone } from '../utils/phone.js';
import { isValidDateOnly } from '../utils/input.js';
import { getUaeDateOnly, parseUaeLocalDateTime } from '../utils/uae-time.js';

const RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'cancelled']);

class ReservationServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReservationServiceError';
    this.status = status;
  }
}

export function createReservationService({ repository, cleanText, nextReservationId, now = () => new Date() }) {
  const { reservations } = repository;

  function listReservations() {
    return reservations.all();
  }

  async function createReservation(body) {
    const name = cleanText(body.name, 80);
    const phone = normalizePhone(body.phone);
    const date = cleanText(body.date, 20);
    const time = cleanText(body.time, 10);
    const guests = Number(body.guests);
    const notes = cleanText(body.notes, 300);
    const idempotencyKey = cleanText(body.idempotencyKey, 100);
    const currentTime = now();
    const dateOk = isValidDateOnly(date);
    const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const today = getUaeDateOnly(currentTime);
    const reservationTimestamp = dateOk && timeOk
      ? parseUaeLocalDateTime(date, time)
      : NaN;

    if (idempotencyKey) {
      const existing = reservations.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    if (!name || !phone || !date || !time || !Number.isInteger(guests) || guests < 1 || guests > 20) {
      throw new ReservationServiceError('name, phone, date, time and guests are required');
    }
    if (!dateOk || date < today) {
      throw new ReservationServiceError('Reservation date must be a valid date that is not in the past.');
    }
    if (!timeOk) {
      throw new ReservationServiceError('Reservation time must be in HH:MM format.');
    }
    if (!Number.isFinite(reservationTimestamp)) {
      throw new ReservationServiceError('Reservation time must be in the future for Abu Dhabi time.');
    }
    if (date === today && reservationTimestamp < currentTime.getTime()) {
      throw new ReservationServiceError('Reservation time must be in the future for Abu Dhabi time.');
    }

    const duplicate = reservations.findDuplicate(phone, date, time);
    if (duplicate) {
      const error = new ReservationServiceError('A reservation already exists for this phone, date and time.', 409);
      error.meta = { reservationId: duplicate.id };
      throw error;
    }

    const createdAt = new Date().toISOString();
    const reservation = {
      id: nextReservationId(),
      name, phone, date, time, guests, notes,
      status: 'pending',
      idempotencyKey,
      createdAt
    };

    reservations.add(reservation);
    try {
      await reservations.save();
    } catch (error) {
      reservations.removeById(reservation.id);
      if (!Number.isInteger(error?.status)) error.status = 503;
      throw error;
    }

    return reservation;
  }

  async function updateReservation(id, body) {
    const reservation = reservations.findById(id);
    if (!reservation) throw new ReservationServiceError('Reservation not found', 404);
    const before = structuredClone(reservation);

    if (body?.status !== undefined) {
      const nextStatus = String(body.status);
      if (!RESERVATION_STATUSES.has(nextStatus)) {
        throw new ReservationServiceError('Invalid reservation status');
      }
      reservation.status = nextStatus;
    }

    if (body?.notes !== undefined) reservation.notes = cleanText(body.notes, 300);
    try {
      await reservations.save();
    } catch (error) {
      Object.assign(reservation, before);
      if (!Number.isInteger(error?.status)) error.status = 503;
      throw error;
    }
    return reservation;
  }

  return { listReservations, createReservation, updateReservation };
}
