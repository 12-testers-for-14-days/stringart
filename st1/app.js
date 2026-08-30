const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $('fileInput'), dropZone: $('dropZone'), chooseBtn: $('chooseBtn'), qualityCard: $('qualityCard'), qualityBadge: $('qualityBadge'),
  qualityTitle: $('qualityTitle'), qualityScore: $('qualityScore'), qualityMeter: $('qualityMeter'), qualityMessage: $('qualityMessage'), checkList: $('checkList'),
  sourceControls: $('sourceControls'), sourceCanvas: $('sourceCanvas'), zoom: $('zoom'), panX: $('panX'), panY: $('panY'), shape: $('shape'), useImageBtn: $('useImageBtn'),
  settingsPanel: $('settingsPanel'), generateBtn: $('generateBtn'), progressWrap: $('progressWrap'), progressLabel: $('progressLabel'), progressPct: $('progressPct'), progressBar: $('progressBar'),
  artCanvas: $('artCanvas'), nailCanvas: $('nailCanvas'), emptyState: $('emptyState'), renderOverlay: $('renderOverlay'), renderOverlayText: $('renderOverlayText'),
  statsBar: $('statsBar'), statNails: $('statNails'), statStrings: $('statStrings'), statCoverage: $('statCoverage'), statScore: $('statScore'),
  exportCard: $('exportCard'), downloadTxt: $('downloadTxt'), downloadJson: $('downloadJson'), sequencePreview: $('sequencePreview'), rerenderBtn: $('rerenderBtn'), resetBtn: $('resetBtn'),
  helpBtn: $('helpBtn'), helpModal: $('helpModal'), modalBackdrop: $('modalBackdrop'), closeModal: $('closeModal'), modalDone: $('modalDone'),
  zoomValue: $('zoomValue'), panXValue: $('panXValue'), panYValue: $('panYValue'), shapeValue: $('shapeValue')
};

const settings = {
  nailCount: $('nailCount'), stringCount: $('stringCount'), lineWeight: $('lineWeight'), contrast: $('contrast'), detail: $('detail'), gap: $('gap'), candidate: $('candidate'),
  styleMode: $('styleMode'), invert: $('invert'), edgeBoost: $('edgeBoost'), skipDark: $('skipDark'),
};

const settingOutputs = {
  nailCount: $('nailCountValue'), stringCount: $('stringCountValue'), lineWeight: $('lineWeightValue'), contrast: $('contrastValue'), detail: $('detailValue'), gap: $('gapValue'), candidate: $('candidateValue')
};

const presets = {
  balanced: {nailCount:220,stringCount:900,lineWeight:1.2,contrast:58,detail:34,gap:8,candidate:70},
  portrait: {nailCount:260,stringCount:1150,lineWeight:1.0,contrast:66,detail:44,gap:7,candidate:78},
  highDetail: {nailCount:340,stringCount:1700,lineWeight:0.9,contrast:74,detail:72,gap:5,candidate:90},
  fast: {nailCount:150,stringCount:550,lineWeight:1.6,contrast:50,detail:20,gap:10,candidate:50}
};

let sourceImage = null;
let workingImage = null;
let qualityState = null;
let lastResult = null;
let analysisToken = 0;

function bindRange(id, formatter=(v)=>v) {
  const input = $(id);
  const out = settingOutputs[id];
  const update = () => { if (out) out.textContent = formatter(input.value); };
  input.addEventListener('input', update); update();
}
bindRange('nailCount', v=>v);
bindRange('stringCount', v=>v);
bindRange('lineWeight', v=>Number(v).toFixed(1));
bindRange('contrast', v=>v);
bindRange('detail', v=>v);
bindRange('gap', v=>v);
bindRange('candidate', v=>`${v}%`);

function updateSourceLabel(){
  els.zoomValue.textContent = `${els.zoom.value}%`;
  els.panXValue.textContent = `${els.panX.value}%`;
  els.panYValue.textContent = `${els.panY.value}%`;
  els.shapeValue.textContent = els.shape.value === 'circle' ? 'Circle' : 'Square';
}
['zoom','panX','panY','shape'].forEach(id=>$(id).addEventListener('input',()=>{updateSourceLabel(); drawSourcePreview();}));
updateSourceLabel();

