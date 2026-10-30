#!/usr/bin/env python3
"""Genera dos .docx de prueba de formato: uno con defectos conocidos y uno correcto (control).

El comprobador (apa7-check-format.py) lee las propiedades reales del documento, resolviendo
estilos, para decidir si una IA detectó y corrigió el formato sin tocar el contenido.
"""
import argparse
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

DEFAULT_OUT = Path(__file__).resolve().parents[1] / 'output' / 'prueba-formato'

TITLE = 'Uso de tableros de aprendizaje en cursos virtuales de ingeniería'
PARAS = [
    'Los cursos virtuales han ampliado el acceso a la educación superior, pero también han generado nuevas dudas sobre cómo organizar el trabajo de las personas que estudian. Esta revisión describe qué se sabe del uso de tableros de aprendizaje en cursos de ingeniería.',
    'Según Torres (2021), los tableros permiten que cada estudiante vea su avance semanal y compare su ritmo con el del grupo. Otros trabajos coinciden en que la visualización frecuente mejora la planificación del tiempo (Álvarez, 2019; Torres, 2021).',
    'Sin embargo, los resultados no son uniformes. Algunos equipos docentes informan que los tableros aumentan la ansiedad cuando las comparaciones son públicas, por lo que se recomienda dejar que cada persona decida qué información comparte.',
    'En cuanto a la evidencia disponible, la mayoría de los estudios son de corta duración y provienen de una sola universidad, lo que limita la generalización de sus conclusiones hacia otros contextos (Zegarra & Paz, 2020).',
]
QUOTE = ('La retroalimentación oportuna y específica no solo corrige errores, sino que orienta a quien aprende hacia estrategias '
         'más eficaces de estudio, de modo que su efecto se mantiene incluso cuando la persona ya no recibe comentarios del docente, durante todo el semestre académico y también en los cursos posteriores.')
H1 = 'Marco teórico'
H2 = 'Tableros y planificación'
AFTER_Q = 'Estas ideas permiten plantear que el diseño del tablero importa tanto como la frecuencia con que se consulta, y que conviene evaluar ambos aspectos por separado.'
REFS = [  # orden alfabético correcto
    'Álvarez, C. (2019). *Visualización del avance y planificación del estudio*. Pearson.',
    'Torres, J. (2021). Tableros de aprendizaje en cursos virtuales. *Revista de Educación Superior, 12*(3), 45–58. https://doi.org/10.1000/res.2021.123',
    'Zegarra, M., & Paz, L. (2020). *Gestión educativa en entornos digitales*. Alfa.',
]


def runs(paragraph, text, font, size, italic_marks=True):
    """Escribe texto con *cursivas* marcadas y fuente explícita."""
    parts = text.split('*')
    for i, part in enumerate(parts):
        if not part:
            continue
        run = paragraph.add_run(part)
        run.italic = bool(i % 2) and italic_marks
        run.font.name = font
        run._element.rPr.rFonts.set(qn('w:eastAsia'), font)
        run.font.size = Pt(size)


def fmt(paragraph, *, spacing, after=0, before=0, first=None, left=None, hanging=None, align=WD_ALIGN_PARAGRAPH.LEFT):
    pf = paragraph.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = spacing
    pf.space_after = Pt(after)
    pf.space_before = Pt(before)
    pf.alignment = align
    pf.first_line_indent = Cm(first) if first is not None else None
    if hanging is not None:
        pf.left_indent = Cm(hanging)
        pf.first_line_indent = Cm(-hanging)
    elif left is not None:
        pf.left_indent = Cm(left)


def page_field(paragraph):
    for kind, text in (('begin', None), (None, 'PAGE'), ('end', None)):
        run = paragraph.add_run()
        if kind:
            el = OxmlElement('w:fldChar')
            el.set(qn('w:fldCharType'), kind)
        else:
            el = OxmlElement('w:instrText')
            el.set(qn('xml:space'), 'preserve')
            el.text = text
        run._r.append(el)


def build(path, *, good):
    doc = Document()
    sec = doc.sections[0]
    margins = (2.54, 2.54, 2.54, 2.54) if good else (2.0, 2.0, 3.0, 3.0)  # sup, inf, izq, der
    sec.top_margin, sec.bottom_margin, sec.left_margin, sec.right_margin = (Cm(m) for m in margins)
    font, size = 'Times New Roman', 12
    body = dict(spacing=2.0, first=1.27) if good else dict(spacing=1.0, after=10, first=0, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
    # número de página
    if good:
        p = sec.header.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        p = sec.footer.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    page_field(p)

    title = doc.add_paragraph()
    runs(title, TITLE, font, size)
    title.runs[0].bold = True
    fmt(title, spacing=2.0 if good else 1.0, align=WD_ALIGN_PARAGRAPH.CENTER)

    for i, text in enumerate(PARAS[:2]):
        p = doc.add_paragraph()
        f, s = (font, size)
        if not good and i == 1:
            f, s = 'Arial', 10
        runs(p, text, f, s)
        fmt(p, **body)

    h1 = doc.add_paragraph()
    runs(h1, H1, font, size)
    h1.runs[0].bold = good
    fmt(h1, spacing=2.0 if good else 1.0, align=WD_ALIGN_PARAGRAPH.CENTER if good else WD_ALIGN_PARAGRAPH.LEFT)

    h2 = doc.add_paragraph()
    runs(h2, H2, font, size)
    h2.runs[0].bold = True
    fmt(h2, spacing=2.0 if good else 1.0)

    intro = doc.add_paragraph()
    runs(intro, PARAS[2], font, size)
    fmt(intro, **body)

    q = doc.add_paragraph()
    runs(q, f'{QUOTE} (Torres, 2021, p. 15)' if good else f'“{QUOTE}” (Torres, 2021, p. 15)', font, size)
    if good:
        fmt(q, spacing=2.0, left=1.27)
    else:
        fmt(q, spacing=1.0, after=10, first=0, align=WD_ALIGN_PARAGRAPH.JUSTIFY)

    for i, text in enumerate([PARAS[3], AFTER_Q]):
        p = doc.add_paragraph()
        f, s = (font, size)
        if not good and i == 0:
            f, s = 'Calibri', 14
        runs(p, text, f, s)
        fmt(p, **body)

    if good:
        doc.paragraphs[-1].add_run().add_break(WD_BREAK.PAGE)
    ref_title = doc.add_paragraph()
    runs(ref_title, 'Referencias' if good else 'Bibliografía', font, size)
    ref_title.runs[0].bold = good
    fmt(ref_title, spacing=2.0 if good else 1.0, align=WD_ALIGN_PARAGRAPH.CENTER if good else WD_ALIGN_PARAGRAPH.LEFT)
    entries = REFS if good else [REFS[2], REFS[0], REFS[1]]  # defecto: fuera de orden alfabético
    for text in entries:
        p = doc.add_paragraph()
        runs(p, text, font, size)
        if good:
            fmt(p, spacing=2.0, hanging=1.27)
        else:
            fmt(p, spacing=1.0, after=6)
    doc.save(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help='carpeta de salida (por defecto output/prueba-formato)')
    args = parser.parse_args()
    (args.out / 'entrada').mkdir(parents=True, exist_ok=True)
    build(args.out / 'entrada/trabajo-con-defectos.docx', good=False)
    build(args.out / 'entrada/trabajo-correcto.docx', good=True)
    print('Generados en', args.out / 'entrada')
