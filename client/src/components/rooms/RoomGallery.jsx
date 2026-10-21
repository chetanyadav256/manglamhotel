import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

function PhotoPlaceholder({ unavailable = false }) {
  return (
    <div className="room-photo-placeholder">
      <ImageOff size={30} strokeWidth={1.3} aria-hidden="true" />
      <span>{unavailable ? 'Photo currently unavailable' : 'Room photographs coming soon'}</span>
    </div>
  );
}

export default function RoomGallery({ images = [], roomName }) {
  const galleryId = useId();
  const [selected, setSelected] = useState(0);
  const [failedSources, setFailedSources] = useState([]);
  const photos = images.filter((image) => typeof image?.src === 'string' && image.src.trim());
  const activeIndex = Math.min(selected, Math.max(photos.length - 1, 0));
  const activePhoto = photos[activeIndex];
  const markFailed = (source) => setFailedSources((sources) => sources.includes(source) ? sources : [...sources, source]);

  return (
    <div className="room-gallery" role="group" aria-label={`${roomName} photographs`}>
      <div id={galleryId} className="room-photo-frame">
        {!activePhoto || failedSources.includes(activePhoto.src) ? (
          <PhotoPlaceholder unavailable={Boolean(activePhoto)} />
        ) : (
          <img
            key={activePhoto.src}
            src={activePhoto.src}
            srcSet={activePhoto.srcSet}
            sizes="(max-width: 768px) 100vw, 800px"
            alt={activePhoto.alt?.trim() || `${roomName} — photo ${activeIndex + 1}`}
            loading="lazy"
            decoding="async"
            onError={() => markFailed(activePhoto.src)}
          />
        )}
      </div>
      {photos.length > 1 && (
        <>
          <div className="room-gallery-controls">
            <button type="button" aria-label={`Previous photo of ${roomName}`} aria-controls={galleryId} onClick={() => setSelected((activeIndex - 1 + photos.length) % photos.length)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <p aria-live="polite" aria-atomic="true">Photo {activeIndex + 1} of {photos.length}</p>
            <button type="button" aria-label={`Next photo of ${roomName}`} aria-controls={galleryId} onClick={() => setSelected((activeIndex + 1) % photos.length)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="room-thumbnails">
            {photos.map((photo, index) => (
              <button
                key={`${photo.src}-${index}`}
                type="button"
                aria-label={`Show photo ${index + 1} of ${roomName}`}
                aria-pressed={index === activeIndex}
                aria-controls={galleryId}
                onClick={() => setSelected(index)}
              >
                {failedSources.includes(photo.src)
                  ? <ImageOff size={18} aria-hidden="true" />
                  : <img src={photo.src} alt="" loading="lazy" decoding="async" onError={() => markFailed(photo.src)} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
