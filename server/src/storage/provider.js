import { createMongoStorageProvider } from './providers/mongoStorageProvider.js';

export function createStorageProvider() {
  return createMongoStorageProvider();
}
