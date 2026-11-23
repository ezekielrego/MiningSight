const {chromium}=require(process.env.MININGSIGHT_PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('assert/strict');
const fs=require('fs');
const base=process.env.REVIEW_BASE || 'http://127.0.0.1:4185';
function makeGlb(){
 const bin=Buffer.alloc(36);[-2,0,0,2,0,0,0,4,0].forEach((v,i)=>bin.writeFloatLE(v,i*4));
 const data={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Structure',children:[1,2,3]},{name:'Panel_A',mesh:0,translation:[-3,0,0]},{name:'Panel_B',mesh:0,translation:[3,0,0]},{name:'Authored camera',camera:0,translation:[0,1.7,6]}],cameras:[{type:'perspective',perspective:{yfov:0.8,znear:0.1,zfar:100}}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0.4,0.6,0.8,1],metallicFactor:0,roughnessFactor:1}}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-2,0,0],max:[2,4,0]}]};
 let json=Buffer.from(JSON.stringify(data));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const result=Buffer.alloc(12+8+json.length+8+bin.length);result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);const offset=20+json.length;result.writeUInt32LE(bin.length,offset);result.writeUInt32LE(0x004e4942,offset+4);bin.copy(result,offset+8);return result;
}
const asset={id:'asset_review',name:'Review.glb',kind:'model',url:'/fixtures/model.glb',type:'model/gltf-binary',size:1024,uploadedAt:new Date().toISOString()};
const flatten=objects=>objects.flatMap(object=>[object,...flatten(object.children||[])]);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || '/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server']});let page;const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(()=>localStorage.setItem('miningsight_onboarding_completed','true'));
  const remoteUrl='https://marble.worldlabs.ai/project/00000000-0000-4000-8000-000000000000?mode=view';
  const world={id:'asset_world',name:'Marble preview',kind:'world',provider:'worldlabs',type:'text/uri-list',size:0,uploadedAt:new Date().toISOString(),remoteUrl,url:remoteUrl};
  await context.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;assert.equal(req.method(),'GET');let body={success:true};
   if(path.endsWith('/public/projects'))body.projects=[{id:'public_project_marble',projectName:'Marble preview',public:true,readOnly:true,assetCount:1,assets:[]}];
   else if(path.endsWith('/public/projects/project_marble'))body.project={projectId:'public_project_marble',projectName:'Marble preview',objects:[],materials:[],public:true,readOnly:true,assets:[world]};
   else if(path.endsWith('/public/projects/project_model'))body.project={projectId:'public_project_model',projectName:'Model fixture',objects:[],materials:[],public:true,readOnly:true,assets:[asset]};
   else if(path.endsWith('/auth/google/config'))body.clientId='';
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.route('https://www.tunnelsight.applications.co.zw/**',route=>route.fulfill({contentType:'text/html',body:'<canvas></canvas><script>window.parent.postMessage({type:"tunnelsight:viewer-ready"},"*")</script>'}));
  await context.route('**/fixtures/model.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:makeGlb()}));
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base,{waitUntil:'networkidle'});
  const minimize=page.getByRole('button',{name:'Minimize panels',exact:true});const lock=page.getByRole('button',{name:'Lock Workspace',exact:true});
  assert.ok(await minimize.evaluate(el=>el.previousElementSibling.title==='Lock Workspace'&&el.parentElement.lastElementChild===el));
  const drag=async(locator,dx,dy)=>{const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:6});await page.mouse.up();await page.waitForTimeout(80);};
  const col=page.locator('[data-workspace-viewport-column]');let width=(await col.boundingBox()).width;
  await drag(page.getByRole('separator',{name:'Resize right sidebar',exact:true}),-80,0);assert.ok((await col.boundingBox()).width<width-30,'unlocked resize changes layout');
  await lock.click();assert.equal(await page.getByLabel('Workspace layout',{exact:true}).isDisabled(),true);
  const snapshot=()=>page.getByRole('separator').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
  const before=await snapshot();for(const sep of await page.getByRole('separator').all())await drag(sep,35,35);assert.deepEqual(await snapshot(),before,'all four locked splitters stay fixed');
  const overlay=page.locator('[data-viewer-draggable="Camera location"]'),oldOverlay=await overlay.boundingBox();await drag(overlay,80,60);assert.deepEqual(await overlay.boundingBox(),oldOverlay,'locked overlays cannot move');
  assert.equal(await page.getByTitle('Collapse Right Sidebar',{exact:true}).isDisabled(),true);
  await minimize.click();await page.getByRole('button',{name:'Restore panels',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Unlock Workspace',exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Unlock Workspace',exact:true}).waitFor();assert.equal(await page.getByLabel('Workspace layout').isDisabled(),true);
  await page.getByRole('button',{name:'Unlock Workspace',exact:true}).click();assert.equal(await page.getByLabel('Workspace layout').isDisabled(),false);
  const initialOverlay=await overlay.boundingBox();await drag(overlay,40,40);assert.notDeepEqual(await overlay.boundingBox(),initialOverlay,'unlocked overlays can move');
  await page.goto(base+'/?publicProject=project_model',{waitUntil:'networkidle'});
  await page.getByText('Review.glb [Object]',{exact:true}).waitFor();
  await page.getByText('Perspective (Orbit)',{exact:true}).waitFor();
  assert.equal(await page.getByText('Walk position · m',{exact:true}).count(),0,'authored camera must not auto-enter walk');
  const choose=page.getByTitle('Choose a local project or a provider library',{exact:true});
  await choose.selectOption('local_preset_classic_diorama');await page.getByRole('button',{name:'Scene: Classic'}).waitFor();await page.getByText('3 Objects · 0 Assets',{exact:true}).waitFor();
  await choose.selectOption('local_session');await page.getByRole('button',{name:'Scene: None'}).waitFor();
  await page.goto(base+'/?publicProject=project_marble',{waitUntil:'networkidle'});
  const frame=page.locator('iframe[title="worldlabs model: Marble preview"]');await frame.waitFor();assert.ok((await frame.getAttribute('src')).includes('/https/marble.worldlabs.ai/project/00000000-0000-4000-8000-000000000000?mode=view'));
  assert.equal(await page.getByText('MiningSight Account',{exact:true}).count(),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({minimize_last_after_lock:true,lock_blocks_all_splitters:true,lock_blocks_overlay_drag:true,unlock_restores_drag:true,lock_survives_reload:true,minimize_and_escape_restore_work:true,local_scene_choices_restored:true,blank_session_still_available:true,imported_camera_opens_in_orbit:true,public_marble_auto_embeds_without_signin:true,browser_errors:errors}));
 }catch(error){console.error(error.stack);if(page){await page.screenshot({path:process.env.REVIEW_SCREENSHOT || '/tmp/miningsight-workspace-failure.png'}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-2500));}process.exitCode=1;}
 finally{await browser.close();}
})();
