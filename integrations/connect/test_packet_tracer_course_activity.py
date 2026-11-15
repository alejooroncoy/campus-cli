"""Lectura a pedido de una actividad del curso; no abre un laboratorio real de Cisco."""
import asyncio
import http.server
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest

from jsonschema import Draft202012Validator, ValidationError
from mcp.types import TextContent

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'integrations/connect'))
spec = importlib.util.spec_from_file_location('course_activity', ROOT / 'integrations/connect/plugins/packet-tracer/course_activity.py')
course = importlib.util.module_from_spec(spec)
spec.loader.exec_module(course)
POLICY = {tool['name']: tool for tool in json.loads((ROOT / 'src/cloud/packet-tracer/policy.json').read_text(encoding='utf-8'))['tools']}
TOKEN = 'A' * 43
ACTIVITY = b'PKA bytes of a course activity'


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == f'/d/{TOKEN}':
            self.send_response(200); self.send_header('Content-Length', str(len(ACTIVITY))); self.end_headers()
            self.wfile.write(ACTIVITY)
        elif self.path == f'/d/{"B" * 43}':
            self.send_response(302); self.send_header('Location', 'https://elsewhere.example/x.pka'); self.end_headers()
        elif self.path == f'/d/{"E" * 43}':
            self.send_response(200); self.send_header('Content-Length', '100'); self.end_headers()
            for _ in range(100):
                self.wfile.write(b'x'); self.wfile.flush(); time.sleep(0.05)
        elif self.path == f'/d/{"C" * 43}':
            self.send_response(200); self.end_headers(); self.wfile.write(b'x' * 2048)
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *args):
        pass


class CourseActivityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_address[1]}'
        import urllib.request
        cls.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), course._NoRedirect())

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close()

    def setUp(self):
        self.base = tempfile.TemporaryDirectory()
        self.workspace = Path(self.base.name).resolve()

    def tearDown(self):
        self.base.cleanup()

    def test_only_a_one_use_link_from_the_app_origin_is_accepted(self):
        good = f'{self.origin}/d/{TOKEN}'
        self.assertEqual(course.checked_download_url(good, self.origin), good)
        for url in [f'http://localhost:1/d/{TOKEN}', f'https://127.0.0.1:{self.server.server_address[1]}/d/{TOKEN}',
                    f'{self.origin}/d/{TOKEN}?x=1', f'{self.origin}/d/{TOKEN}#f', f'{self.origin}/d/short',
                    f'{self.origin}/x/d/{TOKEN}', f'{self.origin}/d/{TOKEN}/open', f'{self.origin}/d/../{TOKEN}',
                    self.origin.replace('://', '://user:pw@') + f'/d/{TOKEN}', 'file:///etc/passwd']:
            with self.subTest(url=url), self.assertRaises(course.CourseActivityError):
                course.checked_download_url(url, self.origin)

    def test_download_creates_a_new_file_and_never_overwrites_or_follows_links(self):
        url = f'{self.origin}/d/{TOKEN}'
        (self.workspace / 'Lab 3.pka').write_bytes(b'student work')
        if os.name != 'nt':
            (self.workspace / 'Lab 3 (2).pka').symlink_to(self.workspace / 'outside.pka')
        target = course.download(url, self.workspace, 'Lab 3.pka', self.opener)
        self.assertEqual(target.parent, self.workspace)
        self.assertEqual(target.name, 'Lab 3 (3).pka' if os.name != 'nt' else 'Lab 3 (2).pka')
        self.assertEqual(target.read_bytes(), ACTIVITY)
        self.assertEqual((self.workspace / 'Lab 3.pka').read_bytes(), b'student work')
        self.assertFalse((self.workspace / 'outside.pka').exists())
        for name in ['../escape.pka', 'lab.exe', '.hidden.pka', 'a/b.pka']:
            with self.subTest(name=name), self.assertRaises(course.CourseActivityError):
                course.download(url, self.workspace, name, self.opener)

    def test_failed_downloads_leave_no_partial_file(self):
        cases = {'D' * 43: 'venció o ya se usó', 'B' * 43: 'HTTP 302', 'C' * 43: 'tamaño permitido'}
        for token, message in cases.items():
            with self.subTest(token=token[0]):
                with self.assertRaisesRegex(course.CourseActivityError, message):
                    course.download(f'{self.origin}/d/{token}', self.workspace, 'Lab.pkt', self.opener, max_bytes=1024)
                self.assertEqual(list(self.workspace.iterdir()), [])

    def run_read(self, responses, file_name='Lab 3.pka', token=TOKEN):
        calls = []

        async def call_tool(name, args):
            calls.append((name, args))
            return [TextContent(type='text', text=responses[name])]
        result = asyncio.run(course.read_course_activity(call_tool, {'downloadUrl': f'{self.origin}/d/{token}', 'fileName': file_name},
                                                         self.workspace, self.origin, self.opener))
        return result, calls

    def test_activity_returns_instructions_and_topology_but_no_grading_or_paths(self):
        status = {'activity': True, 'locked': False, 'password_confirmed': True, 'file': str(self.workspace / 'Lab 3.pka'),
                  'instructions': ['Configura la VLAN 10 en SW1.'], 'items': 12, 'correct': 3, 'percent': 25,
                  'points': 40, 'correct_points': 10, 'percent_score': 25, 'completed_feedback': 'Respuesta: VLAN 10 en Fa0/1',
                  'incomplete_feedback': 'Pista secreta', 'dynamic_feedback': 'x', 'note': 'vendor note', 'time_ms': 1000}
        result, calls = self.run_read({
            'pt_activity_open': json.dumps({'opened': str(self.workspace / 'Lab 3.pka'), 'locked': False}),
            'pt_activity_status': json.dumps(status),
            'pt_query_topology': f'DEVICES:1|LINKS:0\n\nSW1 (2960) loaded from {self.workspace}/Lab 3.pka',
        })
        self.assertFalse(result.isError)
        self.assertEqual([name for name, _ in calls], ['pt_activity_open', 'pt_activity_status', 'pt_query_topology'])
        self.assertEqual(Path(calls[0][1]['path']).parent, self.workspace)
        self.assertEqual(calls[0][1], {'path': calls[0][1]['path']}, 'sin contraseña: una protegida queda bloqueada')
        payload = json.loads(result.content[0].text)
        self.assertEqual(payload['instructions'], ['Configura la VLAN 10 en SW1.'])
        self.assertEqual(payload['progress'], {'items': 12, 'correct': 3, 'percent': 25, 'time_ms': 1000})
        self.assertIn('Campus Connect', payload['requires'])
        self.assertTrue(payload['replacedOpenFile'])
        text = result.content[0].text
        for secret in ['Respuesta', 'Pista', 'points', 'feedback', str(self.workspace), 'vendor note']:
            self.assertNotIn(secret, text)
        self.assertIn('Documentos/Campus/PacketTracer', payload['topology'])

    def test_locked_activity_reports_locked_without_reading_more(self):
        result, calls = self.run_read({
            'pt_activity_open': json.dumps({'opened': 'x', 'locked': True}),
            'pt_activity_status': json.dumps({'activity': True, 'locked': True, 'instructions': []}),
        })
        payload = json.loads(result.content[0].text)
        self.assertFalse(result.isError)
        self.assertTrue(payload['locked'])
        self.assertNotIn('topology', payload)
        self.assertNotIn('instructions', payload)
        self.assertEqual([name for name, _ in calls], ['pt_activity_open', 'pt_activity_status'])

    def test_project_uses_open_project_and_open_failures_are_errors_without_paths(self):
        result, calls = self.run_read({
            'pt_open_project': 'Project opened: x (fileOpen returned Ok). Devices on the canvas: 0 before → 4 now.',
            'pt_activity_status': json.dumps({'activity': False}),
            'pt_query_topology': 'DEVICES:2|LINKS:1\n\nR1, SW1',
        }, file_name='Topologia.pkt')
        self.assertFalse(result.isError)
        self.assertEqual(calls[0][0], 'pt_open_project')
        payload = json.loads(result.content[0].text)
        self.assertEqual((payload['format'], payload['activity'], payload['topology']), ('pkt', False, 'DEVICES:2|LINKS:1\n\nR1, SW1'))
        self.assertNotIn('instructions', payload)
        failed, _ = self.run_read({'pt_activity_open': f'Not opened: {self.workspace}/Lab.pka (fileOpen returned Error).'},
                                  file_name='Lab.pka')
        self.assertTrue(failed.isError)
        self.assertNotIn(str(self.workspace), failed.content[0].text)
        self.assertIn('Campus Connect', failed.content[0].text)

    def test_wrong_origin_downloads_nothing_and_calls_no_tool(self):
        calls = []

        async def call_tool(name, args):
            calls.append(name)
        result = asyncio.run(course.read_course_activity(call_tool, {'downloadUrl': f'https://evil.example/d/{TOKEN}', 'fileName': 'Lab.pka'},
                                                         self.workspace, self.origin, self.opener))
        self.assertTrue(result.isError)
        self.assertEqual(calls, [])
        self.assertEqual(list(self.workspace.iterdir()), [])

    def test_system_errors_and_slow_downloads_fail_cleanly_without_paths(self):
        (self.workspace / 'Lab.pka').mkdir()
        os.chmod(self.workspace, 0o500)
        try:
            if os.name != 'nt' and os.geteuid() != 0:
                result, calls = self.run_read({}, file_name='Nuevo.pka')
                self.assertTrue(result.isError)
                self.assertEqual(calls, [])
                self.assertNotIn(str(self.workspace), result.content[0].text)
                self.assertIn('Documentos/Campus/PacketTracer', result.content[0].text)
        finally:
            os.chmod(self.workspace, 0o700)
        with self.assertRaisesRegex(course.CourseActivityError, 'tardó demasiado'):
            course.download(f'{self.origin}/d/{TOKEN}', self.workspace, 'Lento.pka', self.opener, seconds=-1)
        self.assertFalse((self.workspace / 'Lento.pka').exists())
        for name in ['CON.pka', 'nul.pkt', 'COM1.pka', 'lpt9.pka']:
            with self.subTest(name=name), self.assertRaises(course.CourseActivityError):
                course.download(f'{self.origin}/d/{TOKEN}', self.workspace, name, self.opener)

    def test_unexpected_errors_are_sanitized(self):
        async def call_tool(name, args):
            raise RuntimeError(f'boom at {args["path"]}')
        result = asyncio.run(course.read_course_activity(call_tool, {'downloadUrl': f'{self.origin}/d/{TOKEN}', 'fileName': 'Lab.pka'},
                                                         self.workspace, self.origin, self.opener))
        self.assertTrue(result.isError)
        self.assertNotIn(str(self.workspace), result.content[0].text)

    def test_an_activity_without_a_readable_status_is_never_reported_unlocked(self):
        failed, calls = self.run_read({'pt_activity_open': json.dumps({'opened': 'x', 'activity': True, 'locked': False}),
                                       'pt_activity_status': 'A dialog is open: Save changes?'})
        self.assertTrue(failed.isError)
        self.assertNotIn('pt_query_topology', [name for name, _ in calls])
        locked, _ = self.run_read({'pt_activity_open': json.dumps({'opened': 'x', 'activity': True, 'locked': True}),
                                   'pt_activity_status': 'timeout'})
        self.assertTrue(json.loads(locked.content[0].text)['locked'])
        protected, calls = self.run_read({'pt_activity_open': 'The activity is password protected and PT blocks its API'})
        self.assertFalse(protected.isError)
        self.assertTrue(json.loads(protected.content[0].text)['locked'])
        self.assertEqual([name for name, _ in calls], ['pt_activity_open'])
        stale, _ = self.run_read({'pt_activity_open': json.dumps({'opened': 'x', 'locked': True}),
                                  'pt_activity_status': json.dumps({'activity': True, 'locked': False, 'instructions': ['x']})})
        self.assertTrue(json.loads(stale.content[0].text)['locked'], 'el bloqueo informado al abrir prevalece')

    def test_results_fit_the_host_limit_after_ascii_escaping(self):
        page = '漢' * 60_000
        result, _ = self.run_read({
            'pt_activity_open': json.dumps({'opened': 'x', 'locked': False}),
            'pt_activity_status': json.dumps({'activity': True, 'locked': False, 'instructions': [page] * 5}),
            'pt_query_topology': 'DEVICES:1|LINKS:0\n' + '網' * 60_000,
        })
        self.assertLessEqual(len(json.dumps(json.loads(result.content[0].text)).encode()), course.MAX_RESULT_BYTES)
        self.assertTrue(json.loads(result.content[0].text)['instructions'])

    def test_a_failed_topology_read_is_an_error_but_keeps_the_instructions(self):
        status = json.dumps({'activity': True, 'locked': False, 'instructions': ['Configura R1.']})
        for topology in ['Packet Tracer is not connected over any channel.', 'No response from PT (timeout).']:
            result, _ = self.run_read({'pt_activity_open': json.dumps({'opened': 'x', 'locked': False}),
                                       'pt_activity_status': status, 'pt_query_topology': topology})
            payload = json.loads(result.content[0].text)
            self.assertTrue(result.isError)
            self.assertNotIn('topology', payload)
            self.assertIn('not connected' if 'connected' in topology else 'timeout', payload['topologyError'])
            self.assertEqual(payload['instructions'], ['Configura R1.'])

        from mcp.types import CallToolResult
        calls = []

        async def call_tool(name, args):
            calls.append(name)
            if name == 'pt_query_topology':
                return CallToolResult(content=[TextContent(type='text', text='DEVICES:0|LINKS:0')], isError=True)
            return [TextContent(type='text', text={'pt_open_project': 'Project opened: x', 'pt_activity_status': '{"activity": false}'}[name])]
        result = asyncio.run(course.read_course_activity(call_tool, {'downloadUrl': f'{self.origin}/d/{TOKEN}', 'fileName': 'Red.pkt'},
                                                         self.workspace, self.origin, self.opener))
        self.assertTrue(result.isError, 'el isError del upstream se conserva')

    def test_a_trickling_download_stops_at_the_overall_deadline(self):
        started = time.monotonic()
        with self.assertRaisesRegex(course.CourseActivityError, 'tardó demasiado'):
            course.download(f'{self.origin}/d/{"E" * 43}', self.workspace, 'Goteo.pka', self.opener, seconds=0.3)
        self.assertLess(time.monotonic() - started, 2.0)
        self.assertEqual(list(self.workspace.iterdir()), [])

    def test_policy_separates_the_device_schema_from_the_student_request(self):
        tool = POLICY['pt_read_course_activity']
        self.assertEqual((tool['connectOnly'], tool['mutates'], tool['minPackageVersion'], tool['relayPreparation']), (True, True, '0.2.4', 'courseFileLink'))
        self.assertIn('Campus Connect', tool['description'])
        self.assertIn('confirmReplace', tool['description'])
        device = Draft202012Validator(tool['inputSchema'])
        device.validate({'downloadUrl': f'https://mcp.campuscli.com/d/{TOKEN}', 'fileName': 'Lab 3.pka', 'requestDigest': 'a' * 64})
        for args in [{'downloadUrl': f'https://mcp.campuscli.com/d/{TOKEN}', 'fileName': '../x.pka', 'requestDigest': 'a' * 64},
                     {'downloadUrl': f'https://mcp.campuscli.com/d/{TOKEN}', 'fileName': 'x.pka\n', 'requestDigest': 'a' * 64},
                     {'downloadUrl': f'https://mcp.campuscli.com/d/{TOKEN}?q', 'fileName': 'x.pka', 'requestDigest': 'a' * 64},
                     {'downloadUrl': f'https://mcp.campuscli.com/d/{TOKEN}', 'fileName': 'x.pka', 'requestDigest': 'a' * 64, 'path': '/tmp'}]:
            with self.subTest(args=args), self.assertRaises(ValidationError):
                device.validate(args)
        request = Draft202012Validator(tool['requestSchema'])
        request.validate({'courseId': '_1_1', 'contentId': '_2_1', 'fileName': 'Lab 3.pka', 'confirmReplace': True})
        for change in [{'confirmReplace': False}, {'downloadUrl': 'https://x/d/y'}, {'format': 'exe'}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                request.validate({'courseId': '_1_1', 'contentId': '_2_1', 'fileName': 'Lab', 'confirmReplace': True, **change})


if __name__ == '__main__':
    unittest.main()
