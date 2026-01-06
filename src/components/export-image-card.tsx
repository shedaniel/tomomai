"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/lib/image-spec";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

interface ImagePanelProps {
  imageUrl: string;
  imageKey: number;
  isLoading: boolean;
  isDownloading: boolean;
  title: string;
  fileName: string;
  onRefresh: () => void;
  onLoad: () => void;
}

function ImagePanel({
  imageUrl,
  imageKey,
  isLoading,
  isDownloading,
  title,
  fileName,
  onRefresh,
  onLoad,
}: ImagePanelProps) {
  const [downloading, setDownloading] = useState(false);

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
    <div className="flex flex-col items-center space-y-4 flex-1 min-w-0">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={handleDownload} disabled={downloading || isLoading} size="sm" className="flex items-center gap-2">
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
      </div>
      <div
        className="border rounded-xl overflow-hidden shadow-sm w-full relative"
        style={{
          aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
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
          alt={title}
          onLoad={onLoad}
          className={isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-600'}
          style={{
            width: '100%',
            height: 'auto',
          }}
        />
      </div>
    </div>
  );
}

interface ExportImageCardProps {
  selectedSnapshotData: SnapshotWithSongs;
  region: Region;
}

export function ExportImageCard({ selectedSnapshotData, region }: ExportImageCardProps) {
  const t = useTranslations();

  // Export image state
  const [exportImageUrl, setExportImageUrl] = useState<string>(
    `/api/export-image?snapshotId=${selectedSnapshotData.snapshot.id}`
  );
  const [exportImageKey, setExportImageKey] = useState(0);
  const [exportIsLoading, setExportIsLoading] = useState(true);

  // Last credit image state
  const [lastCreditImageUrl, setLastCreditImageUrl] = useState<string>(
    `/api/last-credit?region=${region}`
  );
  const [lastCreditImageKey, setLastCreditImageKey] = useState(0);
  const [lastCreditIsLoading, setLastCreditIsLoading] = useState(true);

  const handleExportRefresh = () => {
    setExportIsLoading(true);
    setExportImageKey(prev => prev + 1);
    setExportImageUrl(`/api/export-image?snapshotId=${selectedSnapshotData.snapshot.id}&t=${Date.now()}`);
  };

  const handleLastCreditRefresh = () => {
    setLastCreditIsLoading(true);
    setLastCreditImageKey(prev => prev + 1);
    setLastCreditImageUrl(`/api/last-credit?region=${region}&t=${Date.now()}`);
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
        <div className="flex flex-col lg:flex-row gap-6">
          <ImagePanel
            imageUrl={exportImageUrl}
            imageKey={exportImageKey}
            isLoading={exportIsLoading}
            isDownloading={false}
            title="Profile Image"
            fileName={`maimai-profile-${selectedSnapshotData.snapshot.displayName || 'export'}.png`}
            onRefresh={handleExportRefresh}
            onLoad={() => setExportIsLoading(false)}
          />
          <ImagePanel
            imageUrl={lastCreditImageUrl}
            imageKey={lastCreditImageKey}
            isLoading={lastCreditIsLoading}
            isDownloading={false}
            title="Last Credit"
            fileName={`maimai-last-credit-${selectedSnapshotData.snapshot.displayName || 'export'}.png`}
            onRefresh={handleLastCreditRefresh}
            onLoad={() => setLastCreditIsLoading(false)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
