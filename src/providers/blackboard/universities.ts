type BlackboardUniversity =
  | { readonly name: string; readonly origin: string; readonly samlApId: string }
  // Login propio de Blackboard (usuario y contraseña en el formulario de Learn), sin SSO.
  | { readonly name: string; readonly origin: string; readonly nativeLogin: true };

export const BLACKBOARD_UNIVERSITIES = {
  'upc-pe': { name: 'UPC', origin: 'https://aulavirtual.upc.edu.pe', samlApId: '_4893_1' },
  'upn-pe': { name: 'UPN', origin: 'https://upn.blackboard.com', samlApId: '_111_1' },
  'ulima-pe': { name: 'Universidad de Lima', origin: 'https://ulima.blackboard.com', nativeLogin: true },
} as const satisfies Record<string, BlackboardUniversity>;

export type BlackboardUniversityId = keyof typeof BLACKBOARD_UNIVERSITIES;

/** Legacy sessions belong to UPC. Unknown universities must never fall back. */
export function blackboardUniversity(id: string = 'upc-pe'): BlackboardUniversity {
  if (!Object.hasOwn(BLACKBOARD_UNIVERSITIES, id)) {
    throw new Error(`Unsupported Blackboard university: ${id}`);
  }
  return BLACKBOARD_UNIVERSITIES[id as BlackboardUniversityId];
}

export function blackboardLoginUrl(id?: string): string {
  const university = blackboardUniversity(id);
  if ('nativeLogin' in university) return new URL('/webapps/login/', university.origin).href;
  const { origin, samlApId } = university;
  return `${origin}/auth-saml/saml/login?apId=${samlApId}&redirectUrl=${encodeURIComponent(`${origin}/ultra`)}`;
}
