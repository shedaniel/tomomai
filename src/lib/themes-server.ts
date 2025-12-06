import { cookies } from 'next/headers';
import { DEFAULT_THEME_ID } from './themes';

export async function getServerThemeId(): Promise<string> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('tomomai-theme')?.value ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}
