import {renderCharacterName} from './src/lib/character.mjs';

// Build-time switch. Disabled unless explicitly enabled in the build environment.
export const turnitinServiceEnabled = process.env.CAMPUS_TURNITIN_SERVICE_ENABLED === 'true';

/** @param {string} html */
export function publicHomeHtml(html) {
  html = renderCharacterName(html);
  html = libraryServiceEnabled ? html : html.replace(/<!-- library:start -->[\s\S]*?<!-- library:end -->/g, '');
  return turnitinServiceEnabled ? html : html.replace(/<!-- turnitin:start -->[\s\S]*?<!-- turnitin:end -->/g, '');
}

export const libraryServiceEnabled = process.env.CAMPUS_LIBRARY_ENABLED === "true";

// Mis clases (grabación de clases presenciales). Apagado salvo que el build lo pida: en beta cerrada
// la página existe en /app/clases/ pero no aparece en la navegación.
export const classRecordingsEnabled = process.env.CAMPUS_CLASSES_WEB_ENABLED === 'true';

// Campito: la primera clase gratis se anuncia solo cuando el servidor ya la da. Mientras tanto,
// la página dice que viene con Campus Plus.
export const campitoTrialEnabled = process.env.CAMPUS_CAMPITO_TRIAL_ENABLED === 'true';

/** @param {string} html */
export function campitoPageHtml(html) {
  html = renderCharacterName(html);
  return campitoTrialEnabled
    ? html.replace(/<!-- plus:start -->[\s\S]*?<!-- plus:end -->/g, '')
    : html.replace(/<!-- trial:start -->[\s\S]*?<!-- trial:end -->/g, '');
}
