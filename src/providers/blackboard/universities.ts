export const BLACKBOARD_UNIVERSITIES = {
  'upc-pe': { name: 'UPC', origin: 'https://aulavirtual.upc.edu.pe', samlApId: '_4893_1' },
  'upn-pe': { name: 'UPN', origin: 'https://upn.blackboard.com', samlApId: '_111_1' },
} as const;

export type BlackboardUniversityId = keyof typeof BLACKBOARD_UNIVERSITIES;

/** Legacy sessions belong to UPC. Unknown universities must never fall back. */
export function blackboardUniversity(id: string = 'upc-pe') {
  if (!Object.hasOwn(BLACKBOARD_UNIVERSITIES, id)) {
    throw new Error(`Unsupported Blackboard university: ${id}`);
  }
  return BLACKBOARD_UNIVERSITIES[id as BlackboardUniversityId];
}

export function blackboardLoginUrl(id?: string): string {
  const { origin, samlApId } = blackboardUniversity(id);
  return `${origin}/auth-saml/saml/login?apId=${samlApId}&redirectUrl=${encodeURIComponent(`${origin}/ultra`)}`;
}
