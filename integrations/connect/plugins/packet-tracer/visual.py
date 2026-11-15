"""Read-only layout evidence and native PNGs from Cisco's documented API.

Only the logical workspace is captured. No desktop capture, arbitrary script,
local paths, topology edits, automatic repairs or configuration reads are exposed.
"""
import asyncio
import base64
import json
import math
import struct
from collections import Counter

from mcp.types import CallToolResult, ImageContent, TextContent
from packet_tracer_mcp.domain.services.canvas import decode_pt_image

MAX_IMAGE_BYTES = 768_000


def review_script(arguments):
    config = {'cluster': arguments.get('cluster'), 'capture': arguments.get('capture', True)}
    # ComponentItem and Cluster coordinates are in the logical workspace, not
    # desktop pixels. showClusterContents only selects a view; finally restores it.
    return r'''(function(){var w=null,previous=null,changed=false,out={ok:false};try{
var c=CONFIG,n=ipc.network();w=ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
previous=w.getCurrentCluster();var clusters=[],items=[],notes=[],errors=[],seen={};
function walk(x,parent,depth){if(depth>20||clusters.length>=100)throw 'cluster_limit';
var id=String(x.getId());if(seen[id])throw 'cluster_cycle';seen[id]=true;
clusters.push({id:id,name:String(x.getName()),parent:parent});
for(var i=0;i<x.getChildClusterCount();i++)walk(x.getChildClusterAt(i),id,depth+1);}
walk(w.getRootCluster(),null,0);
var matches=c.cluster?clusters.filter(function(x){return x.name===c.cluster;}):
clusters.filter(function(x){return x.id===String(previous.getId());});
if(matches.length!==1)throw 'cluster_missing_or_ambiguous';var target=matches[0];
var count=n.getDeviceCount();if(count>1000||n.getLinkCount()>2000)throw 'inventory_limit';
for(var i=0;i<count;i++){var d=n.getDeviceAt(i),name=String(d.getName()),a=w.getComponentItem(name);
var item={name:name,model:String(d.getModel()),clusterId:null};
try{if(!a)throw 'component_missing';item.clusterId=String(a.getClusterID());
item.x=Number(d.getXCoordinate());item.y=Number(d.getYCoordinate());
item.width=Number(a.getWidth());item.height=Number(a.getHeight());}
catch(e){errors.push({device:name,error:String(e)});}items.push(item);}
var ids=w.getCanvasNoteIds();if(ids.length>10000)throw 'note_limit';
for(var i=0;i<ids.length;i++){var id=ids[i];try{
if(String(w.getClusterIdForItem(id))!==target.id)continue;
if(notes.length>=250)throw 'scoped_note_limit';var text=String(w.getCanvasNoteText(id));
if(text.length>2000)throw 'note_text_limit';
notes.push({id:String(id),text:text,x:Number(w.getCanvasItemRealX(id)),y:Number(w.getCanvasItemRealY(id))});
}catch(e){errors.push({note:String(id),error:String(e)});}}
out={ok:true,coverage:errors.length?'partial':'complete',errors:errors,clusters:clusters,
selectedCluster:target,originalCluster:{id:String(previous.getId()),name:String(previous.getName())},
deviceCount:count,linkCount:n.getLinkCount(),devices:items,notes:notes,capture:{status:'not_requested'}};
if(c.capture){try{
if(String(previous.getId())!==target.id){changed=true;w.showClusterContents(target.id);}
if(String(w.getCurrentCluster().getId())!==target.id)throw 'capture_cluster_mismatch';
out.capture={status:'captured',clusterId:target.id,cluster:target.name,zoom:w.getCurrentZoom()};
out.image=String(w.getWorkspaceImage('PNG'));
}catch(e){out.capture={status:'failed',error:String(e)};}}
}catch(e){out={ok:false,error:String(e)};}
finally{if(changed&&w&&previous){try{w.showClusterContents(String(previous.getId()));
if(String(w.getCurrentCluster().getId())!==String(previous.getId()))throw 'restore_mismatch';}
catch(e){out.viewRestoreError=String(e);}}}
reportResult(JSON.stringify(out));})();'''.replace('CONFIG', json.dumps(config, ensure_ascii=True), 1)


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def geometry_warnings(devices, notes):
    """Conservative estimates: never certify text bounds from icon coordinates."""
    labels = []
    for d in devices:
        if not all(_number(d.get(k)) for k in ('x', 'y', 'width', 'height')):
            continue
        width = max(len(d['name']), len(d['model'])) * 7
        labels.append({'kind': 'device_label', 'name': d['name'],
                       'box': [d['x'] + d['width'] / 2 - width / 2,
                               d['y'] + d['height'], width, 30]})
    for note in notes:
        lines = note['text'].splitlines()
        if lines and all(_number(note.get(k)) for k in ('x', 'y')):
            labels.append({'kind': 'note', 'name': note['id'],
                           'box': [note['x'], note['y'], max(map(len, lines)) * 7, len(lines) * 15]})
    warnings = []
    for i, a in enumerate(labels):
        x, y, width, height = a['box']
        if x < 0 or y < 0:
            warnings.append({'type': 'possible_clipping', 'item': a})
        for b in labels[i + 1:]:
            bx, by, bw, bh = b['box']
            if x < bx + bw and bx < x + width and y < by + bh and by < y + height:
                warnings.append({'type': 'possible_label_overlap', 'a': a, 'b': b})
            if len(warnings) >= 100:
                return {'evidence': 'estimated_coordinates', 'truncated': True, 'warnings': warnings}
    return {'evidence': 'estimated_coordinates', 'truncated': False, 'warnings': warnings}


