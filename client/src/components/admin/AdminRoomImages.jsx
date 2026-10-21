import { useEffect, useRef, useState } from 'react';
import { ImageOff, Star, Trash2, Upload } from 'lucide-react';
import { useAdminAuth } from '../../app/useAdminAuth.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const MAX_IMAGES = 5;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function AdminRoomImages({ room }) {
  const { request } = useAdminAuth();
  const inputRef = useRef(null);
  const [images, setImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadId, setUploadId] = useState(() => globalThis.crypto.randomUUID());
  const previewUrls = useRef([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyImageId, setBusyImageId] = useState('');
  const [confirmImage, setConfirmImage] = useState(null);
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [failedImages, setFailedImages] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    request(`/rooms/${room.id}/images`)
      .then((response) => {
        if (!cancelled) {
          setImages(response.data.images);
          setError('');
        }
      })
      .catch((failure) => {
        if (!cancelled) {
          setError(failure.message);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [request, room.id, refreshKey]);

  useEffect(() => () => {
    previewUrls.current.forEach((preview) => URL.revokeObjectURL(preview));
  }, []);

  function clearSelectedFiles() {
    previewUrls.current.forEach((preview) => URL.revokeObjectURL(preview));
    previewUrls.current = [];
    setSelectedFiles([]);
    setUploadId(globalThis.crypto.randomUUID());
    if (inputRef.current) inputRef.current.value = '';
  }

  function chooseFiles(event) {
    setError('');
    setNotice('');
    const files = Array.from(event.target.files || []);
    const available = MAX_IMAGES - images.length;
    if (!files.length) return;
    if (files.length > available) {
      setError(`Select no more than ${Math.max(available, 0)} additional image${available === 1 ? '' : 's'}.`);
      event.target.value = '';
      return;
    }
    const invalid = files.find((file) => !ACCEPTED_TYPES.has(file.type) || file.size === 0 || file.size > MAX_FILE_SIZE);
    if (invalid) {
      setError(`${invalid.name}: select a non-empty JPEG, PNG, or WebP image no larger than 5 MB.`);
      event.target.value = '';
      return;
    }
    previewUrls.current.forEach((preview) => URL.revokeObjectURL(preview));
    const selections = files.map((file) => ({ file, alt: '', preview: URL.createObjectURL(file) }));
    previewUrls.current = selections.map(({ preview }) => preview);
    setSelectedFiles(selections);
    setUploadId(globalThis.crypto.randomUUID());
  }

  function retryLoad() {
    setLoading(true);
    setLoadError(false);
    setRefreshKey((key) => key + 1);
  }

  function updateAlt(index, alt) {
    setSelectedFiles((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, alt } : item));
  }

  async function uploadImages() {
    if (!selectedFiles.length || uploading) return;
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    selectedFiles.forEach(({ file, alt }) => {
      formData.append('images', file);
      formData.append('altTexts', alt);
    });
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const response = await request(`/rooms/${room.id}/images`, { method: 'POST', body: formData });
      setImages(response.data.images);
      clearSelectedFiles();
      setNotice('Room photos uploaded.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setUploading(false);
    }
  }

  async function setMain(image) {
    setBusyImageId(image.id);
    setError('');
    setNotice('');
    try {
      const response = await request(`/rooms/${room.id}/images/${image.id}/main`, { method: 'PATCH', body: {} });
      setImages(response.data.images);
      setNotice('Main photo updated.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyImageId('');
    }
  }

  async function deleteImage() {
    if (!confirmImage) return;
    setBusyImageId(confirmImage.id);
    setConfirmError('');
    try {
      const response = await request(`/rooms/${room.id}/images/${confirmImage.id}`, { method: 'DELETE', body: {} });
      setImages(response.data.images);
      setNotice(response.data.cleanupPending
        ? 'Photo removed. ImageKit cleanup is queued and will be retried.'
        : 'Photo deleted.');
      setConfirmImage(null);
    } catch (failure) {
      setConfirmError(failure.message);
    } finally {
      setBusyImageId('');
    }
  }

  return (
    <section className="admin-room-images" aria-labelledby="room-images-heading">
      <h2 id="room-images-heading">Room photos</h2>
      <p className="admin-field-hint">Upload verified room photographs. JPEG, PNG, and WebP; maximum 5 MB each and five photos per room.</p>
      <p className="admin-image-count" aria-live="polite">{images.length} / {MAX_IMAGES} photos</p>
      {loading && <p className="admin-field-hint" role="status">Loading room photos…</p>}
      {!loading && images.length === 0 && <p className="admin-field-hint">No room photos have been uploaded.</p>}
      {images.length > 0 && (
        <ul className="admin-image-grid" aria-label={`${room.name} photos`}>
          {images.map((image) => (
            <li className="admin-image-card" key={image.id}>
              <div className="admin-image-preview">
                {image.url && !failedImages.includes(image.id)
                  ? <img src={image.url} alt={image.alt || `${room.name} room photo`} loading="lazy" onError={() => setFailedImages((previous) => [...previous, image.id])} />
                  : <><ImageOff aria-hidden="true" /><span className="sr-only">Photo currently unavailable</span></>}
              </div>
              <div className="admin-image-card-content">
                <p className="admin-image-alt">{image.alt || 'No alternative text provided'}</p>
                {image.isMain && <span className="admin-image-main"><Star size={14} aria-hidden="true" /> Main photo</span>}
                <div className="admin-image-actions">
                  <button type="button" className="button button-outline" disabled={room.isArchived || loading || loadError || image.isMain || Boolean(busyImageId)} onClick={() => setMain(image)}>
                    {busyImageId === image.id ? 'Saving…' : 'Set as main'}
                  </button>
                  <button type="button" className="button button-outline" aria-label={`Delete photo for ${room.name}`} disabled={room.isArchived || loading || loadError || !image.fileId || Boolean(busyImageId)} onClick={() => { setConfirmImage(image); setConfirmError(''); }}>
                    <Trash2 size={16} aria-hidden="true" /> Delete
                  </button>
                </div>
                {!image.fileId && <p className="admin-field-hint">Legacy photo: upload it again to manage its file.</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {room.isArchived && <p className="admin-field-hint">Restore this room before changing its photos.</p>}
      {!room.isArchived && !loadError && images.length < MAX_IMAGES && (
        <div className="admin-image-upload">
          <label htmlFor={`room-images-${room.id}`}>Select room photos</label>
          <input
            ref={inputRef}
            id={`room-images-${room.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading || loading}
            onChange={chooseFiles}
          />
          <p className="admin-field-hint">You can select up to {MAX_IMAGES - images.length} more.</p>
          {selectedFiles.length > 0 && (
            <div className="admin-image-selection">
              {selectedFiles.map(({ file, alt, preview }, index) => (
                <div className="admin-image-selected" key={`${file.name}-${file.lastModified}-${index}`}>
                  <img src={preview} alt="" />
                  <div>
                    <p>{file.name}</p>
                    <label htmlFor={`room-image-alt-${room.id}-${index}`}>Alternative text (optional)</label>
                    <input
                      id={`room-image-alt-${room.id}-${index}`}
                      type="text"
                      maxLength={300}
                      value={alt}
                      disabled={uploading}
                      onChange={(event) => updateAlt(index, event.target.value)}
                    />
                  </div>
                </div>
              ))}
              <button className="button button-primary" type="button" disabled={uploading} onClick={uploadImages}>
                <Upload size={16} aria-hidden="true" /> {uploading ? 'Uploading photos…' : `Upload ${selectedFiles.length} photo${selectedFiles.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      {loadError && <button className="button button-outline mt-3" type="button" onClick={retryLoad}>Retry loading photos</button>}
      {notice && <p className="admin-image-success" role="status">{notice}</p>}
      {confirmImage && (
        <ConfirmDialog
          title="Delete this room photo?"
          confirmLabel="Delete photo"
          onCancel={() => setConfirmImage(null)}
          onConfirm={deleteImage}
          busy={Boolean(busyImageId)}
          error={confirmError}
        >
          <p>This photo will be removed from the room and its ImageKit asset will be deleted.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
