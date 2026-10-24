import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { presign, storageReady, deleteObject } from './storage.js';
import { dbReady, readJsonWithStatus, writeJson, dbHealthCheck, closeDbPool, migrateLegacySnapshots } from './db.js';
import { serviceErrorHandler, logServiceFailure } from './utils/service-error.js';
import { cleanText, cleanKey, cleanUrl, normalizeList } from './utils/input.js';
import { categories, products } from './menu-data.js';
import { requireAdminApiKey, isAdminApiKeyValid } from './admin-auth.js';
import { createMediaService } from './services/media-service.js';
import { registerMediaRoutes } from './routes/media-routes.js';
import { createCategoryService } from './services/category-service.js';
import { registerCategoryRoutes } from './routes/category-routes.js';
import { createPromotionService } from './services/promotion-service.js';
import { registerPromotionRoutes } from './routes/promotion-routes.js';
import { createStateRepository } from './repositories/state-repository.js';
import { createStateStore } from './repositories/state-store.js';
import { registerProductRoutes } from './routes/product-routes.js';
import { createSmartMenuService } from './services/smart-menu-service.js';
import { createReservationService } from './services/reservation-service.js';
import { registerReservationRoutes } from './routes/reservation-routes.js';
import { registerCustomerRoutes } from './routes/customer-routes.js';
import { registerCustomerAccountRoutes } from './routes/customer-account-routes.js';
import { registerCouponRoutes } from './routes/coupon-routes.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { configureHttpSecurity } from './middleware/http-security.js';
import { createNextPrefixedId } from './utils/id-generator.js';
import { registerPageRoutes } from './routes/page-routes.js';
import { allowedCorsOrigins, isProductionRuntime, maxVideoBytes as MAX_VIDEO_BYTES, menuVersion as MENU_VERSION, port, stateKey as STATE_KEY, videoTypes as VIDEO_TYPES, smartNewWindowMs as SMART_NEW_WINDOW_MS } from './config.js';

const app = express();
const serverStartedAt = Date.now();
app.set('trust proxy', 1);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
configureHttpSecurity(app, { allowedCorsOrigins, isProductionRuntime });
app.use(express.json({limit:'1mb',strict:true}));

const reservations=[];
const reservationRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:8,
  message:'Too many reservation requests. Please try again later.'
});
const accountOtpStartRateLimit=createRateLimiter({
  windowMs:15*60*1000,
  limit:5,
  message:'Too many account sign-in attempts. Please wait before trying again.'
});
const accountOtpPhoneRateLimit=createRateLimiter({
  windowMs:15*60*1000,
  limit:3,
  message:'Too many verification codes requested for this phone. Please wait.',
  keyResolver:(req)=>'phone:'+String(req.body?.phone||'').replace(/\D/g,'').slice(-15)
});
const accountOtpVerifyRateLimit=createRateLimiter({
  windowMs:15*60*1000,
  limit:10,
  message:'Too many verification attempts. Please wait before trying again.'
});
const rateLimiters=[reservationRateLimit,accountOtpStartRateLimit,accountOtpPhoneRateLimit,accountOtpVerifyRateLimit];
const rateLimitCleanupTimer=setInterval(() => {
  for (const limiter of rateLimiters) limiter.cleanup();
}, 10*60*1000);
rateLimitCleanupTimer.unref();

const stateStore = createStateStore({
  readJsonWithStatus,
  writeJson,
  dbReady,
  storageReady: !isProductionRuntime && storageReady,
  allowEphemeral: !isProductionRuntime,
  stateKey: STATE_KEY,
  menuVersion: MENU_VERSION,
  products,
  reservations
});
const { persist: persistState, flush: flushPersistState } = stateStore;
const stateRepository = createStateRepository({ products, categories, reservations, persist: persistState });

const smartMenu = createSmartMenuService({
  normalizeList,
  presign,
  storageReady,
  smartNewWindowMs: SMART_NEW_WINDOW_MS
});
const { smartSnapshot, withMediaUrls, invalidateSmartSnapshot } = smartMenu;

const promotionService=createPromotionService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  persistenceReady: dbReady || (!isProductionRuntime && storageReady),
  allowEphemeral: !isProductionRuntime
});
registerPromotionRoutes(app,{service:promotionService,requireAdminApiKey});
const categoryService=createCategoryService({categoriesRepository:stateRepository.categories,productsRepository:stateRepository.products,storageReady,dbReady,presign,readJsonWithStatus,writeJson,deleteObject,isAdminApiKeyValid});
registerCategoryRoutes(app,{service:categoryService,requireAdminApiKey});
const restoreCategories=categoryService.restore;
const nextProductId = createNextPrefixedId(stateRepository.products, 'P', 3);

