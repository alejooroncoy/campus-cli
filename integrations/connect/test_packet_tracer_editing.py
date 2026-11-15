"""Policy and adapter checks; these do not mutate a live Cisco laboratory."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

from jsonschema import Draft202012Validator, ValidationError
from mcp.types import TextContent

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('editing', ROOT / 'integrations/connect/plugins/packet-tracer/editing.py')
editing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(editing)
POLICY = {tool['name']: tool for tool in json.loads((ROOT / 'src/cloud/packet-tracer/policy.json').read_text(encoding='utf-8'))['tools']}


class PacketTracerEditingTests(unittest.TestCase):
    def validate(self, name, args):
        Draft202012Validator(POLICY[name]['inputSchema']).validate(args)

    def test_only_reviewed_ios_forms_and_bounded_batches(self):
        body = ['vlan 10', 'name Ventas', 'exit', 'interface FastEthernet0/2',
                'switchport mode access', 'switchport access vlan 10', 'no shutdown']
        args = {'device': 'SW-HCO-CORE', 'commands': body}
        self.validate('pt_apply_ios_config', args)
        name, vendor = editing.vendor_operation('pt_apply_ios_config', args, Path('/unused'))
        self.assertEqual(name, 'pt_cli')
        self.assertEqual(vendor['commands'], ['enable', 'configure terminal', *body, 'end'])
        self.assertFalse(vendor['auto_confirm'])
        self.assertFalse(vendor['capture'])
        self.assertNotIn('output_dir', vendor)
        for command in ['reload', 'erase startup-config', 'do reload', 'tclsh', 'end',
                        'enable', 'copy running-config https://outside/config',
                        'vlan 10\nreload', 'vlan 10\n', 'vlan 10\r', 'vlan 10; reload']:
            with self.subTest(command=command), self.assertRaises(ValidationError):
                self.validate('pt_apply_ios_config', {'device': 'SW1', 'commands': [command]})
        with self.assertRaises(ValidationError):
            self.validate('pt_apply_ios_config', {'device': 'SW1', 'commands': ['exit'] * 33})
        self.assertNotIn('pt_cli', POLICY)

    def test_read_query_cannot_inject_an_extra_command(self):
        args = {'device': 'SW1', 'section': 'running-config'}
        self.validate('pt_read_device_config', args)
        name, vendor = editing.vendor_operation('pt_read_device_config', args, Path('/unused'))
        self.assertEqual((name, vendor['commands']), ('pt_cli', ['enable', 'show running-config']))
        self.assertEqual(vendor['timeout'], 20.0)
        with self.assertRaises(ValidationError):
            self.validate('pt_read_device_config', {**args, 'section': 'running-config\nreload'})

    def test_activity_save_is_a_new_workspace_copy_and_preserves_errors(self):
        with tempfile.TemporaryDirectory() as base:
            workspace = Path(base).resolve()
            args = {'filename': 'Huanuco_copia.pka'}
            self.validate('pt_save_activity', args)
            name, vendor = editing.vendor_operation('pt_save_activity', args, workspace)
            self.assertEqual(name, 'pt_activity_save')
            self.assertEqual(vendor, {'path': str(workspace / args['filename']), 'overwrite': False})
            result = [TextContent(type='text', text='saved: claimed by vendor')]
            self.assertTrue(editing.checked_result('pt_save_activity', args, result, workspace).isError)
            (workspace / args['filename']).write_bytes(b'example activity')
            self.assertIs(editing.checked_result('pt_save_activity', args, result, workspace), result)
            with self.assertRaises(ValueError):
                editing.vendor_operation('pt_save_activity', args, workspace)
            for filename in ['../escape.pka', '/tmp/escape.pka', 'C:\\escape.pka', 'lab.pkt', 'lab.pka\n']:
                with self.subTest(filename=filename), self.assertRaises(ValidationError):
                    self.validate('pt_save_activity', {'filename': filename})
            with self.assertRaises(ValidationError):
                self.validate('pt_save_activity', {**args, 'overwrite': True})
            if os.name != 'nt':  # Symlink creation requires extra Windows privileges.
                (workspace / 'link.pka').symlink_to(workspace / 'missing')
                with self.assertRaises(ValueError):
                    editing.vendor_operation('pt_save_activity', {'filename': 'link.pka'}, workspace)

    def test_partial_vendor_failure_is_not_reported_as_success(self):
        result = ([TextContent(type='text', text='VLAN created\n[ERROR] invalid interface')], {'partial': True})
        checked = editing.checked_result('pt_apply_ios_config', {}, result, Path('/unused'))
        self.assertTrue(checked.isError)
        self.assertIn('VLAN created', checked.content[0].text)
        for failure in ['[TIMEOUT]', '[UNKNOWN COMMAND]', '[WAITING FOR ANSWER]', 'Could not use the console', 'No answer from PT', 'PT error while saving', 'ERR:not created', '{"ok": false}']:
            checked = editing.checked_result('pt_apply_ios_config', {}, [TextContent(type='text', text=failure)], Path('/unused'))
            self.assertTrue(checked.isError)


if __name__ == '__main__':
    unittest.main()