els.chooseBtn.onclick = () => els.fileInput.click();
els.dropZone.addEventListener('click', (e)=>{ if(!e.target.closest('button')) els.fileInput.click(); });
els.dropZone.addEventListener('dragover', e=>{e.preventDefault(); els.dropZone.style.borderColor='#111827';});
els.dropZone.addEventListener('dragleave', ()=>els.dropZone.style.borderColor='');
els.dropZone.addEventListener('drop', e=>{e.preventDefault(); els.dropZone.style.borderColor=''; const file=e.dataTransfer.files?.[0]; if(file) loadImage(file);});
els.fileInput.addEventListener('change', ()=>{const file=els.fileInput.files?.[0]; if(file) loadImage(file);});

async function loadImage(file){
  if (!file.type.startsWith('image/')) return alert('Please choose an image file.');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    sourceImage = img;
    URL.revokeObjectURL(url);
    els.qualityCard.classList.remove('hidden');
    els.sourceControls.classList.remove('hidden');
    els.settingsPanel.classList.add('hidden');
    els.useImageBtn.disabled = true;
    els.qualityTitle.textContent = 'Analyzing…';
    els.qualityBadge.textContent = 'Checking';
    await assessImage(img);
    drawSourcePreview();
  };
  img.onerror = ()=>alert('That image could not be decoded by this browser.');
  img.src = url;
}

function sampleLuma(canvas, size=256){
  const c = document.createElement('canvas'); c.width=c.height=size;
  const ctx = c.getContext('2d',{willReadFrequently:true});
  const scale = Math.min(size/canvas.width,size/canvas.height);
  ctx.drawImage(canvas,(size-canvas.width*scale)/2,(size-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale);
  const d = ctx.getImageData(0,0,size,size).data;
  const y = new Float32Array(size*size);
  for(let i=0,j=0;i<d.length;i+=4,j++) y[j]=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;
  return {y,size};
}

function imageMetrics(img){
  const size=256; const c=document.createElement('canvas'); c.width=c.height=size; const ctx=c.getContext('2d',{willReadFrequently:true});
  const scale=Math.min(size/img.width,size/img.height); ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.drawImage(img,(size-img.width*scale)/2,(size-img.height*scale)/2,img.width*scale,img.height*scale);
  const {y}=sampleLuma(c,size);
  let mean=0; for(const v of y) mean+=v; mean/=y.length;
  let variance=0; for(const v of y) variance+=(v-mean)**2; variance/=y.length;
  let edges=0; const step=1;
  for(let r=1;r<size-1;r+=2){for(let col=1;col<size-1;col+=2){const i=r*size+col; const gx=y[i+1]-y[i-1], gy=y[i+size]-y[i-size]; edges += Math.hypot(gx,gy);}}
  const n=((size-2)/2)**2; edges/=n;
  return {mean, std:Math.sqrt(variance), edge:edges, width:img.width, height:img.height};
}

async function assessImage(img){
  const m=imageMetrics(img);
  const resolution = Math.min(img.width,img.height);
  const checks=[
    {label:'Resolution', value:resolution>=1000?'Great':resolution>=650?'Okay':'Low', cls:resolution>=1000?'ok':resolution>=650?'warn':'bad'},
    {label:'Contrast', value:m.std>0.20?'Strong':m.std>0.12?'Moderate':'Flat', cls:m.std>0.20?'ok':m.std>0.12?'warn':'bad'},
    {label:'Sharpness', value:m.edge>0.095?'Crisp':m.edge>0.050?'Usable':'Blurry', cls:m.edge>0.095?'ok':m.edge>0.050?'warn':'bad'},
    {label:'Exposure', value:m.mean<0.08||m.mean>0.92?'Extreme':m.mean<0.16||m.mean>0.84?'Challenging':'Balanced', cls:m.mean<0.08||m.mean>0.92?'bad':m.mean<0.16||m.mean>0.84?'warn':'ok'}
  ];
  let score = 0;
  score += Math.min(25, resolution/40);
  score += Math.min(30, m.std*110);
  score += Math.min(30, m.edge*260);
  score += (m.mean>0.10&&m.mean<0.90)?15:8;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const hardFail = m.edge<0.035 || m.std<0.055 || resolution<360;
  qualityState={score,metrics:m,checks,hardFail};
  els.qualityTitle.textContent=hardFail?'Needs a better image':score>=78?'Excellent source':score>=58?'Good source':'Usable with tuning';
  els.qualityBadge.textContent=hardFail?'Low quality':score>=78?'Excellent':score>=58?'Good':'Needs tuning';
  els.qualityScore.textContent=score;
  els.qualityMeter.style.width=`${score}%`;
  els.qualityMessage.textContent=hardFail?'The image is too blurry, low-contrast, or low-resolution for reliable string art. Choose a sharper image with a clearer subject.':score>=78?'This is a strong source for string art. Frame the subject and continue.':'You can still use this image, but simpler shapes and lower detail usually produce a cleaner result.';
  els.checkList.innerHTML=checks.map(c=>`<div class="quality-check"><span>${c.label}</span><span class="${c.cls}">${c.value}</span></div>`).join('');
  els.useImageBtn.disabled=hardFail;
}

function drawSourcePreview(){
  if(!sourceImage)return;
  const c=els.sourceCanvas, ctx=c.getContext('2d'); const s=512;
  ctx.clearRect(0,0,s,s);ctx.fillStyle='#121418';ctx.fillRect(0,0,s,s);
  const zoom=Number(els.zoom.value)/100, px=Number(els.panX.value)/100, py=Number(els.panY.value)/100;
  const base=Math.max(s/sourceImage.width,s/sourceImage.height)*zoom; const w=sourceImage.width*base, h=sourceImage.height*base;
  const x=(s-w)/2+px*s*.35, y=(s-h)/2+py*s*.35;
  ctx.drawImage(sourceImage,x,y,w,h);
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=2;ctx.setLineDash([7,6]);
  if(els.shape.value==='circle'){ctx.beginPath();ctx.arc(s/2,s/2,s*.435,0,Math.PI*2);ctx.stroke();}
  else{ctx.strokeRect(s*.065,s*.065,s*.87,s*.87);}ctx.restore();
}

els.useImageBtn.onclick=()=>{ workingImage=buildWorkingImage(); els.settingsPanel.classList.remove('hidden'); els.useImageBtn.textContent='Image ready ✓'; els.generateBtn.focus(); };

function buildWorkingImage(){
  const size=480; const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
  const zoom=Number(els.zoom.value)/100,px=Number(els.panX.value)/100,py=Number(els.panY.value)/100;
  const base=Math.max(size/sourceImage.width,size/sourceImage.height)*zoom;const w=sourceImage.width*base,h=sourceImage.height*base;
  ctx.drawImage(sourceImage,(size-w)/2+px*size*.35,(size-h)/2+py*size*.35,w,h);
  if(els.shape.value==='circle'){const mask=document.createElement('canvas');mask.width=mask.height=size;const m=mask.getContext('2d');m.beginPath();m.arc(size/2,size/2,size*.46,0,Math.PI*2);m.clip();m.drawImage(c,0,0);ctx.clearRect(0,0,size,size);ctx.drawImage(mask,0,0);}
  return c;
}

$('shape').addEventListener('change',drawSourcePreview);

function applyPreset(name){
  document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));
  const p=presets[name]; for(const [k,v] of Object.entries(p)){settings[k].value=v;settingOutputs[k].textContent=k==='lineWeight'?Number(v).toFixed(1):k==='candidate'?`${v}%`:v;}
}
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));

