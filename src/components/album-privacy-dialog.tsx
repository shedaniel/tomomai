"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnimatedDialogContent } from "@/components/ui/animated-dialog";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

interface AlbumPrivacyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPreference: (fetchUseAlbums: boolean) => void;
  isPending?: boolean;
}

export function AlbumPrivacyDialog({
  open,
  onOpenChange,
  onSelectPreference,
  isPending = false,
}: AlbumPrivacyDialogProps) {
  const t = useTranslations('settings');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatedDialogContent className="sm:max-w-[550px] max-h-[95dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('albumPrivacy.title')}</DialogTitle>
          <DialogDescription>
            {t('albumPrivacy.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2 p-4 bg-muted border border-border rounded-md">
            <Info className="h-5 w-5 text-muted-foreground  mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-3">
              <p className="font-semibold">{t('albumPrivacy.note')}</p>
              <p>{t('albumPrivacy.noteText')}</p>
              <div>
                <p className="font-medium mb-2">{t('albumPrivacy.privacy')}</p>
                <ul className="list-disc list-inside ml-1 space-y-1.5">
                  <li>{t('albumPrivacy.stored')}</li>
                  <li>{t('albumPrivacy.notShared')}</li>
                  <li>{t('albumPrivacy.onlyYou')}</li>
                  <li>{t('albumPrivacy.limit')}</li>
                  <li>{t('albumPrivacy.autoDelete')}</li>
                </ul>
              </div>
              <p className="text-xs pt-2 border-t border-border">
                {t('albumPrivacy.changeLater')}
              </p>
            </div>
          </div>
          <div className="px-4 py-2 space-y-2">
            <Image
              src="/res/explanation/album-privacy-dialog.png"
              alt="Album Image Example"
              width={1048}
              height={588}
              className="rounded-sm"
            />
            <span className="text-sm w-full flex justify-center">
              {t('albumPrivacy.example')}
            </span>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onSelectPreference(false)}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {t('albumPrivacy.dontSave')}
          </Button>
          <Button
            onClick={() => onSelectPreference(true)}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {t('albumPrivacy.save')}
          </Button>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
