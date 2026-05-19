import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

const GUIDES_DIR = path.join(process.cwd(), "content/developer/guides");

export interface GuideMeta {
  slug: string;
  title: string;
  description?: string;
  order?: number;
}

export interface Guide extends GuideMeta {
  content: string;
}

export async function listGuides(): Promise<GuideMeta[]> {
  const files = await safeReadDir(GUIDES_DIR);
  const guides: GuideMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".mdx") && !f.endsWith(".md")) continue;
    const slug = f.replace(/\.(mdx?|md)$/, "");
    const raw = await fs.readFile(path.join(GUIDES_DIR, f), "utf8");
    const { data } = matter(raw);
    guides.push({
      slug,
      title: typeof data.title === "string" ? data.title : slug,
      description: typeof data.description === "string" ? data.description : undefined,
      order: typeof data.order === "number" ? data.order : 999,
    });
  }
  guides.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return guides;
}

export async function readGuide(slug: string): Promise<Guide | null> {
  for (const ext of [".mdx", ".md"] as const) {
    try {
      const raw = await fs.readFile(path.join(GUIDES_DIR, `${slug}${ext}`), "utf8");
      const { data, content } = matter(raw);
      return {
        slug,
        title: typeof data.title === "string" ? data.title : slug,
        description: typeof data.description === "string" ? data.description : undefined,
        order: typeof data.order === "number" ? data.order : 999,
        content,
      };
    } catch {
      // try next extension
    }
  }
  return null;
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}
