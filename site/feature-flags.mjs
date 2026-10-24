// Build-time switch. Disabled unless explicitly enabled in the build environment.
export const turnitinServiceEnabled = process.env.CAMPUS_TURNITIN_SERVICE_ENABLED === 'true';

/** @param {string} html */
export function publicHomeHtml(html) {
  html = libraryServiceEnabled ? html : html.replace(/<!-- library:start -->[\s\S]*?<!-- library:end -->/g, '');
  return turnitinServiceEnabled ? html : html.replace(/<!-- turnitin:start -->[\s\S]*?<!-- turnitin:end -->/g, '');
}

export const libraryServiceEnabled = process.env.CAMPUS_LIBRARY_ENABLED === "true";
