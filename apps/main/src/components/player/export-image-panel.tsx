"use client";

import { Button } from "@tomomai/ui";
import { usePresentation } from "@/components/providers/game-provider";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export interface ImagePanelProps {
  imageUrl: string;
  imageKey: number;
  isLoading: boolean;
  fileName: string;
  onRefresh: () => void;
  onRefreshFast?: () => void;
  onRefreshProfile?: () => void;
  onLoad: () => void;
}

export function ImagePanel({
  imageUrl,
  imageKey,
  isLoading,
  fileName,
  onRefresh,
  onRefreshFast,
  onRefreshProfile,
  onLoad,
}: ImagePanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isDev = process.env.NODE_ENV === 'development';
  const { imageSize } = usePresentation();

  const ratio = naturalRatio ?? imageSize.width / imageSize.height;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalRatio(img.naturalWidth / img.naturalHeight);
    }
    onLoad();
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('Failed to download image. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 w-full min-w-0 mx-auto">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={handleDownload} disabled={hydrated && (downloading || isLoading)} size="sm" className="flex items-center gap-2">
          {downloading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </Button>
        <Button onClick={onRefresh} variant="outline" size="sm" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        {isDev && onRefreshFast && (
          <Button onClick={onRefreshFast} variant="outline" size="sm" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh (Fast)
          </Button>
        )}
        {isDev && onRefreshProfile && (
          <Button onClick={onRefreshProfile} variant="outline" size="sm" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Profile
          </Button>
        )}
      </div>
      <div
        className="border rounded-xl overflow-hidden shadow-sm relative"
        style={{
          aspectRatio: ratio,
          width: `min(100%, calc(80vh * ${ratio}))`,
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-muted animate-pulse">
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent animate-shimmer"
              style={{
                backgroundSize: '200% 100%',
                animation: 'shimmer 5s infinite',
              }}
            />
          </div>
        )}
        <img
          key={imageKey}
          src={imageUrl}
          alt={fileName}
          onLoad={handleImageLoad}
          className={isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-600'}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
}
