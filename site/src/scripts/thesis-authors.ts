/** Formats names already supplied as “Apellido, iniciales”, separated by semicolons. */
export function formatThesisAuthors(input: string): string | null {
  const authors = input.split(';').map(author => author.trim());
  if (authors.some(author => !author)) return null;
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return authors.join(', & ');
  if (authors.length <= 20) return `${authors.slice(0, -1).join(', ')}, & ${authors[authors.length - 1]}`;
  return `${authors.slice(0, 19).join(', ')}, … ${authors[authors.length - 1]}`;
}
