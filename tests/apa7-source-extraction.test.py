"""Reading regressions for real UPC markup. Run with Python + requests/bs4."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'upc_audit', Path(__file__).resolve().parents[1] / 'scripts/apa7-audit-upc.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class SourceExtractionTests(unittest.TestCase):
    def inventory(self, content):
        return audit.inventory_page(
            'https://biblioteca.upc.edu.pe/Documentos_Juridicos/Casacion',
            '<div id="s-lg-guide-main"><div id="s-lg-content-1">'
            + content + '</div></div>')['blocks'][0]['units'][0]

    def test_inline_spans_do_not_create_a_website_typo(self):
        unit = self.inventory('<p>En la <span>C</span><span>asación</span> se indica.</p>')
        self.assertEqual(unit['displayText'], 'En la Casación se indica.')
        self.assertEqual(unit['text'], 'En la C asación se indica.')
        self.assertEqual(unit['sha256'], audit.digest(unit['text']),
                         'Changing the reading aid must not invalidate stored source identities')

    def test_legal_identifier_and_table_cells_remain_distinct(self):
        unit = self.inventory('<table><tr><td>(<span>R</span><span>esolución 12</span>)</td>'
                              '<td>Referencia</td></tr></table>')
        self.assertEqual(unit['displayText'], '(Resolución 12) Referencia')

    def test_existing_spaces_and_paragraph_boundaries_are_preserved(self):
        unit = self.inventory('<table><tr><td><p>Autor <em>título</em>.</p>'
                              '<p>Otra fuente.</p></td></tr></table>')
        self.assertEqual(unit['displayText'], 'Autor título. Otra fuente.')


if __name__ == '__main__':
    unittest.main()