function makeNails(n){
  const nails=[];const cx=.5,cy=.5,r=.455;
  for(let i=0;i<n;i++){const a=-Math.PI/2+(i/n)*Math.PI*2;nails.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a),angle:a});}
  return nails;
}

function preprocess(canvas){
  const size=128; const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,size,size);
  const d=ctx.getImageData(0,0,size,size).data;const gray=new Float32Array(size*size);
  for(let i=0,j=0;i<d.length;i+=4,j++){gray[j]=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;}
  // Local contrast / edge-aware target darkness.
  const base=gray.slice();const detail=Number(settings.detail.value)/100;const contrast=Number(settings.contrast.value)/100;
  for(let y=1;y<size-1;y++) for(let x=1;x<size-1;x++){
    const i=y*size+x; const blur=(base[i-1]+base[i+1]+base[i-size]+base[i+size]+base[i-1-size]+base[i+1-size]+base[i-1+size]+base[i+1+size])/8;
    const edge=Math.abs(base[i]-blur); let v=0.5+(base[i]-0.5)*(0.65+contrast*.9);
    if(settings.edgeBoost.checked) v -= (edge*detail*1.6);
    gray[i]=Math.max(0,Math.min(1,v));
  }
  // Build integral blur for robust line scoring while keeping per-pixel target.
  const target=new Float32Array(size*size);
  for(let i=0;i<gray.length;i++){let v=1-gray[i]; if(settings.invert.checked) v=1-v; if(settings.skipDark.checked&&v<0.08)v*=0.25; target[i]=Math.max(0,Math.min(1,v));}
  return {target,size};
}

