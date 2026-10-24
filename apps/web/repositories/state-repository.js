import { createCollectionRepository } from './collection-repository.js';

const cleanIdempotencyKey = (value) => String(value ?? '').trim().slice(0, 100);

export function createStateRepository({ products, categories, reservations, persist }) {
  const productRepository = createCollectionRepository(products, { persist });
  const categoryRepository = createCollectionRepository(categories, { persist });
  const reservationRepository = createCollectionRepository(reservations, { persist });

  return {
    products: productRepository,
    categories: categoryRepository,
    reservations: {
      ...reservationRepository,
      findByIdempotencyKey: (key) => reservationRepository.find(
        item => cleanIdempotencyKey(item?.idempotencyKey) === cleanIdempotencyKey(key)
      ),
      findDuplicate: (phone, date, time) => reservationRepository.find(
        item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time
      )
    }
  };
}
