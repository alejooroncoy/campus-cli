// Retry only when the API explicitly confirms the failed AI request was
// released. A lost connection can have an unknown outcome and is not proof
// that repeating it is free of a second quota charge.
export function questionFailure(message: string, code?: string): Error & { campusRetryable: boolean } {
  return Object.assign(new Error(message), { campusRetryable: code === 'AI_FAILED' });
}
export function canRetryQuestion(error: unknown): boolean {
  return error instanceof Error && (error as Error & { campusRetryable?: boolean }).campusRetryable === true;
}
