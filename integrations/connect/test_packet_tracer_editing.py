"""Policy and adapter checks; these do not mutate a live Cisco laboratory."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock

from jsonschema import Draft202012Validator, ValidationError
from mcp.types import TextContent, CallToolResult

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
        for failure in ['[TIMEOUT]', '[UNKNOWN COMMAND]', '[WAITING FOR ANSWER]', 'Could not use the console', 'No answer from PT', 'Packet Tracer is not connected over any channel', 'PT error while saving', 'ERR:not created', '{"ok": false}']:
            checked = editing.checked_result('pt_apply_ios_config', {}, [TextContent(type='text', text=failure)], Path('/unused'))
            self.assertTrue(checked.isError)

    def test_service_reads_do_not_enable_services_or_reset_wifi(self):
        for name in ['pt_server_dhcp', 'pt_server_dns', 'pt_server_http']:
            self.validate(name, {'device': 'Server1'})
            operation, args = editing.vendor_operation(name, {'device': 'Server1'}, Path('/unused'))
            self.assertEqual(operation, name)
            self.assertIsNone(args['enable'])
            self.assertFalse(args['show'])
            self.assertFalse(args['capture'])
        _, args = editing.vendor_operation('pt_wireless_ap', {'device': 'AP1'}, Path('/unused'))
        self.assertFalse(args['reset_associations'])

    def test_services_reject_paths_console_injection_and_unbounded_inputs(self):
        invalid = [('pt_server_dhcp', {'device': 'Server1', 'max_users': 999999}),
                   ('pt_server_dhcp', {'device': 'Server1', 'output_dir': '/tmp'}),
                   ('pt_server_dns', {'device': 'Server1', 'records': [{'name': 'a.lab', 'type': 'A', 'value': '1.2.3.4', 'code': 'bad'}]}),
                   ('pt_web_check', {'device': 'PC1', 'host': 'localhost/../../etc'}),
                   ('pt_web_check', {'device': 'PC1', 'host': 'example.com@outside'}),
                   ('pt_host_lookup', {'device': 'PC1', 'name': 'a.lab\nreload'}),
                   ('pt_apply_security_config', {'device': 'SW1', 'commands': ['do reload']}),
                   ('pt_generate_ssh_keys', {'device': 'SW1', 'bits': 4096})]
        for name, args in invalid:
            with self.subTest(operation=name), self.assertRaises(ValidationError):
                self.validate(name, args)

    def test_credentials_are_redacted_from_plain_and_structured_results(self):
        secret = 'FixtureOnlySecret123'
        result = ([TextContent(type='text', text='echo ' + secret)], {'result': 'echo ' + secret})
        args = {'device': 'PC1', 'to_ip': '172.27.56.241', 'username': 'labuser', 'password': secret}
        self.validate('pt_ssh_test', args)
        checked = editing.checked_result('pt_ssh_test', args, result, Path('/unused'))
        self.assertNotIn(secret, str(checked))
        self.assertIn('[REDACTED]', str(checked))
        args = {'device': 'SW1', 'commands': ['username labuser privilege 15 secret ' + secret]}
        self.validate('pt_apply_security_config', args)
        checked = editing.checked_result('pt_apply_security_config', args, result, Path('/unused'))
        self.assertNotIn(secret, str(checked))

    def test_authenticated_ssh_never_hides_later_failures_or_upstream_errors(self):
        args = {'password': 'FixtureOnlySecret123'}
        prefix = '[WAITING FOR ANSWER] Password:\nCurrent privilege level is 15\n'
        for tail in ['Interrupted:', 'No answer from PT', 'PT error', 'ERR:broken', '[TIMEOUT]']:
            with self.subTest(tail=tail):
                result = [TextContent(type='text', text=prefix + tail)]
                self.assertTrue(editing.checked_result('pt_ssh_test', args, result, Path('/unused')).isError)
        result = CallToolResult(content=[TextContent(type='text', text=prefix)], isError=True)
        self.assertTrue(editing.checked_result('pt_ssh_test', args, result, Path('/unused')).isError)
        result = [TextContent(type='text', text=prefix + 'Session closed normally')]
        checked = editing.checked_result('pt_ssh_test', args, result, Path('/unused'))
        self.assertIn('[EXPECTED AUTH PROMPT]', str(checked))
        self.assertNotIn('[WAITING FOR ANSWER]', str(checked))


class RsaPromptTests(unittest.IsolatedAsyncioTestCase):
    async def test_rsa_preserves_upstream_error_flags(self):
        call = AsyncMock(return_value=CallToolResult(content=[TextContent(type='text', text='How many bits in the modulus [512]:')], isError=True))
        self.assertTrue((await editing.generate_ssh_keys(call, {'device': 'SW1', 'bits': 2048})).isError)
        self.assertEqual(call.call_count, 1)
        call = AsyncMock(side_effect=[[TextContent(type='text', text='How many bits in the modulus [512]:')], CallToolResult(content=[TextContent(type='text', text='SSH Enabled - version 2.0')], isError=True)])
        self.assertTrue((await editing.generate_ssh_keys(call, {'device': 'SW1', 'bits': 2048})).isError)
    async def test_generate_answers_only_the_bits_question_and_checks_ssh(self):
        call = AsyncMock(side_effect=[[TextContent(type='text', text='[WAITING FOR ANSWER] How many bits in the modulus [512]:')],
                                      [TextContent(type='text', text='SSH Enabled - version 2.0')]])
        result = await editing.generate_ssh_keys(call, {'device': 'SW1', 'bits': 2048})
        self.assertFalse(result.isError)
        self.assertEqual(call.call_args_list[1].args[1]['commands'], ['2048', 'end', 'show ip ssh'])
        self.assertNotIn('[WAITING FOR ANSWER]', str(result))

    async def test_existing_keys_are_never_replaced(self):
        call = AsyncMock(side_effect=[[TextContent(type='text', text='[WAITING FOR ANSWER] Do you really want to replace them? [yes/no]')],
                                      [TextContent(type='text', text='SSH Enabled - version 2.0')]])
        result = await editing.generate_ssh_keys(call, {'device': 'SW1', 'bits': 2048})
        self.assertFalse(result.isError)
        self.assertEqual(call.call_args_list[1].args[1]['commands'][0], 'no')

    async def test_unknown_questions_or_disabled_ssh_are_not_success(self):
        call = AsyncMock(return_value=[TextContent(type='text', text='Password:')])
        self.assertTrue((await editing.generate_ssh_keys(call, {'device': 'SW1', 'bits': 2048})).isError)
        self.assertEqual(call.call_count, 1)
        call = AsyncMock(side_effect=[[TextContent(type='text', text='How many bits in the modulus [512]:')],
                                      [TextContent(type='text', text='SSH Disabled - version 1.99')]])
        self.assertTrue((await editing.generate_ssh_keys(call, {'device': 'SW1', 'bits': 2048})).isError)


if __name__ == '__main__':
    unittest.main()
