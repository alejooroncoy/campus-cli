// Actual chat UI against the isolated local fixture. All academic data is synthetic.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.CAMPUS_RECONNECT_E2E_ORIGIN??'http://127.0.0.1:4330';
const id='11111111-1111-4111-8111-111111111111';
const answer=`Aquí tienes las notas de prueba del ciclo 202620.

**Arquitecturas de Software (TEST101)**
| Evaluación | Nota | Peso |
| :--- | ---: | ---: |
| Práctica calificada 1 | 18.5 | 10% |
| Evaluación parcial | Pendiente | 20% |
| Trabajo 1 | 0 | 15% |

### Gerencia de Proyectos (TEST102)
Evaluaciones publicadas:
| Evaluación | Nota | Peso |
| :--- | ---: | ---: |
| Práctica 1 | 15 | 10% |
| Final | Pendiente | 20% |

### Siguientes pasos
1. Revisa las evaluaciones pendientes.
2. Consulta el [portal oficial](https://estudiante.upc.edu.pe/).
   - Las notas pueden actualizarse.

<script>window.markdownUnsafe=true</script>
[Enlace inseguro](javascript:alert(1))
![No cargar recursos remotos](https://example.invalid/private.png)

| Detalle | Fuente | Observación | Actualización |
| --- | --- | --- | --- |
| Evaluación con un nombre extenso | Mi UPC | Información de prueba, sin datos del estudiante | 2026-10-12 |`;
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1100,height:850},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];let remoteImages=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://example.invalid/**',route=>{remoteImages++;return route.abort();});
  await page.route('**/api/app/profes/conversation?**',route=>route.fulfill({json:{conversationId:id,messages:[{id:'1',role:'user',content:'Mis notas actuales'},{id:'2',role:'assistant',content:answer}],hasMore:false,nextBeforeId:'1'}}));
  await page.goto(`${base}/app/profes/c/${id}/`);
  const reply=page.locator('.app-profes-ai__message--assistant').last();
  await reply.getByRole('table').first().waitFor();
  assert.equal(await reply.getByRole('table').count(),3,'Tables adjacent to headings and prose must render');
  assert.equal(await reply.getByRole('columnheader',{name:'Nota',exact:true}).count(),2);
  assert.equal(await reply.getByRole('cell',{name:'0',exact:true}).count(),1,'Zero must remain a published grade');
  assert.equal(await reply.locator('td.is-pending').count(),2);
  assert.equal(await reply.getByRole('heading',{name:'Siguientes pasos'}).count(),1);
  assert.equal(await reply.locator('ol > li').count(),2);
  assert.equal(await reply.locator('ol ul > li').count(),1);
  assert.equal(await reply.getByRole('link',{name:'portal oficial'}).getAttribute('href'),'https://estudiante.upc.edu.pe/');
  assert.equal(await reply.locator('a[href^="javascript:"]').count(),0);
  assert.equal(await reply.locator('script,img').count(),0);
  assert.equal(await page.evaluate(()=>window.markdownUnsafe),undefined);
  assert.equal(remoteImages,0);
  for(const region of await reply.getByRole('region',{name:'Tabla de la respuesta'}).all()){
   assert.equal(await region.getAttribute('tabindex'),'0');
   assert.ok(await region.evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'Tables stay inside mobile viewport');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
  assert.deepEqual(errors,[]);
  await reply.scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/campus-grades-${viewport.width<700?'mobile':'desktop'}.png`,fullPage:true});
  console.log(JSON.stringify({viewport:viewport.width,tables:3,adjacentHeadings:true,zero:true,lists:true,safeMarkup:true,overflow:false,result:'passed'}));
  await context.close();
 }
}finally{await browser.close();}
