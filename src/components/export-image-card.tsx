"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/lib/image-spec";
import { SnapshotWithSongs } from "@/lib/types";
import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

interface ExportImageCardProps {
  selectedSnapshotData: SnapshotWithSongs;
}

export function ExportImageCard({ selectedSnapshotData }: ExportImageCardProps) {
  const t = useTranslations();
  const [imageUrl, setImageUrl] = useState<string>(`/api/export-image?snapshotId=${selectedSnapshotData.snapshot.id}`);
  const [imageKey, setImageKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);

      // Fetch the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      // Get the image blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `maimai-profile-${selectedSnapshotData.snapshot.displayName || 'export'}.png`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('Failed to download image. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRefresh = () => {
    // Force image reload by changing the key
    setIsLoading(true);
    setImageKey(prev => prev + 1);
    setImageUrl(`/api/export-image?snapshotId=${selectedSnapshotData.snapshot.id}&t=${Date.now()}`);
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  return (
    <Card className="w-full mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t('dataContent.tabs.exportImage')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={handleDownload} disabled={isDownloading} className="flex items-center gap-2">
              {isDownloading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download
            </Button>
            <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div
            ref={containerRef}
            className="border rounded-xl overflow-hidden shadow-sm w-full relative"
            style={{
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
            }}
          >
            {isLoading && (
              <div className="absolute inset-0 bg-muted animate-pulse">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent animate-shimmer" 
                     style={{
                       backgroundSize: '200% 100%',
                       animation: 'shimmer 5s infinite',
                     }} 
                />
              </div>
            )}
            <img
              key={imageKey + selectedSnapshotData.snapshot.id}
              src={imageUrl}
              alt="Maimai Profile"
              onLoad={handleImageLoad}
              className={isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-600'}
              style={{
                width: '100%',
                height: 'auto',
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 