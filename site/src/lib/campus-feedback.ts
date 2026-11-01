import feedback from '../html/partials/campus-feedback.html?raw';

/** Keep the two landing pages and their Markdown twins on the same quotes. */
export function includeCampusFeedback(html: string): string {
  return html.replace('<!-- campus-feedback -->', feedback);
}
