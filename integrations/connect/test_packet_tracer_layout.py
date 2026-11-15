"""Execute position edits against a fake Cisco API; no live laboratory writes."""
import asyncio
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import unittest

from jsonschema import Draft202012Validator, ValidationError

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('layout', ROOT / 'integrations/connect/plugins/packet-tracer/layout.py')
layout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(layout)
POLICY = {t['name']: t for t in json.loads((ROOT / 'src/cloud/packet-tracer/policy.json').read_text())['tools']}
NOTE_ID = '{01234567-89ab-cdef-0123-456789abcdef}'
DEVICE = {'cluster': 'Huanuco', 'device_name': 'PC1', 'expected_position': {'x': 100, 'y': 200}, 'x': 150, 'y': 250}
NOTE = {'cluster': 'Huanuco', 'note_id': NOTE_ID, 'expected_text': 'Ventas',
        'expected_position': {'x': 400, 'y': 500}, 'x': 450, 'y': 550}

FAKE = r'''
const mode=MODE,args=ARGS;let mutations=0,lookups=0,visited=[];
const state={device:{x:100,y:200},note:{x:400,y:500,text:TEXT}};
const hco={getId:()=>"hco",getName:()=>args.cluster,getChildClusterCount:()=>0};
const root={getId:()=>"root",getName:()=>"Root",getChildClusterCount:()=>mode==='cluster_missing'?0:mode==='cluster_ambiguous'?2:1,
getChildClusterAt:i=>i===1?{...hco,getId:()=>"hco2"}:hco};
let current=root;
const model=()=>"PC-PT";
const device={getName:()=>args.device_name||'PC1',getModel:model,
getXCoordinate:()=>state.device.x,getYCoordinate:()=>state.device.y,
moveToLocation:(x,y)=>{mutations++;state.device={x:x,y:mode==='wrong_readback'?y+1:y};if(mode==='throw_after_move')throw Error('interrupted after applying');}};
const component={getClusterID:()=>mode==='outside'||(mode==='cluster_changed'&&mutations)?'root':'hco'};
const noteId='{01234567-89ab-cdef-0123-456789abcdef}';
const lw={getRootCluster:()=>root,getCurrentCluster:()=>current,
getComponentItem:()=>{lookups++;if(mode==='duplicate')throw Error('ambiguous lookup');return component;},
getCanvasNoteIds:()=>mode==='non_note'?[]:[noteId],getClusterIdForItem:()=>mode==='outside'?'root':'hco',
getCanvasItemRealX:()=>state.note.x,getCanvasItemRealY:()=>state.note.y,
getCanvasNoteText:()=>mode==='stale_text'?'Changed since review':state.note.text,
moveCanvasItemBy:(id,dx,dy)=>{if(id!==noteId)throw Error('wrong id');mutations++;state.note.x+=dx;state.note.y+=dy;
if(mode==='text_changed')state.note.text='Unexpected change';},
showClusterContents:id=>{visited.push(id);if(id==='root'&&mode==='restore_failed')throw Error('restore failed');
current=id==='root'?root:hco;if(id==='hco'&&mode==='changed_on_selection')state.device.x++;}};
const net={getDeviceCount:()=>mode==='inventory_limit'?1001:mode==='duplicate'||(mode==='counts_changed'&&mutations)?2:1,
getLinkCount:()=>1,getDeviceAt:()=>device};
const ipc={network:()=>net,appWindow:()=>({getActiveWorkspace:()=>({getLogicalWorkspace:()=>lw})})};
let result;function reportResult(raw){result=JSON.parse(raw);}
SCRIPT
process.stdout.write(JSON.stringify({result,state,mutations,lookups,visited,current:current.getId()}));
'''


