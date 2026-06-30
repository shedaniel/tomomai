import { get } from '@vercel/edge-config';
import { redirect } from '@/i18n/navigation';
import { Wrench } from 'lucide-react';
import { getThemeOrDefault, getThemeStyleProperties } from '@/lib/themes';
import { MaintenanceThemeForcer } from './theme-forcer';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Maintenance - tomomai ともマイ',
};

// gray-pink theme: hue=0, contrast=0.9, darkness=0.7, lightness=2.5, saturation=0.7, dark=true
const theme = getThemeOrDefault('gray-pink');
const themeStyle = getThemeStyleProperties(theme);

export default async function MaintenancePage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const maintenanceMode = await get<string>('maintenanceMode');

    if (!maintenanceMode) {
    redirect({ href: '/', locale });
    return null;
  }

  return (
    <div className="dark flex min-h-dvh items-center justify-center p-6 bg-background text-foreground" style={themeStyle}>
      <MaintenanceThemeForcer />
      <div className="max-w-lg w-full space-y-6">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-muted p-3 shrink-0">
            <Wrench className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Under Maintenance</h1>
        </div>
        <hr className="border-border" />
        <p className="text-muted-foreground text-sm leading-relaxed">
          {maintenanceMode.split(/\\n|\n/).map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
