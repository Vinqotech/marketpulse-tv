import {readFile,mkdir,writeFile,copyFile,stat} from 'node:fs/promises';
import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {normalizeNarration,muxBroadcast,RENDER_FPS} from './render-audio.mjs';
import {prepareShowdown} from './quantitative-showdown.mjs';
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH||process.argv[2], 'utf8'));
const payload={...event.client_payload?.briefing,episode_id:event.client_payload?.episode_id};
if(!payload?.episode_id||!payload.script_json?.segments?.length)throw new Error('Missing repository_dispatch briefing payload');
const callback=new URL(payload.callback_url);if(callback.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(callback.hostname))throw new Error('Callback must use HTTPS');
for(const url of [payload.video_upload_url,payload.thumbnail_upload_url])if(new URL(url).protocol!=='https:')throw new Error('Upload URLs must use HTTPS');
const auth={Authorization:`Bearer ${payload.job_token}`,'Content-Type':'application/json'};
const notify=async(body)=>{const r=await fetch(callback,{method:'POST',headers:auth,body:JSON.stringify({episode_id:payload.episode_id,...body})});if(!r.ok)throw new Error(`Callback failed (${r.status})`)};
try{
 await mkdir('render-assets',{recursive:true});await mkdir('render-output',{recursive:true});
 await writeFile('render-assets/payload.json',JSON.stringify(payload));
 const image=await fetch(payload.anchor_avatar_url);if(!image.ok)throw new Error('Studio image unavailable');await writeFile('render-assets/anchor.png',Buffer.from(await image.arrayBuffer()));
 const editorialPath='render-assets/payload.json';
 const editorialFile=await stat(editorialPath).catch(()=>{throw new Error(`[editor] Required payload file is missing or inaccessible: ${editorialPath}`)});
 if(!editorialFile.isFile())throw new Error(`[editor] Payload path is not a file: ${editorialPath}`);
 console.log(`[editor] Starting Python editor with ${editorialPath} (${editorialFile.size} bytes); diagnostics stream below`);
 try{
  execFileSync('python3',['-u','scripts/broadcast_editor.py',editorialPath],{stdio:'inherit',encoding:'utf8'});
 }catch(error){
  // Inherited streams intentionally leave stdout/stderr null; Python prints its cause live.
  const reason=error.code||`exit code ${error.status ?? 'unknown'}${error.signal?`, signal ${error.signal}`:''}`;
  throw new Error(`[editor] Python editor failed (${reason}). See [editor] diagnostics above.`,{cause:error});
 }
 const edited=JSON.parse(await readFile('render-assets/payload.json','utf8'));
 await prepareShowdown(edited);
 await writeFile('render-assets/payload.json',JSON.stringify(edited));
 execFileSync('python3',['scripts/narrate.py','render-assets/payload.json'],{stdio:'inherit'});
 normalizeNarration('render-assets/narration-source.wav','render-assets/narration.wav');
 const segments=JSON.parse(await readFile('render-assets/segments.json','utf8'));
 const timing=JSON.parse(await readFile('render-assets/timing.json','utf8'));
 const props={segments,...timing,showdown:edited.script_json.showdown,ticker_headlines:edited.ticker_headlines,headline_title:edited.headline_title,anchor_name:payload.anchor_name,channel_bug_text:payload.channel_bug_text,start_time:new Date().toISOString(),anchor_image:'anchor.png',audio_src:'narration.wav'};
 const serveUrl=await bundle({entryPoint:'remotion/index.tsx',publicDir:'render-assets'});
 const composition=await selectComposition({serveUrl,id:'TVBroadcast',inputProps:props});
 if(composition.fps!==RENDER_FPS)throw new Error(`Composition FPS ${composition.fps} must match render FPS ${RENDER_FPS}`);
 console.log(`[audio] Normalized WAV: 48000 Hz stereo, 1.0x playback; video: ${RENDER_FPS} FPS, ${(composition.durationInFrames/RENDER_FPS).toFixed(3)}s`);
 await renderMedia({composition,serveUrl,inputProps:props,codec:'h264',outputLocation:'render-output/raw.mp4',concurrency:2});
 await renderStill({composition,serveUrl,inputProps:props,output:'render-output/thumbnail.png',frame:Math.min(90,composition.durationInFrames-1)});
 muxBroadcast('render-output/raw.mp4','render-assets/narration.wav','render-output/broadcast.mp4');
 for(const [url,path,type] of [[payload.video_upload_url,'render-output/broadcast.mp4','video/mp4'],[payload.thumbnail_upload_url,'render-output/thumbnail.png','image/png']]){const size=(await stat(path)).size;console.log(`[upload] ${path}: ${size} bytes (${(size/1048576).toFixed(2)} MB) -> starting upload`);const t0=Date.now();const r=await fetch(url,{method:'PUT',headers:{'Content-Type':type},body:await readFile(path)});if(!r.ok)throw new Error(`Media upload failed for ${path} (${r.status}, ${(size/1048576).toFixed(2)} MB): ${(await r.text()).slice(0,300)}`);console.log(`[upload] ${path}: done in ${((Date.now()-t0)/1000).toFixed(1)}s`)}
 await notify({status:'ready',segments:segments.map(({headline,narration,duration_frames,takeaways})=>({headline,narration,duration_frames,takeaways})),two_act_result:{...timing,showdown:edited.script_json.showdown}});
 console.log(`Episode ${payload.episode_id} ready`);
}catch(error){await notify({status:'failed',error:String(error).slice(0,1000)}).catch(()=>console.error('Failure callback could not be delivered'));throw error}