@unittest.skipUnless(shutil.which('node'), 'Node required for executable fake Cisco API tests')
class LayoutScriptTests(unittest.TestCase):
    def run_script(self, operation='pt_move_device', args=None, mode='', text='Ventas'):
        args = args or dict(DEVICE)
        source = FAKE.replace('MODE', json.dumps(mode), 1).replace('ARGS', json.dumps(args), 1).replace('TEXT', json.dumps(text), 1)
        source = source.replace('SCRIPT', layout.move_script(operation, args), 1)
        result = subprocess.run(['node', '-e', source], capture_output=True, text=True, encoding='utf-8', check=True)
        return json.loads(result.stdout)

    def checked(self, data, operation='pt_move_device', args=None):
        return layout.move_result(json.dumps(data['result']), operation, args or DEVICE)

    def test_device_moves_with_verified_membership_counts_and_view_restoration(self):
        data = self.run_script()
        self.assertEqual(data['state']['device'], {'x': 150, 'y': 250})
        self.assertEqual(data['mutations'], 1)
        self.assertEqual(data['visited'], ['hco', 'root'])
        self.assertEqual(data['current'], 'root')
        result = self.checked(data)
        self.assertFalse(result.isError)
        self.assertEqual(result.structuredContent['before']['clusterId'], result.structuredContent['after']['clusterId'])
        self.assertEqual(result.structuredContent['countsBefore'], result.structuredContent['countsAfter'])

    def test_note_move_is_absolute_from_real_coordinates_and_keeps_text(self):
        data = self.run_script('pt_move_note', NOTE)
        self.assertEqual(data['state']['note'], {'x': 450, 'y': 550, 'text': 'Ventas'})
        self.assertFalse(self.checked(data, 'pt_move_note', NOTE).isError)
        self.assertEqual(data['mutations'], 1)
        self.assertEqual(data['current'], 'root')

    def test_noop_is_verified_without_invoking_a_setter(self):
        args = {**DEVICE, 'x': 100, 'y': 200}
        data = self.run_script(args=args)
        self.assertTrue(data['result']['noOp'])
        self.assertEqual(data['mutations'], 0)
        self.assertFalse(self.checked(data, args=args).isError)

    def test_ambiguous_missing_outside_or_stale_targets_never_write(self):
        for mode, error in [('duplicate', 'device_missing_or_ambiguous'), ('outside', 'target_outside_cluster'),
                            ('cluster_missing', 'cluster_missing_or_ambiguous'), ('cluster_ambiguous', 'cluster_missing_or_ambiguous'),
                            ('inventory_limit', 'inventory_limit'), ('changed_on_selection', 'target_changed_before_move')]:
            with self.subTest(mode=mode):
                data = self.run_script(mode=mode)
                self.assertEqual(data['result']['error'], error)
                self.assertEqual(data['mutations'], 0)
                self.assertTrue(self.checked(data).isError)
                self.assertEqual(data['current'], 'root')
                if mode == 'duplicate':
                    self.assertEqual(data['lookups'], 0)
        args = {**DEVICE, 'expected_position': {'x': 99, 'y': 200}}
        data = self.run_script(args=args)
        self.assertEqual(data['result']['error'], 'stale_position')
        self.assertEqual(data['mutations'], 0)

    def test_note_ids_cannot_target_shapes_and_changed_text_is_refused(self):
        for mode, error in [('non_note', 'note_missing_or_ambiguous'), ('stale_text', 'stale_note_text'), ('outside', 'target_outside_cluster')]:
            data = self.run_script('pt_move_note', NOTE, mode)
            self.assertEqual(data['result']['error'], error)
            self.assertEqual(data['mutations'], 0)
            self.assertTrue(self.checked(data, 'pt_move_note', NOTE).isError)

    def test_partial_moves_failed_readback_and_failed_view_restoration_are_errors(self):
        for mode in ['wrong_readback', 'counts_changed', 'cluster_changed', 'throw_after_move', 'restore_failed']:
            with self.subTest(mode=mode):
                data = self.run_script(mode=mode)
                self.assertTrue(data['result']['mutationAttempted'])
                self.assertTrue(self.checked(data).isError)
                self.assertEqual(data['mutations'], 1)
        data = self.run_script('pt_move_note', NOTE, 'text_changed')
        self.assertTrue(self.checked(data, 'pt_move_note', NOTE).isError)

    def test_unicode_and_script_like_note_text_are_data(self):
        text = 'Ventas / Huánuco\n");throw Error("injected"); //'
        args = {**NOTE, 'cluster': 'Huánuco', 'expected_text': text}
        data = self.run_script('pt_move_note', args, text=text)
        result = self.checked(data, 'pt_move_note', args)
        self.assertFalse(result.isError, result.structuredContent)
        self.assertEqual(data['state']['note']['text'], text)

    def test_python_checks_readback_even_if_success_flags_are_forged(self):
        data = self.run_script()
        data['result']['after']['x'] = 999
        result = self.checked(data)
        self.assertTrue(result.isError)
        self.assertEqual(result.structuredContent['error'], 'inconsistent_readback')


class LayoutBoundaryTests(unittest.TestCase):
    def test_same_strict_policy_validates_at_relay_and_worker_boundary(self):
        for name, args in [('pt_move_device', DEVICE), ('pt_move_note', NOTE)]:
            policy = POLICY[name]
            self.assertTrue(policy['mutates'])
            self.assertTrue(policy['connectOnly'])
            self.assertEqual(policy['minPackageVersion'], '0.2.5')
            validator = Draft202012Validator(policy['inputSchema'])
            validator.validate(args)
            for bad in [{**args, 'x': -1}, {**args, 'y': 10001}, {**args, 'x': 1.5},
                        {**args, 'script': 'not permitted'}, {k: v for k, v in args.items() if k != 'expected_position'}]:
                with self.assertRaises(ValidationError):
                    validator.validate(bad)
        for bad in [{**NOTE, 'note_id': '../shape'}, {**NOTE, 'expected_text': 'a' * 2001}]:
            with self.assertRaises(ValidationError):
                Draft202012Validator(POLICY['pt_move_note']['inputSchema']).validate(bad)

    def test_timeout_malformed_response_and_missing_evidence_do_not_claim_success(self):
        class Bridge:
            def __init__(self, response):
                self.response = response
                self.calls = 0
            def send_and_wait(self, script, timeout):
                self.calls += 1
                return self.response
        for response in [None, 'not JSON', '[]', '{"ok":true,"verified":true}']:
            bridge = Bridge(response)
            result = asyncio.run(layout.move_layout(bridge, 'pt_move_device', DEVICE))
            self.assertTrue(result.isError)
            self.assertTrue(result.structuredContent['mayHaveChanged'])
            self.assertEqual(bridge.calls, 1)
        with self.assertRaises(ValueError):
            layout.move_script('pt_send_raw', {})


if __name__ == '__main__':
    unittest.main()