function lineSamples(a,b,size,sampleCount=58){
  const arr=[];for(let s=0;s<sampleCount;s++){const t=(s+.5)/sampleCount;const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;const ix=Math.max(0,Math.min(size-1,Math.floor(x*size)));const iy=Math.max(0,Math.min(size-1,Math.floor(y*size)));arr.push(iy*size+ix);}return arr;
}

function generateStringArt(token){
  const canvas=workingImage; const {target,size}=preprocess(canvas); const n=Number(settings.nailCount.value), maxStrings=Number(settings.stringCount.value);
  const nails=makeNails(n), current=new Float32Array(size*size), sequence=[]; let currentPin=Math.floor(n*.01); const minGap=Number(settings.gap.value); const candidateRatio=Number(settings.candidate.value)/100; const weight=Number(settings.lineWeight.value);
  const candidateLimit=Math.max(28,Math.floor(n*candidateRatio)); const recentMax=Math.max(3,Math.floor(n*.07));
  const recent=[]; let totalGain=0, possible=0;
  let running=0;
  for(let step=0;step<maxStrings;step++){
    if(token!==analysisToken)return null;
    let best=-Infinity,bestPin=-1,bestSamples=null;
    const offsets=[];for(let i=1;i<n;i++) offsets.push(i); // deterministic order for reproducible exports
    // Rotate candidate order to reduce directional bias.
    const start=(step*17)%offsets.length; const ordered=[]; for(let i=0;i<offsets.length;i++) ordered.push(offsets[(start+i)%offsets.length]);
    let scanned=0;
    for(const off of ordered){
      if(scanned++>=candidateLimit)break; const p=(currentPin+off)%n;
      if(p===currentPin)continue;
      let circular=Math.abs(p-currentPin);circular=Math.min(circular,n-circular);if(circular<minGap)continue;
      if(recent.includes(p))continue;
      const samples=lineSamples(nails[currentPin],nails[p],size);
      let gain=0;
      for(const idx of samples){const deficit=target[idx]-current[idx]; if(deficit>0)gain+=deficit;}
      // Favor lines that contribute across the subject and discourage redundant long saturation.
      if(gain>best){best=gain;bestPin=p;bestSamples=samples;}
    }
    if(bestPin<0 || best<0.12)break;
    for(const idx of bestSamples) current[idx]=Math.min(1,current[idx]+0.021*weight);
    sequence.push([currentPin,bestPin]); recent.push(bestPin); if(recent.length>recentMax)recent.shift(); currentPin=bestPin; totalGain+=best;
    if(step%4===0){running=step/maxStrings;setProgress(running,`Building string ${(step+1).toLocaleString()} of ${maxStrings.toLocaleString()}`);}
  }
  possible=sequence.length*nails.length;
  const coverage=Math.min(100, Math.round((sequence.length/maxStrings)*100));
  const score=Math.round(Math.min(99,Math.max(1,(totalGain/(Math.max(1,sequence.length))*100))));
  return {sequence,nails,size,target,coverage,score,canvas,settingsSnapshot:{...Object.fromEntries(Object.entries(settings).map(([k,v])=>[k,v.type==='checkbox'?v.checked:v.value]))},generatedAt:new Date().toISOString(),totalGain};
}

function renderResult(result){
  const canvas=els.artCanvas, ctx=canvas.getContext('2d');const s=800;canvas.width=canvas.height=s;els.nailCanvas.width=els.nailCanvas.height=s;
  ctx.fillStyle = settings.styleMode.value==='technical' ? '#f5f6f7' : '#fdfdfc'; ctx.fillRect(0,0,s,s);
  const pad=s*.045; ctx.save(); if(settings.shape.value==='circle'){ctx.beginPath();ctx.arc(s/2,s/2,s*.455,0,Math.PI*2);ctx.clip();}
  ctx.translate(pad,pad);const inner=s-2*pad;ctx.scale(inner,inner);
  ctx.lineWidth=Math.max(.35,Number(settings.lineWeight.value)*.48);ctx.lineCap='round';ctx.strokeStyle=settings.styleMode.value==='paper'?'rgba(32,32,32,.11)':'rgba(16,18,22,.14)';
  for(let i=0;i<result.sequence.length;i++){const [a,b]=result.sequence[i];const na=result.nails[a],nb=result.nails[b];ctx.beginPath();ctx.moveTo(na.x,na.y);ctx.lineTo(nb.x,nb.y);ctx.stroke();}
  ctx.restore();
  const nctx=els.nailCanvas.getContext('2d');nctx.clearRect(0,0,s,s);nctx.save();nctx.translate(pad,pad);nctx.scale(s-2*pad,s-2*pad);nctx.fillStyle='rgba(20,22,26,.75)';
  const nr=Math.max(.0015,.007-result.nails.length/80000);for(const n of result.nails){nctx.beginPath();nctx.arc(n.x,n.y,nr,0,Math.PI*2);nctx.fill();}nctx.restore();
  els.emptyState.classList.add('hidden');els.artCanvas.classList.remove('hidden');els.nailCanvas.classList.remove('hidden');els.statsBar.classList.remove('hidden');els.exportCard.classList.remove('hidden');els.rerenderBtn.classList.remove('hidden');els.resetBtn.classList.remove('hidden');
  els.statNails.textContent=result.nails.length.toLocaleString();els.statStrings.textContent=result.sequence.length.toLocaleString();els.statCoverage.textContent=`${result.coverage}%`;els.statScore.textContent=`${result.score}/100`;
  els.sequencePreview.textContent=result.sequence.slice(0,40).map((p,i)=>`${String(i+1).padStart(3,'0')}. ${p[0]} → ${p[1]}`).join('\n');
}

