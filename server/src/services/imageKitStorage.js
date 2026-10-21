import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import ImageKit from '@imagekit/nodejs';
import { HttpError } from '../utils/http.js';

const UPLOAD_TIMEOUT_MS = 30_000;
const imageKitFolder = (roomId) => `/manglam-hotel/rooms/${roomId}`;

export function createImageKitStorage({ privateKey = process.env.IMAGEKIT_PRIVATE_KEY } = {}) {
  let client;

  function getClient() {
    if (!privateKey) {
      const error = new HttpError(503, 'Image uploads are not configured.');
      error.diagnosticCategory = 'imagekit';
      throw error;
    }
    if (!client) {
      client = new ImageKit({
        privateKey,
        maxRetries: 0,
        timeout: UPLOAD_TIMEOUT_MS,
      });
    }
    return client;
  }

  return {
    ensureConfigured() {
      getClient();
    },
    async upload({ filePath, fileName, roomId, menuItemId, signal }) {
      const file = createReadStream(filePath);
      try {
        return await getClient().files.upload({
          file,
          fileName,
          folder: menuItemId ? `/manglam-hotel/restaurant/${menuItemId}` : imageKitFolder(roomId),
          token: randomUUID(),
          useUniqueFileName: false,
          overwriteFile: false,
        }, { signal });
      } finally {
        file.destroy();
      }
    },
    async delete(fileId) {
      return getClient().files.delete(fileId);
    },
    async isAlreadyDeleted(error) {
      return error?.status === 404 || error?.statusCode === 404;
    },
  };
}

export const imageKitStorage = createImageKitStorage();