def review_result(raw, arguments):
    if raw is None:
        raise ValueError('Cisco no respondió a la revisión; no se confirma una vista vacía ni correcta.')
    if len(raw.encode()) > 6_000_000:
        raise ValueError('La captura excede el límite; repetir con capture=false para revisar la estructura.')
    data = json.loads(raw)
    if not data.get('ok'):
        raise ValueError('No se pudo inspeccionar el laboratorio: ' + str(data.get('error', 'respuesta inválida')))
    image_raw = data.pop('image', None)
    inventory = data['devices']
    counts = Counter(d['name'] for d in inventory)
    data['duplicateNames'] = [{'name': name, 'count': count} for name, count in counts.items() if count > 1]
    selected = data['selectedCluster']['id']
    scoped = [d for d in inventory if d['clusterId'] == selected]
    expected = arguments.get('expected_devices', [])
    data['missingExpectedDevices'] = [name for name in expected if not counts[name]]
    data['expectedDevicesOutsideCluster'] = [d for d in inventory if d['name'] in expected and d['clusterId'] != selected]
    data['scopedDeviceCount'] = len(scoped)
    data['devices'] = scoped
    # Cisco also assigns physical power-distribution objects to these clusters.
    # Keep them visible in inventory/counts, but do not treat their off-canvas
    # physical coordinates as collisions between network devices in the PNG.
    auxiliary = [d for d in scoped if d['model'] == 'Power Distribution Device']
    data['auxiliaryDevices'] = auxiliary
    data['scopedNetworkDeviceCount'] = len(scoped) - len(auxiliary)
    data['geometry'] = geometry_warnings([d for d in scoped if d not in auxiliary], data['notes'])
    data['geometry']['excludedAuxiliaryDevices'] = [d['name'] for d in auxiliary]
    data['visualVerification'] = 'pending_image_review'
    data['note'] = ('Clústeres y duplicados son datos leídos de Cisco. Las alertas geométricas son aproximadas; '
                    'revisar la imagen antes de confirmar que las etiquetas son legibles. No se modificó la red.')
    image = None
    if image_raw is not None and data['capture']['status'] == 'captured':
        try:
            blob = decode_pt_image(image_raw, 'PNG')
            if len(blob) < 33 or len(blob) > MAX_IMAGE_BYTES or blob[:8] != b'\x89PNG\r\n\x1a\n' or blob[12:16] != b'IHDR':
                raise ValueError('PNG inválido o demasiado grande')
            width, height = struct.unpack('>II', blob[16:24])
            if not width or not height or width > 12000 or height > 12000 or width * height > 32_000_000:
                raise ValueError('Dimensiones de captura fuera del límite')
            data['capture'].update(bytes=len(blob), width=width, height=height)
            image = ImageContent(type='image', mimeType='image/png', data=base64.b64encode(blob).decode())
        except ValueError as exc:
            data['capture'] = {'status': 'failed', 'error': str(exc)}
    elif arguments.get('capture', True) and data['capture']['status'] == 'captured':
        data['capture'] = {'status': 'failed', 'error': 'Cisco no devolvió los bytes de la imagen.'}
    error = data['coverage'] != 'complete' or bool(data.get('viewRestoreError')) or (
        arguments.get('capture', True) and image is None)
    content = [TextContent(type='text', text=json.dumps(data, ensure_ascii=False))]
    if image is not None:
        content.append(image)
    # Binary data appears only as native MCP image content, never inside JSON text.
    if len(json.dumps(data).encode()) > 200_000:
        raise ValueError('El informe excede el límite; reducir el número de objetos del clúster.')
    return CallToolResult(content=content, structuredContent=data, isError=error)


async def review_layout(bridge, arguments):
    try:
        raw = await asyncio.to_thread(bridge.send_and_wait, review_script(arguments), timeout=50.0)
        return review_result(raw, arguments)
    except (ValueError, TypeError, KeyError) as exc:
        return CallToolResult(content=[TextContent(type='text', text=str(exc))], isError=True)
