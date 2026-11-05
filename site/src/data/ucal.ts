/** Shared public copy for the landing, structured data and Markdown route. */
export const ucal = {
  url: 'https://campuscli.com/ucal/',
  title: 'UPC compró UCAL por US$35 millones | Campus',
  description: 'UPC adquirió UCAL por aproximadamente US$35 millones. Conoce la fecha de integración, qué se sabe para estudiantes y cómo prepararte con Campus.',
  updated: '2026-11-05',
  gestion: 'https://gestion.pe/economia/empresas/upc-adquiere-ucal-por-us35-millones-y-ampliara-su-capacidad-en-lima-noticia/',
  investing: 'https://es.investing.com/news/company-news/filial-peruana-de-laureate-adquiere-ucal-por-35-millones-de-dolares-93CH-3914418',
  release: 'https://finance.yahoo.com/small-business/articles/laureate-education-subsidiary-peru-announces-211500235.html',
};
export const ucalFaq = [
  { q: '¿UPC compró UCAL?', a: 'Sí. Laureate anunció el 5 de noviembre de 2026 la adquisición de UCAL por parte de UPC por aproximadamente US$35 millones. La compra y la integración académica son etapas distintas. Puedes consultar la cobertura y el comunicado de Laureate en las fuentes de esta página.' },
  { q: '¿Cuándo se integra UCAL a UPC?', a: 'El comunicado universitario compartido y la cobertura de Gestión señalan el 16 de febrero de 2027. El comunicado indica que las clases, servicios y actividades académicas continúan con normalidad. Confirma las instrucciones para tu caso por los canales de tu universidad.' },
  { q: '¿Puedo usar Campus si todavía estudio en UCAL?', a: 'Puedes usar las herramientas abiertas de Campus, como la calculadora de promedio y las guías de APA 7, y explorar la información de profesores UPC. Para conectar tu aula con Campus necesitas una cuenta UPC habilitada y compatible. Tu universidad comunicará los pasos para tus accesos durante la integración.' },
  { q: '¿Qué pasará con mis cursos, pensión o beca?', a: 'Las fuentes consultadas y el comunicado compartido no detallan las condiciones individuales de convalidación, pensiones, becas o cambios de malla. Solicita esa información a tu universidad. Campus no decide esas condiciones.' },
  { q: '¿Necesito una cuenta o pagar para empezar?', a: 'Las herramientas abiertas de APA 7 y promedio no requieren una cuenta Campus. Para usar el asistente web debes crear una cuenta; la disponibilidad depende de tu universidad. Puedes consultar los planes vigentes en la portada de Campus.' },
  { q: '¿Campus es parte de UCAL o UPC?', a: 'Campus es un proyecto independiente hecho por estudiantes. No está afiliado a UCAL ni a UPC y no gestiona la integración. Te ayuda con herramientas para estudiar y, con acceso compatible, con consultas de tu aula.' },
];
export const ucalMarkdown = [
  '# UPC adquiere UCAL por US$35 millones\n',
  `Fuente: ${ucal.url}\nActualizado: ${ucal.updated}\n`,
  'Campus reúne opiniones de profesores UPC, herramientas de APA 7 y consultas académicas con acceso compatible. Es un proyecto independiente, no afiliado a UCAL ni a UPC.\n',
  '## Empieza con lo que necesitas\n',
  '- Profesores UPC: https://campuscli.com/profes/',
  '- Formato APA 7: https://campuscli.com/herramientas/formato-apa-7/',
  '- Promedio ponderado: https://campuscli.com/herramientas/promedio-ponderado/',
  '- Blackboard UPC, con cuenta habilitada y compatible: https://campuscli.com/blackboard-upc/',
  '- Todas las herramientas: https://campuscli.com/herramientas/\n',
  '## UCAL y UPC: qué se anunció\n',
  'Laureate anunció el 5 de noviembre de 2026 la adquisición de UCAL por parte de UPC por aproximadamente US$35 millones. La integración está prevista para el 16 de febrero de 2027, según el comunicado universitario compartido y la cobertura de Gestión. Tu universidad comunicará los pasos para tus accesos. La conexión con Campus requiere una cuenta UPC habilitada y compatible.\n',
  `Fuentes: [Gestión](${ucal.gestion}), [Investing.com](${ucal.investing}) y [comunicado de Laureate reproducido en Yahoo Finance](${ucal.release}).\n`,
  '## Preguntas frecuentes\n',
  ...ucalFaq.map(({q,a}) => `### ${q}\n\n${a}\n`),
].join('\n');
