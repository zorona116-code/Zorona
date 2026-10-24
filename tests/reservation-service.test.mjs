import test from 'node:test';
import assert from 'node:assert/strict';
import { createReservationService } from '../apps/web/services/reservation-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

function createFixture({ persist = async () => true } = {}) {
  const reservations = [];
  const reservationRepository = createCollectionRepository(reservations, { persist });
  const repository = {
    reservations: {
      ...reservationRepository,
      findDuplicate: (phone, date, time) => reservations.find(
        item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time
      )
    }
  };

  let sequence = 0;
  const service = createReservationService({
    repository,
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max),
    nextReservationId: () => 'R' + String(++sequence).padStart(4, '0')
  });

  return { service, reservations };
}

test('reservation rejects dates in the past', async () => {
  const { service } = createFixture();
  await assert.rejects(
    () => service.createReservation({ name: 'Ahmed', phone: '0500000000', date: '2020-01-01', time: '19:00', guests: 2 }),
    error => error.status === 400
  );
});

test('duplicate reservation returns conflict metadata', async () => {
  const { service } = createFixture();
  const input = { name: 'Ahmed', phone: '0500000000', date: '2099-01-01', time: '19:00', guests: 2 };
  await service.createReservation(input);
  await assert.rejects(
    () => service.createReservation(input),
    error => error.status === 409 && error.meta?.reservationId === 'R0001'
  );
});
test('reservation rejects impossible calendar dates', async () => {
  const { service } = createFixture();
  await assert.rejects(
    () => service.createReservation({ name: 'Ahmed', phone: '0500000000', date: '2099-02-31', time: '19:00', guests: 2 }),
    error => error.status === 400
  );
});


test('reservation creation rolls back when persistence fails', async () => {
  const { service, reservations } = createFixture({
    persist: async () => false
  });

  await assert.rejects(
    () => service.createReservation({
      name: 'Ahmed',
      phone: '0500000000',
      date: '2099-01-02',
      time: '19:00',
      guests: 2
    }),
    /persisted to storage/i
  );

  assert.equal(reservations.length, 0);
});

test('reservation update rolls back when persistence fails', async () => {
  let failSave = false;
  const { service, reservations } = createFixture({
    persist: async () => !failSave
  });

  const reservation = await service.createReservation({
    name: 'Ahmed',
    phone: '0500000000',
    date: '2099-01-03',
    time: '19:00',
    guests: 2
  });

  failSave = true;
  await assert.rejects(
    () => service.updateReservation(reservation.id, { status: 'confirmed', notes: 'new note' }),
    /persisted to storage/i
  );

  assert.equal(reservations[0].status, 'pending');
  assert.equal(reservations[0].notes, '');
});
