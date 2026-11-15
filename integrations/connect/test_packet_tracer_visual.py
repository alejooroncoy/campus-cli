import asyncio
import base64
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('visual', ROOT / 'integrations/connect/plugins/packet-tracer/visual.py')
visual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(visual)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0N8AAAAASUVORK5CYII=')


def fixture():
    return {'ok': True, 'coverage': 'complete', 'errors': [], 'clusters': [],
            'selectedCluster': {'id': 'hco', 'name': 'Huanuco'},
            'deviceCount': 3, 'linkCount': 1,
            'devices': [{'name': 'PC1', 'model': 'PC-PT', 'clusterId': 'hco', 'x': 100, 'y': 100, 'width': 40, 'height': 40},
                        {'name': 'PC1', 'model': 'PC-PT', 'clusterId': 'root', 'x': 100, 'y': 100, 'width': 40, 'height': 40},
                        {'name': 'PC2', 'model': 'PC-PT', 'clusterId': 'root'}],
            'notes': [], 'capture': {'status': 'captured', 'cluster': 'Huanuco'},
            'image': ','.join(str(n if n < 128 else n - 256) for n in PNG)}


class VisualTests(unittest.TestCase):
    def test_native_png_and_exact_duplicate_and_membership_evidence(self):
        result = visual.review_result(json.dumps(fixture()), {'expected_devices': ['PC2', 'missing']})
        self.assertFalse(result.isError)
        self.assertEqual(result.content[1].data, base64.b64encode(PNG).decode())
        self.assertEqual(result.structuredContent['duplicateNames'], [{'name': 'PC1', 'count': 2}])
        self.assertEqual(result.structuredContent['missingExpectedDevices'], ['missing'])
        self.assertEqual(result.structuredContent['expectedDevicesOutsideCluster'][0]['name'], 'PC2')
        self.assertEqual(result.structuredContent['scopedDeviceCount'], 1)
        self.assertEqual(result.structuredContent['visualVerification'], 'pending_image_review')
        self.assertNotIn(result.content[1].data, result.content[0].text)

    def test_missing_or_invalid_capture_is_error_not_visual_success(self):
        for blob in [None, 'not-an-image', '1,2,3']:
            with self.subTest(blob=blob):
                f = fixture()
                if blob is None:
                    del f['image']
                else:
                    f['image'] = blob
                result = visual.review_result(json.dumps(f), {})
                self.assertTrue(result.isError)
                self.assertEqual(result.structuredContent['capture']['status'], 'failed')
                self.assertEqual(len(result.content), 1)

    def test_partial_reads_and_view_restore_failures_remain_explicit(self):
        for key, value in [('coverage', 'partial'), ('viewRestoreError', 'restore_mismatch')]:
            f = fixture(); f[key] = value
            result = visual.review_result(json.dumps(f), {})
            self.assertTrue(result.isError)
            self.assertEqual(result.structuredContent[key], value)

    def test_structural_only_has_no_image_and_does_not_certify_visual_legibility(self):
        f = fixture(); del f['image']; f['capture'] = {'status': 'not_requested'}
        result = visual.review_result(json.dumps(f), {'capture': False})
        self.assertFalse(result.isError)
        self.assertEqual(len(result.content), 1)
        self.assertEqual(result.structuredContent['geometry']['evidence'], 'estimated_coordinates')
        self.assertEqual(result.structuredContent['visualVerification'], 'pending_image_review')

    def test_auxiliary_power_objects_are_counted_but_not_misreported_as_network_label_collisions(self):
        f = fixture()
        f['devices'] += [{'name': 'PDU1', 'model': 'Power Distribution Device', 'clusterId': 'hco', 'x': 3889, 'y': 3885, 'width': 45, 'height': 31},
                         {'name': 'PDU2', 'model': 'Power Distribution Device', 'clusterId': 'hco', 'x': 3889, 'y': 3885, 'width': 45, 'height': 31}]
        result = visual.review_result(json.dumps(f), {})
        self.assertEqual(result.structuredContent['scopedDeviceCount'], 3)
        self.assertEqual(result.structuredContent['scopedNetworkDeviceCount'], 1)
        self.assertEqual(result.structuredContent['geometry']['excludedAuxiliaryDevices'], ['PDU1', 'PDU2'])
        self.assertEqual(result.structuredContent['geometry']['warnings'], [])

    def test_png_dimension_and_result_size_limits(self):
        blob = bytearray(PNG); blob[16:24] = struct.pack('>II', 12000, 12000)
        f = fixture(); f['image'] = ','.join(map(str, blob))
        self.assertTrue(visual.review_result(json.dumps(f), {}).isError)
        with self.assertRaisesRegex(ValueError, 'límite'):
            visual.review_result(' ' * 6_000_001, {})

    def test_overlap_is_an_estimate_and_clipping_is_not_silently_ignored(self):
        d = fixture()['devices'][0]
        result = visual.geometry_warnings([d], [{'id': 'note', 'text': 'PC1', 'x': 100, 'y': 140}])
        self.assertTrue(any(x['type'] == 'possible_label_overlap' for x in result['warnings']))
        d['x'] = -50
        self.assertTrue(any(x['type'] == 'possible_clipping' for x in visual.geometry_warnings([d], [])['warnings']))

    def test_bridge_timeout_becomes_an_explicit_mcp_error(self):
        class Bridge:
            def send_and_wait(self, script, timeout):
                return None
        result = asyncio.run(visual.review_layout(Bridge(), {}))
        self.assertTrue(result.isError)
        self.assertIn('no respondió', result.content[0].text)

    @unittest.skipUnless(shutil.which('node'), 'Node required for the fake Cisco API execution')
    def test_script_captures_requested_cluster_and_restores_on_capture_failure(self):
        fake = r'''
const root={getId:()=>"root",getName:()=>"Root",getChildClusterCount:()=>1,getChildClusterAt:()=>hco};
const hco={getId:()=>"hco",getName:()=>"Huanuco",getChildClusterCount:()=>0};
let current=root;const visited=[];
const lw={getCurrentCluster:()=>current,getRootCluster:()=>root,getCanvasNoteIds:()=>[],
showClusterContents:id=>{visited.push(id);current=id==='hco'?hco:root;},getCurrentZoom:()=>0,
getWorkspaceImage:()=>{if(current!==hco)throw Error('wrong cluster');if(FAIL)throw Error('capture failed');return 'bytes';}};
const ipc={network:()=>({getDeviceCount:()=>0,getLinkCount:()=>0}),appWindow:()=>({getActiveWorkspace:()=>({getLogicalWorkspace:()=>lw})})};
let result;function reportResult(x){result=JSON.parse(x);}
SCRIPT
if(current!==root||visited.join(',')!=='hco,root')throw Error('view not restored');
process.stdout.write(JSON.stringify(result));
'''
        for fail in [False, True]:
            source = fake.replace('FAIL', json.dumps(fail)).replace('SCRIPT', visual.review_script({'cluster': 'Huanuco'}))
            result = subprocess.run(['node', '-e', source], capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            self.assertEqual(data['capture']['status'], 'failed' if fail else 'captured')
            self.assertEqual(data['selectedCluster']['name'], 'Huanuco')


if __name__ == '__main__':
    unittest.main()
