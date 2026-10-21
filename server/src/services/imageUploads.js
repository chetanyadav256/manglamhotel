import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { HttpError } from '../utils/http.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const jpegFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function validJpeg(data) {
  if (data.length < 20 || data[0] !== 0xff || data[1] !== 0xd8) return false;
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      if (!hasScan) return false;
      offset += 1;
      continue;
    }
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset];
    offset += 1;
    if (marker === 0x00) {
      if (!hasScan) return false;
      continue;
    }
    if (marker === 0xd9) return hasFrame && hasScan && offset === data.length;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return false;
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) return false;
    if (jpegFrameMarkers.has(marker)) {
      if (segmentLength < 8 || data.readUInt16BE(offset + 3) === 0 || data.readUInt16BE(offset + 5) === 0) return false;
      hasFrame = true;
    }
    if (marker === 0xda) {
      if (!hasFrame || segmentLength < 6) return false;
      hasScan = true;
    }
    offset += segmentLength;
  }
  return false;
}

function validPng(data) {
  if (data.length < 45 || !data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return false;
  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (length > data.length - offset - 12) return false;
    if (!hasHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      hasHeader = data.readUInt32BE(offset + 8) > 0 && data.readUInt32BE(offset + 12) > 0;
      if (!hasHeader) return false;
    }
    if (type === 'IDAT') hasData = hasData || length > 0;
    offset += length + 12;
    if (type === 'IEND') return length === 0 && hasData && offset === data.length;
  }
  return false;
}

function validWebp(data) {
  if (data.length < 20 || data.toString('ascii', 0, 4) !== 'RIFF'
    || data.readUInt32LE(4) !== data.length - 8
    || data.toString('ascii', 8, 12) !== 'WEBP') return false;
  let offset = 12;
  let hasFrame = false;
  while (offset + 8 <= data.length) {
    const type = data.toString('ascii', offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    if (length > data.length - offset - 8) return false;
    if (type === 'VP8 ' || type === 'VP8L' || type === 'VP8X') hasFrame = hasFrame || length > 0;
    offset += 8 + length + (length % 2);
  }
  return hasFrame && offset === data.length;
}
export const supportedTypes = new Map([
  ['image/jpeg', { extension: '.jpg', matches: validJpeg }],
  ['image/png', { extension: '.png', matches: validPng }],
  ['image/webp', { extension: '.webp', matches: validWebp }],
]);
const activeUploadCounts = new WeakMap();

export function acquireUploadSlot(storage) {
  const active = activeUploadCounts.get(storage) ?? 0;
  if (active >= 2) return false;
  activeUploadCounts.set(storage, active + 1);
  return true;
}

export function releaseUploadSlot(storage) {
  activeUploadCounts.set(storage, Math.max(0, (activeUploadCounts.get(storage) ?? 1) - 1));
}

export function createUploadMiddleware({ maxImages = 5, fieldName = 'images', fields = 6, parts = 11 } = {}) {
  return multer({
    storage: multer.diskStorage({
      destination(request, _file, callback) {
        callback(null, request.imageTempDirectory);
      },
      filename(_request, _file, callback) {
        callback(null, randomUUID());
      },
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: maxImages,
      fields,
      fieldSize: 512,
      parts,
    },
    fileFilter(_request, file, callback) {
      if (!supportedTypes.has(file.mimetype)) {
        callback(new HttpError(415, 'Only JPEG, PNG, and WebP images are supported.'));
        return;
      }
      callback(null, true);
    },
  }).array(fieldName, maxImages);
}

export function multipartError(error, message = 'Upload must contain up to five images in the images field only.') {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return new HttpError(413, 'Each image must be 5 MB or smaller.');
    return new HttpError(400, message);
  }
  return error;
}

