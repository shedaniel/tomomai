"use client";

const pad = (value: number) => String(value).padStart(2, "0");

/** "2027/04/01 17:53" in the viewer's own time zone, as DX NET prints play times. */
export function NetPlayTime({ at, dateOnly = false }: { at: Date | string; dateOnly?: boolean }) {
  const date = new Date(at);
  const day = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  return (
    // The server renders in its own time zone, the browser corrects it on hydration.
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {dateOnly ? day : `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`}
    </time>
  );
}
