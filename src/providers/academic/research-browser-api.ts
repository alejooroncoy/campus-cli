/** Explicit host adapter API. Hosts must isolate readers by authenticated owner,
 * enforce resource limits and obtain human approval before Browserbase use.
 * Importing this module does not register tools, open browsers or read secrets. */
export { automaticResearchBrowser, browserRecoveryEligible } from './research-browserbase.js';
export { ResearchBrowserReading, MAX_BROWSER_PDF_BYTES } from './research-browser-reading.js';
export type { BrowserReadingOpen, BrowserReadingHandle } from './research-browser-reading.js';
export { readResearchPdfBytes } from './research-pdf.js';