function setProgress(f,label){const pct=Math.round(f*100);els.progressPct.textContent=`${pct}%`;els.progressBar.style.width=`${pct}%`;els.progressLabel.textContent=label;}

async function runGeneration(){
  if(!workingImage){alert('Choose and accept an image first.');return;}
  analysisToken++;const token=analysisToken;els.progressWrap.classList.remove('hidden');els.renderOverlay.classList.remove('hidden');els.renderOverlayText.textContent='Generating…';els.generateBtn.disabled=true;
  await new Promise(r=>requestAnimationFrame(r));
  try{const result=generateStringArt(token); if(!result)return;lastResult=result;setProgress(1,`Done · ${result.sequence.length.toLocaleString()} strings`);renderResult(result);}
  catch(err){console.error(err);alert(`Generation failed: ${err.message}`);}finally{els.generateBtn.disabled=false;setTimeout(()=>els.progressWrap.classList.add('hidden'),500);els.renderOverlay.classList.add('hidden');}
}

els.generateBtn.onclick=runGeneration;
els.rerenderBtn.onclick=()=>{if(lastResult)renderResult(lastResult);};
els.resetBtn.onclick=()=>{lastResult=null;analysisToken++;els.emptyState.classList.remove('hidden');els.artCanvas.classList.add('hidden');els.nailCanvas.classList.add('hidden');els.statsBar.classList.add('hidden');els.exportCard.classList.add('hidden');els.rerenderBtn.classList.add('hidden');els.resetBtn.classList.add('hidden');};

function resultFileBase(){return `stringforge-${new Date().toISOString().slice(0,10)}`;}
function downloadBlob(name,type,text){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
els.downloadTxt.onclick=()=>{if(!lastResult)return;const lines=[];lines.push('STRINGFORGE STRING ART RECIPE');lines.push(`Generated: ${lastResult.generatedAt}`);lines.push(`Nails: ${lastResult.nails.length}`);lines.push(`Strings: ${lastResult.sequence.length}`);lines.push('Pin numbering: 0-based, clockwise from the top.');lines.push('');lastResult.sequence.forEach((p,i)=>lines.push(`${String(i+1).padStart(4,'0')}  ${p[0]} -> ${p[1]}`));downloadBlob(`${resultFileBase()}.txt`,'text/plain;charset=utf-8',lines.join('\n'));};
els.downloadJson.onclick=()=>{if(!lastResult)return;const payload={app:'StringForge',version:'1.0',generatedAt:lastResult.generatedAt,nails:lastResult.nails.map((p,i)=>({id:i,x:+p.x.toFixed(6),y:+p.y.toFixed(6),angle:+p.angle.toFixed(6)})),sequence:lastResult.sequence.map(([from,to])=>({from,to})),settings:lastResult.settingsSnapshot,quality:{coverage:lastResult.coverage,score:lastResult.score,totalGain:+lastResult.totalGain.toFixed(4)}};downloadBlob(`${resultFileBase()}.json`,'application/json;charset=utf-8',JSON.stringify(payload,null,2));};

els.helpBtn.onclick=()=>els.helpModal.classList.remove('hidden');[els.modalBackdrop,els.closeModal,els.modalDone].forEach(x=>x.onclick=()=>els.helpModal.classList.add('hidden'));
window.addEventListener('keydown',e=>{if(e.key==='Escape')els.helpModal.classList.add('hidden');});

// Make the page usable immediately with the balanced preset.
applyPreset('balanced');
