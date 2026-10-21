import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Router } from 'express';
import { supportedTypes, acquireUploadSlot, releaseUploadSlot, createUploadMiddleware, multipartError } from '../services/imageUploads.js';
import { createAdminProtection } from '../security/adminAuth.js';
import { imageKitStorage } from '../services/imageKitStorage.js';
import { logDiagnosticError } from '../utils/diagnostics.js';
import { HttpError } from '../utils/http.js';

const MAX_IMAGES = 5;
const MAX_COMPLETED_UPLOADS = 100;
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const imageFolder = (roomId) => `/manglam-hotel/rooms/${roomId}/`;
function ownedImagePath(roomId, filePath) {
  if (typeof filePath !== 'string') return false;
  const folder = imageFolder(roomId);
  const assetName = filePath.startsWith(folder) ? filePath.slice(folder.length) : '';
  return Boolean(assetName) && !assetName.includes('..') && !assetName.includes('\\');
}

function imageIdentity(image, _index) {
  if (typeof image.imageId === 'string' && image.imageId) return image.imageId;
  const legacyIdentity = `${image.url || ''}\0${image.publicId || ''}`;
  return createHash('sha256').update(legacyIdentity).digest('hex').slice(0, 32);
}

function validateImageId(imageId) {
  if (!/^(?:[a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/i.test(imageId)) {
    throw new HttpError(400, 'Image ID is invalid.');
  }
}

function serializeImages(room) {
  return (room.images ?? [])
    .map((image, index) => {
      const isManagedImage = Boolean(image.fileId && ownedImagePath(room._id, image.filePath));
      return {
        id: imageIdentity(image, index),
        fileId: isManagedImage ? image.fileId : null,
        url: isHttpsImageUrl(image.url) ? image.url : null,
        filePath: isManagedImage ? image.filePath : null,
        alt: image.alt || '',
        displayOrder: Number.isInteger(image.displayOrder) ? image.displayOrder : index,
      };
    })
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((image, index) => ({ ...image, displayOrder: index, isMain: index === 0 }));
}

function isHttpsImageUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assertEmptyQuery(query) {
  if (Object.keys(query).length) throw new HttpError(400, 'Unsupported query parameter.');
}

function imageKitAsset(response, roomId, alt, displayOrder) {
  if (typeof response?.fileId !== 'string' || !response.fileId
    || !isHttpsImageUrl(response.url)
    || !ownedImagePath(roomId, response.filePath)) {
    const error = new Error('Image storage returned invalid metadata.');
    error.diagnosticCategory = 'imagekit';
    throw error;
  }
  return {
    imageId: randomUUID(),
    fileId: response.fileId,
    url: response.url,
    filePath: response.filePath,
    alt,
    displayOrder,
  };
}

async function addCleanupRecords(Room, roomId, assets) {
  if (!assets.length) return;
  const pendingImageCleanup = assets.map((asset) => ({
    cleanupId: randomUUID(),
    fileId: asset.fileId,
    filePath: asset.filePath,
    queuedAt: new Date(),
  }));
  await Room.updateOne({ _id: roomId }, { $push: { pendingImageCleanup: { $each: pendingImageCleanup } } });
}

async function safelyDeleteAssets(Room, roomId, storage, assets, requestId) {
  const failed = [];
  for (const asset of assets) {
    try {
      await storage.delete(asset.fileId);
    } catch (error) {
      if (await storage.isAlreadyDeleted(error)) continue;
      logDiagnosticError(error, {
        category: 'imagekit',
        operation: 'imagekit.delete.compensation',
        requestId,
      });
      failed.push(asset);
    }
  }
  if (failed.length) {
    try {
      await addCleanupRecords(Room, roomId, failed);
    } catch (error) {
      logDiagnosticError(error, {
        category: 'mongodb',
        operation: 'mongodb.image-cleanup-record',
        requestId,
      });
    }
  }
}

async function clearCleanupRecord(Room, roomId, cleanupId) {
  await Room.updateOne(
    { _id: roomId, 'pendingImageCleanup.cleanupId': cleanupId },
    { $pull: { pendingImageCleanup: { cleanupId } } },
  );
}

export function createAdminRoomImagesRouter({
  models,
  isDatabaseReady,
  imageStorage = imageKitStorage,
  ...adminConfig
}) {
  const router = Router();
  const { Room } = models;
  const protect = createAdminProtection({
    models,
    isDatabaseReady,
    ...adminConfig,
    allowMultipart: (request) => request.method === 'POST' && /^\/[^/]+\/images$/.test(request.path),
  });
  router.param('id', (request, _response, next, id) => {
    if (!/^[a-f\d]{24}$/i.test(id)) return next(new HttpError(400, 'Room ID is invalid.'));
    next();
  });

  router.get('/:id/images', ...protect, async (request, response) => {
    response.set('Cache-Control', 'no-store');
    assertEmptyQuery(request.query);
    const room = await Room.findOne({ _id: request.params.id }).lean();
    if (!room) throw new HttpError(404, 'Room not found.');
    response.json({ data: { roomId: String(room._id), images: serializeImages(room), maxImages: MAX_IMAGES } });
  });

  router.post('/:id/images', ...protect, async (request, response, next) => {
    if (!acquireUploadSlot(imageStorage)) {
      next(new HttpError(429, 'Image uploads are busy. Please try again shortly.'));
      return;
    }
    let tempDirectory;
    try {
      tempDirectory = await mkdtemp(join(tmpdir(), 'manglam-room-images-'));
      request.imageTempDirectory = tempDirectory;
    } catch (error) {
      releaseUploadSlot(imageStorage);
      next(error);
      return;
    }

    const uploadAbortController = new AbortController();
    const abortUpload = () => {
      if (!response.writableEnded) uploadAbortController.abort();
    };
    request.once('aborted', abortUpload);
    response.once('close', abortUpload);

    createUploadMiddleware()(request, response, async (parseError) => {
      let requestError;
      try {
        if (parseError) throw multipartError(parseError);
        assertEmptyQuery(request.query);
        const files = request.files ?? [];
        if (!files.length) throw new HttpError(400, 'Select at least one image to upload.');
        const bodyKeys = Object.keys(request.body ?? {});
        if (bodyKeys.some((key) => !['altTexts', 'uploadId'].includes(key))) {
          throw new HttpError(400, 'Upload contains unsupported fields.');
        }
        const uploadId = request.body?.uploadId;
        if (typeof uploadId !== 'string'
          || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(uploadId)) {
          throw new HttpError(400, 'Upload ID is invalid.');
        }
        const altTexts = request.body?.altTexts === undefined
          ? []
          : Array.isArray(request.body.altTexts) ? request.body.altTexts : [request.body.altTexts];
        if (altTexts.length && altTexts.length !== files.length) {
          throw new HttpError(400, 'Provide one alternative text value per image, or leave all blank.');
        }
        const alternatives = files.map((_file, index) => {
          const value = altTexts[index] ?? '';
          if (typeof value !== 'string' || value.length > 300) {
            throw new HttpError(400, 'Image alternative text must be 300 characters or fewer.');
          }
          return value.trim();
        });

        const validatedFiles = [];
        for (const file of files) {
          const signature = await readFile(file.path);
          const type = supportedTypes.get(file.mimetype);
          if (!signature.length) throw new HttpError(400, 'Image files must not be empty.');
          if (!type?.matches(signature)) {
            throw new HttpError(415, 'Image file contents do not match a supported format.');
          }
          validatedFiles.push({ ...file, extension: type.extension });
        }
        if (!isDatabaseReady()) throw new HttpError(503, 'Database is currently unavailable.');

        const roomId = request.params.id;
        const existingRoom = await Room.findOne({ _id: roomId })
          .select('+completedImageUploads +pendingImageReservations')
          .lean();
        if (!existingRoom) throw new HttpError(404, 'Room not found.');
        if (existingRoom.isArchived) throw new HttpError(409, 'Restore this archived room before managing its images.');
        if ((existingRoom.completedImageUploads ?? []).some((entry) => entry.uploadId === uploadId)) {
          response.json({ data: { images: serializeImages(existingRoom), alreadyCompleted: true } });
          return;
        }
        if ((existingRoom.pendingImageReservations ?? []).some((entry) => (
          entry.uploadId === uploadId && new Date(entry.expiresAt) > new Date()
        ))) {
          throw new HttpError(409, 'This upload is already being processed. Retry with the same selection shortly.');
        }
        imageStorage.ensureConfigured();
        const reservationId = randomUUID();
        const reservationTime = new Date();
        const reservationExpires = new Date(reservationTime.getTime() + RESERVATION_TTL_MS);
        const roomFilter = {
          _id: roomId,
          isArchived: { $ne: true },
          $expr: {
            $let: {
              vars: {
                activeReservations: {
                  $filter: {
                    input: { $ifNull: ['$pendingImageReservations', []] },
                    as: 'reservation',
                    cond: { $gt: ['$$reservation.expiresAt', reservationTime] },
                  },
                },
              },
              in: {
                $and: [
                  {
                    $lte: [
                      {
                        $add: [
                          { $size: { $ifNull: ['$images', []] } },
                          { $sum: { $map: { input: '$$activeReservations', as: 'reservation', in: '$$reservation.count' } } },
                          files.length,
                        ],
                      },
                      MAX_IMAGES,
                    ],
                  },
                  {
                    $not: [{
                      $in: [
                        uploadId,
                        { $map: { input: '$$activeReservations', as: 'reservation', in: '$$reservation.uploadId' } },
                      ],
                    }],
                  },
                ],
              },
            },
          },
        };
        const activeReservations = {
          $filter: {
            input: { $ifNull: ['$pendingImageReservations', []] },
            as: 'reservation',
            cond: { $gt: ['$$reservation.expiresAt', reservationTime] },
          },
        };
        const activeReservationTotal = {
          $sum: {
            $map: {
              input: '$$activeReservations',
              as: 'reservation',
              in: '$$reservation.count',
            },
          },
        };
        const uploadedAssets = [];
        let retainAssetsForRecovery = false;
        try {
          // Mongoose 9 requires explicit pipeline opt-in and does not cast its
          // values. IDs are validated UUID strings, count is bounded to 1..5,
          // expiresAt is a Date, and startOrder is computed atomically from
          // stored counts. Never interpolate arbitrary request fields here.
          const reserved = await Room.updateOne(roomFilter, [{
            $set: {
              pendingImageReservations: {
                $let: {
                  vars: { activeReservations },
                  in: {
                    $concatArrays: [
                      '$$activeReservations',
                      [{
                        reservationId,
                        uploadId,
                        count: files.length,
                        expiresAt: reservationExpires,
                        startOrder: {
                          $add: [
                            { $size: { $ifNull: ['$images', []] } },
                            activeReservationTotal,
                          ],
                        },
                      }],
                    ],
                  },
                },
              },
            },
          }], { updatePipeline: true });
          if (!reserved.modifiedCount) {
            const room = await Room.findOne({ _id: roomId }).lean();
            if (!room) throw new HttpError(404, 'Room not found.');
            if (room.isArchived) throw new HttpError(409, 'Restore this archived room before managing its images.');
            throw new HttpError(409, 'A room can have no more than five images.');
          }

          const reservationRoom = await Room.findOne({
            _id: roomId,
            'pendingImageReservations.reservationId': reservationId,
          }).select('+pendingImageReservations').lean();
          const startOrder = reservationRoom?.pendingImageReservations
            ?.find((entry) => entry.reservationId === reservationId)?.startOrder;
          if (!Number.isInteger(startOrder)) throw new HttpError(409, 'The room changed during upload. Reload it and try again.');
          for (const [index, file] of validatedFiles.entries()) {
            const uploadName = `${randomUUID()}${file.extension}`;
            let result;
            try {
              result = await imageStorage.upload({
                filePath: file.path,
                fileName: uploadName,
                roomId,
                signal: uploadAbortController.signal,
              });
            } catch (cause) {
              const error = new HttpError(502, 'Image storage could not complete the upload.');
              error.cause = cause;
              error.diagnosticCategory = 'imagekit';
              throw error;
            }
            const candidate = {
              fileId: result?.fileId,
              filePath: result?.filePath,
            };
            if (candidate.fileId && typeof candidate.filePath === 'string'
              && candidate.filePath.startsWith(imageFolder(roomId))) {
              uploadedAssets.push(candidate);
            }
            const asset = imageKitAsset(result, roomId, alternatives[index], startOrder + index);
            uploadedAssets[uploadedAssets.length - 1] = asset;
          }

          let updatedRoom;
          try {
            updatedRoom = await Room.findOneAndUpdate({
              _id: roomId,
              isArchived: { $ne: true },
              'pendingImageReservations.reservationId': reservationId,
              'completedImageUploads.uploadId': { $ne: uploadId },
            }, {
              $push: {
                images: { $each: uploadedAssets },
                completedImageUploads: {
                  $each: [{ uploadId, completedAt: new Date() }],
                  $slice: -MAX_COMPLETED_UPLOADS,
                },
              },
              $pull: { pendingImageReservations: { reservationId } },
              $inc: { imagesVersion: 1 },
            }, { returnDocument: 'after', runValidators: true }).select('+imagesVersion').lean();
          } catch (cause) {
            let persisted;
            try {
              persisted = await Room.findOne({
                _id: roomId,
                'images.fileId': { $in: uploadedAssets.map((asset) => asset.fileId) },
              }).lean();
            } catch (confirmationError) {
              retainAssetsForRecovery = true;
              const error = new HttpError(503, 'Image upload persistence could not be confirmed. Reload the room before retrying.');
              error.cause = confirmationError;
              error.diagnosticCategory = 'mongodb';
              error.operation = 'mongodb.room-image-confirmation';
              throw error;
            }
            if (persisted && uploadedAssets.every(({ fileId }) => persisted.images.some((image) => image.fileId === fileId))) {
              updatedRoom = persisted;
            } else if (!persisted) {
              throw cause;
            } else {
              retainAssetsForRecovery = true;
              const error = new HttpError(503, 'Image upload persistence could not be confirmed. Reload the room before retrying.');
              error.cause = cause;
              error.diagnosticCategory = 'mongodb';
              error.operation = 'mongodb.room-image-metadata';
              throw error;
            }
          }
          if (!updatedRoom) {
            const currentRoom = await Room.findOne({ _id: roomId }).lean();
            if (!currentRoom) throw new HttpError(404, 'Room not found.');
            throw new HttpError(409, 'The room changed during upload. Reload it and try again.');
          }
          response.status(201).json({ data: { images: serializeImages(updatedRoom) } });
        } catch (error) {
          if (uploadedAssets.length && !retainAssetsForRecovery) {
            await safelyDeleteAssets(Room, roomId, imageStorage, uploadedAssets, request.requestId);
          }
          throw error;
        } finally {
          try {
            // Also release after an ambiguous reservation-write failure. Pull
            // only this request's ID; other uploads and existing photos survive.
            await Room.updateOne(
              { _id: roomId, 'pendingImageReservations.reservationId': reservationId },
              { $pull: { pendingImageReservations: { reservationId } } },
            );
          } catch (error) {
            logDiagnosticError(error, {
              category: 'mongodb',
              operation: 'mongodb.image-reservation-release',
              requestId: request.requestId,
            });
          }
        }
      } catch (error) {
        requestError = error;
      } finally {
        request.off('aborted', abortUpload);
        response.off('close', abortUpload);
        try {
          await rm(tempDirectory, { recursive: true, force: true });
        } catch (error) {
          logDiagnosticError(error, {
            category: 'application',
            operation: 'filesystem.temporary-upload-cleanup',
            requestId: request.requestId,
          });
        } finally {
          releaseUploadSlot(imageStorage);
        }
      }
      if (requestError) next(requestError);
    });
  });

  router.delete('/:id/images/:imageId', ...protect, async (request, response) => {
    response.set('Cache-Control', 'no-store');
    assertEmptyQuery(request.query);
    if (Object.keys(request.body ?? {}).length) throw new HttpError(400, 'Request contains unsupported fields.');
    validateImageId(request.params.imageId);
    const room = await Room.findOne({ _id: request.params.id })
      .select('+imagesVersion +pendingImageCleanup')
      .lean();
    if (!room) throw new HttpError(404, 'Room not found.');
    if (room.isArchived) throw new HttpError(409, 'Restore this archived room before managing its images.');
    const imageIndex = (room.images ?? []).findIndex((image, index) => imageIdentity(image, index) === request.params.imageId);
    if (imageIndex < 0) throw new HttpError(404, 'Room image not found.');
    const image = room.images[imageIndex];
    if (!image.fileId || !ownedImagePath(room._id, image.filePath)) {
      throw new HttpError(409, 'This legacy image cannot be deleted through ImageKit management.');
    }
    const cleanupId = randomUUID();
    const updatedRoom = await Room.findOneAndUpdate({
      _id: room._id,
      isArchived: { $ne: true },
      $or: [
        { imagesVersion: room.imagesVersion ?? 0 },
        { imagesVersion: { $exists: false } },
      ],
      'images.imageId': image.imageId,
    }, {
      $set: {
        images: room.images
          .filter((_entry, index) => index !== imageIndex)
          .map((entry, displayOrder) => ({ ...entry, displayOrder })),
      },
      $push: { pendingImageCleanup: { cleanupId, fileId: image.fileId, filePath: image.filePath, queuedAt: new Date() } },
      $inc: { imagesVersion: 1 },
    }, { returnDocument: 'after', runValidators: true }).select('+imagesVersion +pendingImageCleanup').lean();
    if (!updatedRoom) throw new HttpError(409, 'The room changed. Reload it and try again.');

    let cleanupPending = false;
    let deleted = false;
    try {
      await imageStorage.delete(image.fileId);
      deleted = true;
    } catch (error) {
      if (await imageStorage.isAlreadyDeleted(error)) {
        deleted = true;
      } else {
        logDiagnosticError(error, {
          category: 'imagekit',
          operation: 'imagekit.delete.room-photo',
          requestId: request.requestId,
        });
        cleanupPending = true;
      }
    }
    if (deleted) {
      try {
        await clearCleanupRecord(Room, room._id, cleanupId);
      } catch (error) {
        logDiagnosticError(error, {
          category: 'mongodb',
          operation: 'mongodb.image-cleanup-record-clear',
          requestId: request.requestId,
        });
        cleanupPending = true;
      }
    }
    response.json({ data: { deleted: true, cleanupPending, images: serializeImages(updatedRoom) } });
  });

  router.patch('/:id/images/:imageId/main', ...protect, async (request, response) => {
    response.set('Cache-Control', 'no-store');
    assertEmptyQuery(request.query);
    if (Object.keys(request.body ?? {}).length) throw new HttpError(400, 'Request contains unsupported fields.');
    validateImageId(request.params.imageId);
    const room = await Room.findOne({ _id: request.params.id }).select('+imagesVersion').lean();
    if (!room) throw new HttpError(404, 'Room not found.');
    if (room.isArchived) throw new HttpError(409, 'Restore this archived room before managing its images.');
    const images = room.images ?? [];
    const selectedIndex = images.findIndex((image, index) => imageIdentity(image, index) === request.params.imageId);
    if (selectedIndex < 0) throw new HttpError(404, 'Room image not found.');
    const ordered = [images[selectedIndex], ...images.filter((_image, index) => index !== selectedIndex)]
      .map((image, displayOrder) => ({ ...image, displayOrder }));
    const updatedRoom = await Room.findOneAndUpdate({
      _id: room._id,
      isArchived: { $ne: true },
      $or: [
        { imagesVersion: room.imagesVersion ?? 0 },
        { imagesVersion: { $exists: false } },
      ],
    }, {
      $set: { images: ordered },
      $inc: { imagesVersion: 1 },
    }, { returnDocument: 'after', runValidators: true }).select('+imagesVersion').lean();
    if (!updatedRoom) throw new HttpError(409, 'The room changed. Reload it and try again.');
    response.json({ data: { images: serializeImages(updatedRoom) } });
  });

  return router;
}

export async function processPendingImageCleanup({ models, imageStorage, limit = 25 }) {
  const rooms = await models.Room.find({ 'pendingImageCleanup.0': { $exists: true } })
    .select('+pendingImageCleanup')
    .limit(limit)
    .lean();
  for (const room of rooms) {
    for (const cleanup of room.pendingImageCleanup ?? []) {
      if (!ownedImagePath(room._id, cleanup.filePath)) {
        console.error(JSON.stringify({
          event: 'image_cleanup_rejected',
          category: 'validation',
          operation: 'imagekit.cleanup.ownership',
          roomId: String(room._id),
          cleanupId: cleanup.cleanupId,
        }));
        continue;
      }
      try {
        await imageStorage.delete(cleanup.fileId);
      } catch (error) {
        if (!await imageStorage.isAlreadyDeleted(error)) {
          logDiagnosticError(error, {
            category: 'imagekit',
            operation: 'imagekit.cleanup.retry',
          });
          continue;
        }
      }
      try {
        await clearCleanupRecord(models.Room, room._id, cleanup.cleanupId);
      } catch (error) {
        logDiagnosticError(error, {
          category: 'mongodb',
          operation: 'mongodb.image-cleanup-record-clear',
        });
      }
    }
  }
}

export function startImageCleanupWorker({ models, imageStorage = imageKitStorage, intervalMs = 60_000, additionalCleanup }) {
  let running = false;
  const interval = setInterval(async () => {
    if (running || !models.Room.db.readyState) return;
    running = true;
    try {
      await processPendingImageCleanup({ models, imageStorage });
      await additionalCleanup?.();
    } catch (error) {
      logDiagnosticError(error, {
        category: 'mongodb',
        operation: 'mongodb.image-cleanup-scan',
      });
    } finally {
      running = false;
    }
  }, intervalMs);
  interval.unref();
  return () => clearInterval(interval);
}
