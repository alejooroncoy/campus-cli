// Shared by the app, public pages and their Markdown/structured-data versions.
export const CHARACTER_NAME = 'Campito';

/** Resolve the character name in shared HTML fragments at build time.
 * @param {string} text
 */
export function renderCharacterName(text) {
  return text.replaceAll('{{CHARACTER_NAME}}', CHARACTER_NAME);
}
