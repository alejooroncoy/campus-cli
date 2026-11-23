import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * One Markdown file per guide, and everything else is derived from it: the
 * page, its Markdown twin for assistants, the blog index, the sitemap.
 *
 * Written down as a schema so a missing description or a malformed date fails
 * the build instead of shipping a page Google cannot summarise.
 */
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    /** The h1, written for the reader. */
    title: z.string(),
    /** The <title>, written for the results page. Falls back to the h1. */
    seoTitle: z.string().optional(),
    /** Social title, when sharing should read differently from the h1. */
    ogTitle: z.string().optional(),
    // Shown in search results, so it has to stand alone without the title.
    description: z.string().min(70).max(180),
    published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Grouping shown on the hub, e.g. "Guía · Estudiantes UPC". */
    tag: z.string(),
    section: z.enum(["fundador", "empieza", "comparativa", "tutorial"]),
    readingMinutes: z.number().int().positive(),
    summary: z.array(z.string()).min(2).optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    /**
     * The before and after of the task the guide is about.
     *
     * Data rather than markup inside the body, for the same reason the summary
     * is: the page draws it as a comparison, the Markdown twin writes it out as
     * sentences. Written as html it would render once and reach assistants as a
     * pile of tags.
     */
    /**
     * Who signs the piece, when it is not the team.
     *
     * A first-person account signed "el equipo de Campus" reads as borrowed,
     * and the whole value of a case study is that someone lived it.
     */
    author: z.string().optional(),
    compare: z
      .object({
        /** Defaults to the weekly framing the first guide needed. */
        caption: z.string().optional(),
        before: z.object({
          title: z.string(),
          /** Each fragment the student has to visit, in order. */
          items: z.array(z.string()).min(2),
          cost: z.string(),
        }),
        after: z.object({
          title: z.string(),
          question: z.string(),
          answer: z.string(),
          cost: z.string(),
        }),
      })
      .optional(),
    /**
     * A one-click shortcut shown right under the summary, for guides whose
     * whole point is an action the reader can start from a link (a connector
     * form that arrives pre-filled, for example). Data rather than a button
     * in the body so the Markdown twin gets a plain link, not markup.
     */
    quickAction: z
      .object({
        label: z.string(),
        href: z.string().url(),
        note: z.string().optional(),
      })
      .optional(),
    howTo: z
      .object({
        name: z.string(),
        totalTime: z.string().optional(),
        steps: z.array(z.object({ name: z.string(), text: z.string() })),
      })
      .optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
