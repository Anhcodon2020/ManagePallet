import React, { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import {
  extractDriveFileIdFromUrl,
  fetchDriveImageBlobUrl,
} from '../services/googleWorkspace';

interface DrivePhotoProps {
  accessToken: string | null;
  driveFileId?: string;
  imageUrl?: string;
  alt: string;
  className?: string;
  compact?: boolean;
}

export const DrivePhoto: React.FC<DrivePhotoProps> = ({
  accessToken,
  driveFileId,
  imageUrl,
  alt,
  className = 'h-full w-full object-cover',
  compact = false,
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const resolvedFileId = driveFileId || extractDriveFileIdFromUrl(imageUrl) || '';

  useEffect(() => {
    let active = true;
    setFailed(false);

    if (resolvedFileId && accessToken) {
      setLoading(true);
      fetchDriveImageBlobUrl(accessToken, resolvedFileId).then((blobUrl) => {
        if (!active) return;
        setLoading(false);
        if (blobUrl) {
          setSrc(blobUrl);
        } else {
          setSrc(null);
          setFailed(true);
        }
      });
    } else if (imageUrl && /^https?:\/\//i.test(imageUrl) && !imageUrl.includes('drive.google.com/file/d/')) {
      setSrc(imageUrl);
      setLoading(false);
    } else {
      setSrc(null);
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [accessToken, resolvedFileId, imageUrl]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
        <Loader2 className={compact ? 'h-4 w-4 animate-spin' : 'h-6 w-6 animate-spin'} />
      </div>
    );
  }

  if (!src || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400">
        <ImageOff className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
        {!compact && <span className="text-xs font-medium text-slate-500">Không có ảnh minh họa</span>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
