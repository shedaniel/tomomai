# Blog Posts Structure

This directory contains blog posts (changelogs and news) for tomomai, supporting multiple languages.

## File Naming Convention

Posts use the following naming format:

```
{YYYY-MM-DD}-{slug}.{locale}.mdx
```

**Examples:**
- `2026-03-15-new-feature.en.mdx` (English)
- `2026-03-15-new-feature.zh-TW.mdx` (Traditional Chinese - Taiwan)
- `2026-03-15-new-feature.ja.mdx` (Japanese)

## Supported Locales

The following locales are supported:
- `en` - English (default)
- `en-GB` - English (UK)
- `ja` - Japanese
- `zh-TW` - Traditional Chinese (Taiwan)
- `zh-HK` - Traditional Chinese (Hong Kong)
- `zh-CN` - Simplified Chinese
- `ko` - Korean
- `yue` - Cantonese

## Creating a New Post

### Step 1: Create English Version (Required)

Every post **must** have an English version. This serves as the fallback for any locale that doesn't have a translation.

Create a file: `{date}-{slug}.en.mdx`

**Example:** `2026-03-15-new-feature.en.mdx`

### Step 2: Add Frontmatter

Each post requires the following frontmatter fields:

```yaml
---
title: "Post Title"                          # Localized title
date: "2026-03-15"                           # Publication date (YYYY-MM-DD)
version: "2026.3"                            # App version (YYYY.MM format) or "N/A" for non-updates
summary: "Brief summary of the post"         # Localized summary
locale: "en"                                 # Must match filename extension
canonicalSlug: "2026-03-15-new-feature"     # Shared identifier (no locale)
---
```

**Important:**
- `locale` must match the file extension (e.g., `locale: "en"` for `.en.mdx`)
- `canonicalSlug` must be the same across all language versions
- `date` and `version` should be identical across all translations
- `title` and `summary` should be translated for each locale
- `version` can be set to `"N/A"` for posts that are not app updates (e.g., announcements, notices). The version badge will be hidden for these posts.

### Step 3: Write Content

Write your post content in MDX format below the frontmatter:

```mdx
---
title: "New Feature Announcement"
date: "2026-03-15"
version: "2026.3"
summary: "Introducing an awesome new feature!"
locale: "en"
canonicalSlug: "2026-03-15-new-feature"
---

## Heading

Your content goes here. You can use:
- Markdown formatting
- **Bold** and *italic* text
- [Links](https://example.com)
- Lists
- Code blocks
- And more!
```

### Step 4: Create Translations (Optional)

To add translations, create additional files with the same canonical slug but different locale extensions:

**Example:**
```
2026-03-15-new-feature.en.mdx     ← English (required)
2026-03-15-new-feature.zh-TW.mdx  ← Traditional Chinese
2026-03-15-new-feature.ja.mdx     ← Japanese
```

**Important:**
- Translate `title`, `summary`, and all content
- Keep `date`, `version`, and `canonicalSlug` identical
- Update the `locale` field to match the filename

## Fallback Behavior

The post system automatically handles missing translations with intelligent fallback:

### Standard Fallback (Most Locales)
1. **User requests a post in their locale** (e.g., Japanese)
2. **If Japanese version exists**: Show Japanese content
3. **If Japanese version missing**: Automatically fall back to English version
4. **If English version missing**: Post not found (404)

### Special Fallback: Hong Kong Traditional Chinese (zh-HK)
For `zh-HK` users, there's an additional fallback layer:
1. **If zh-HK version exists**: Show Hong Kong Traditional Chinese content
2. **If zh-HK missing but zh-TW exists**: Show Taiwan Traditional Chinese content (no conversion)
3. **If zh-TW also missing**: Fall back to English version
4. **If English version missing**: Post not found (404)

**Rationale**: Traditional Chinese used in Hong Kong and Taiwan are very similar, so no conversion is needed.

### Special Fallback: Simplified Chinese (zh-CN) with OpenCC Conversion
For `zh-CN` users, there's automatic conversion from Traditional to Simplified Chinese:
1. **If zh-CN version exists**: Show Simplified Chinese content
2. **If zh-CN missing but zh-TW exists**: Show Taiwan Traditional Chinese content **automatically converted to Simplified Chinese** using OpenCC
3. **If zh-TW also missing**: Fall back to English version
4. **If English version missing**: Post not found (404)

**How it works**: When a `zh-CN` user requests a post that only has a `zh-TW` version:
- The system reads the `zh-TW` content
- Uses [OpenCC](https://github.com/BYVoid/OpenCC) to convert Traditional Chinese (繁體中文) to Simplified Chinese (简体中文)
- Converts the title, summary, and entire MDX content
- Presents it to the user as if it were a native `zh-CN` post

**Benefits**:
- You only need to maintain **one Chinese version** (`zh-TW`)
- Mainland China users (`zh-CN`) automatically see Simplified Chinese
- Conversion is instant and happens at runtime
- You can still create explicit `zh-CN` versions for posts that need manual localization

This ensures that all users can always read all posts, even if translations aren't complete yet.

## Example: Complete Multi-Language Post

### English: `2026-03-15-rating-calculator.en.mdx`

```mdx
---
title: "New Rating Calculator"
date: "2026-03-15"
version: "2026.3"
summary: "Calculate your target rating with our new tool!"
locale: "en"
canonicalSlug: "2026-03-15-rating-calculator"
---

## What's New?

We've added a new rating calculator to help you plan your improvement journey.

- Predict your rating after specific plays
- Find the best charts to boost your rating
- Track your progress over time

Try it out at `/db/calculator`!
```

### Traditional Chinese: `2026-03-15-rating-calculator.zh-TW.mdx`

```mdx
---
title: "新功能：Rating 計算器"
date: "2026-03-15"
version: "2026.3"
summary: "使用全新工具計算你的目標 Rating！"
locale: "zh-TW"
canonicalSlug: "2026-03-15-rating-calculator"
---

## 新功能介紹

我們新增了 Rating 計算器，幫助你規劃進步路線。

- 預測特定遊玩後的 Rating
- 找出最適合衝分的譜面
- 追蹤進度變化

立即前往 `/db/calculator` 試用！
```

## Best Practices

1. **Always create English version first** - It's the required fallback
2. **Use consistent canonical slugs** - Same date and slug across all languages
3. **Translate titles and summaries** - These appear in lists and search results
4. **Keep dates identical** - Posts should have the same publication date
5. **Test locally** - Run the dev server to preview posts before committing
6. **Check translation completeness** - Use `git status` to see which files exist

## Translation Workflow

1. Write English post (`{slug}.en.mdx`)
2. Commit to repository
3. Translators create localized versions:
   - Copy English file
   - Rename to `{slug}.{locale}.mdx`
   - Update `locale` field
   - Translate `title`, `summary`, and content
   - Commit translation
4. Users automatically see posts in their language

## Language Switcher

When viewing a post, users will see a language dropdown **only if** multiple translations exist for that post. The dropdown shows all available languages and allows instant switching.

## SEO Considerations

The system automatically generates:
- **hreflang tags** for all translations
- **Sitemap entries** with language alternates
- **Proper locale metadata** in OpenGraph tags

This helps search engines index your content correctly for international audiences.

## Need Help?

- Check existing posts for examples
- Ask in the Discord: https://discord.gg/jZqQHr3UDq
- Report issues: https://github.com/your-repo/issues
