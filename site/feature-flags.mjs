// Build-time switch. Disabled unless explicitly enabled in the build environment.
export const turnitinServiceEnabled = process.env.CAMPUS_TURNITIN_SERVICE_ENABLED === 'true';

/** @param {string} html */
export function publicHomeHtml(html) {
  return turnitinServiceEnabled ? html : html.replace(/<!-- turnitin:start -->[\s\S]*?<!-- turnitin:end -->/g, '');
}