app.get('/health',async(_req,res)=>{
  const persistence = stateStore.status();
  const promotionPersistence = promotionService.persistenceStatus();
  const database = await dbHealthCheck();
  const persistentStoreConfigured = dbReady || (!isProductionRuntime && storageReady);
  const businessStateHealthy = dbReady
    ? database.ok && persistence.lastPersistOk !== false
    : persistentStoreConfigured
      ? persistence.restoreStatus !== 'restore_failed' && persistence.lastPersistOk !== false
      : !isProductionRuntime;
  const ready = businessStateHealthy && promotionPersistence.lastPersistOk !== false;
  const payload = {
    ok: ready,
    service: 'arabisk-web',
    uptimeSeconds: Math.floor((Date.now()-serverStartedAt)/1000),
    databaseConfigured: dbReady,
    persistentStoreConfigured,
    database,
    mediaStorageConfigured: storageReady,
    persistence,
    promotionPersistence,
    environment: isProductionRuntime ? 'production' : 'development'
  };
  return res.status(ready ? 200 : 503).json(payload);
});

registerProductRoutes(app, {
  repository: stateRepository.products,
  categories: stateRepository.categories,
  storageReady,
  presign,
  deleteObject,
  requireAdminApiKey,
  isAdminApiKeyValid,
  cleanText,
  cleanKey,
  cleanUrl,
  normalizeList,
  smartSnapshot,
  withMediaUrls,
  invalidateSmartSnapshot,
  nextProductId,
  maxVideoBytes: MAX_VIDEO_BYTES,
  videoTypes: VIDEO_TYPES
});

const reservationService = createReservationService({
  repository: stateRepository,
  cleanText,
  nextReservationId: createNextPrefixedId(stateRepository.reservations, 'R', 4)
});

registerReservationRoutes(app, {
  service: reservationService,
  requireAdminApiKey,
  reservationRateLimit
});
registerCustomerRoutes(app, { requireAdminApiKey });
registerCouponRoutes(app, { requireAdminApiKey });
registerCustomerAccountRoutes(app, {
  reservations: stateRepository.reservations,
  products: stateRepository.products,
  otpStartRateLimit: accountOtpStartRateLimit,
  otpPhoneRateLimit: accountOtpPhoneRateLimit,
  otpVerifyRateLimit: accountOtpVerifyRateLimit
});

const mediaService = createMediaService({
  repository: stateRepository.products,
  storageReady,
  dbReady,
  readJsonWithStatus,
  writeJson,
  presign
});
registerMediaRoutes(app, {
  service: mediaService,
  requireAdminApiKey
});
registerPageRoutes(app, { rootDir: __dirname, distDir: dist });
app.use(serviceErrorHandler);

console.log(`ZORONA persistence bootstrap — database=${dbReady} storage=${storageReady}`);
if (dbReady && storageReady) {
  const migration = await migrateLegacySnapshots();
  if (!migration.ok) throw new Error(`Legacy data migration failed: ${migration.reason}`);
  console.log(`ZORONA legacy migration — alreadyMigrated=${migration.alreadyMigrated} migrated=${migration.migrated.length} missing=${migration.missing.length}`);
}
await stateStore.restore();
await restoreCategories();
await promotionService.restore();
if(dbReady){
  persistState();
  await flushPersistState();
}
const server=app.listen(port,()=>console.log(`ZORONA web listening on ${port} — ${products.length} menu items, ${categories.length} categories, ${reservations.length} reservations`));
server.requestTimeout=30_000;
server.headersTimeout=35_000;
server.keepAliveTimeout=5_000;
let shuttingDown=false;
const shutdown=(signal)=>{
  if(shuttingDown)return;
  shuttingDown=true;
  console.log(`ZORONA web received ${signal}; shutting down gracefully`);
  const forceExit=setTimeout(()=>process.exit(1),10000);
  forceExit.unref();
  server.close(async()=>{
    clearTimeout(forceExit);
    try{
      await flushPersistState();
      await promotionService.flushPersistence();
      await closeDbPool();
    }catch(error){
      logServiceFailure(error, { service: 'web', operation: 'shutdown-flush' });
    }
    process.exit(0);
  });
};
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
