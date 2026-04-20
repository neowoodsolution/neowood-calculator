const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function parseSheet(v){ const [w,h] = v.split('x').map(Number); return {w,h,area:w*h,label:`${w} × ${h}`}; }
function fmt(n){ return new Intl.NumberFormat('ko-KR').format(Math.round(n)); }
function areaToM2(v){ return (v/1_000_000).toFixed(2); }
function colorFor(key){ let hash = 0; for(let i=0;i<key.length;i++) hash = ((hash<<5)-hash)+key.charCodeAt(i); const hue = Math.abs(hash)%360; return `hsl(${hue} 72% 78%)`; }
function currentMode(){ return $$('#internalTabs .tab.active')[0]?.dataset.mode || 'floor'; }
function setMode(mode){ $$('#internalTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.mode===mode)); $$('.mode-pane').forEach(p=>p.classList.toggle('active', p.dataset.pane===mode)); }
function addPiece(defaults={w:600,h:300,qty:2}){ const row=document.createElement('div'); row.className='cut-row'; row.innerHTML=`<input type="number" class="piece-w" value="${defaults.w}" placeholder="가로(mm)"><input type="number" class="piece-h" value="${defaults.h}" placeholder="세로(mm)"><input type="number" class="piece-q" value="${defaults.qty}" placeholder="수량"><button class="btn ghost remove-piece" type="button">삭제</button>`; row.querySelector('.remove-piece').onclick=()=>row.remove(); $('#internalPieces').appendChild(row);} 
function groupedPieces(){ const rows=$$('#internalPieces .cut-row'); const pieces=rows.map(r=>({w:Number(r.querySelector('.piece-w').value||0),h:Number(r.querySelector('.piece-h').value||0),qty:Number(r.querySelector('.piece-q').value||0)})).filter(x=>x.w>0&&x.h>0&&x.qty>0); const grouped={}; pieces.forEach(p=>{const k=`${p.w}×${p.h}`; grouped[k]=(grouped[k]||0)+p.qty;}); return {pieces,grouped}; }
function baseLossMultiplier(){ const loss = Number($('#lossRate').value||0); return 1 + (loss/100); }
function extraSheets(){ return Number($('#extraSheets').value||0); }

function calc(){
  const mode=currentMode(); let summary=[]; let grouped={}; let sheet=parseSheet('1220x2440'); let totalArea=0; let sheetCount=0; let totalPieces=0; let wasteLabel='-';
  if(mode==='floor'){
    const w=Number($('#iFloorWidth').value||0), h=Number($('#iFloorHeight').value||0); sheet=parseSheet($('#iFloorSheet').value); totalArea=w*h; sheetCount=Math.ceil((totalArea*baseLossMultiplier())/sheet.area)+extraSheets(); totalPieces=1; grouped={[`${w}×${h}`]:1};
    summary = [['모드','바닥 채움'],['공간 크기',`${fmt(w)} × ${fmt(h)} mm`],['선택 원장',sheet.label],['추천 원장 수',`${fmt(sheetCount)} 장`]];
  }
  if(mode==='wall'){
    const w=Number($('#iWallWidth').value||0), h=Number($('#iWallHeight').value||0); sheet=parseSheet($('#iWallSheet').value); totalArea=w*h; sheetCount=Math.ceil((totalArea*baseLossMultiplier())/sheet.area)+extraSheets(); totalPieces=1; grouped={[`${w}×${h}`]:1};
    summary = [['모드','벽면'],['벽 크기',`${fmt(w)} × ${fmt(h)} mm`],['선택 원장',sheet.label],['추천 원장 수',`${fmt(sheetCount)} 장`]];
  }
  if(mode==='cutlist'){
    const gp=groupedPieces(); grouped=gp.grouped; sheet=parseSheet($('#iCutSheet').value); totalArea=gp.pieces.reduce((s,p)=>s+p.w*p.h*p.qty,0); totalPieces=gp.pieces.reduce((s,p)=>s+p.qty,0); sheetCount=Math.ceil((totalArea*baseLossMultiplier())/sheet.area)+extraSheets();
    wasteLabel = `${$('#kerf').value||0} mm 톱날 손실 참고`;
    summary = [['모드','재단 물량'],['재단 종류 수',`${Object.keys(grouped).length} 종류`],['선택 원장',sheet.label],['예상 원장 수',`${fmt(sheetCount)} 장`]];
  }
  if(mode==='compare'){
    const w=Number($('#iCmpWidth').value||0), h=Number($('#iCmpHeight').value||0); const a=parseSheet($('#iCmpA').value), b=parseSheet($('#iCmpB').value); totalArea=w*h; const sa=Math.ceil((totalArea*baseLossMultiplier())/a.area)+extraSheets(); const sb=Math.ceil((totalArea*baseLossMultiplier())/b.area)+extraSheets(); sheet=sa<=sb?a:b; sheetCount=Math.min(sa,sb); totalPieces=1; grouped={[`${w}×${h}`]:1};
    summary = [['모드','규격 비교'],['규격 A',`${a.label} / ${fmt(sa)} 장`],['규격 B',`${b.label} / ${fmt(sb)} 장`],['추천 규격',sheet.label]];
  }
  return {mode,summary,grouped,sheet,totalArea,sheetCount,totalPieces,wasteLabel};
}

function renderSummary(data){
  $('#kpiArea').textContent = `${areaToM2(data.totalArea)} ㎡`;
  $('#kpiSheets').textContent = `${fmt(data.sheetCount)} 장`;
  $('#kpiPieces').textContent = `${fmt(data.totalPieces)} 개`;
  $('#kpiWaste').textContent = data.wasteLabel;
  $('#internalSummary').innerHTML = data.summary.map(([k,v]) => `<div class="list-item"><strong>${k}</strong><br><span class="small">${v}</span></div>`).join('') + `<div class="list-item"><strong>상담 메모</strong><br><span class="small">${($('#projectMemo').value||'').replace(/\n/g,'<br>')}</span></div>`;
}

function renderGroups(data){
  const tbody=$('#groupTableBody');
  tbody.innerHTML = Object.entries(data.grouped).map(([size,qty])=>`<tr><td>${size}</td><td>${fmt(qty)}</td><td><span class="pill" style="background:${colorFor(size)}">${size}</span></td></tr>`).join('') || `<tr><td colspan="3" class="small">집계할 조각이 없습니다.</td></tr>`;
}

function renderSheets(data){
  const wrap=$('#sheetPreviewGrid');
  const entries = Object.entries(data.grouped);
  const cards = entries.length ? entries : [[`${Math.round(data.sheet.w)}×${Math.round(data.sheet.h)}`, 1]];
  wrap.innerHTML = cards.map(([size,qty],idx)=>{
    const color=colorFor(size); const title=String.fromCharCode(65+idx)+' 패턴';
    const blocks = Array.from({length: Math.min(Number(qty), 6)}).map((_,i)=>{
      const top = 8 + (i%3)*30; const left = 8 + Math.floor(i/3)*48; return `<div class="rect" style="top:${top}%;left:${left}%;width:38%;height:22%;background:${color}">${size}</div>`;
    }).join('');
    return `<div class="sheet-card"><div class="sheet-head"><div class="sheet-title">${title}</div><div class="small">동일 사이즈 묶음 ${fmt(qty)}개</div></div><div class="canvas">${blocks}</div><div class="small" style="margin-top:10px">동일 사이즈는 동일 색상으로 고정했습니다.</div></div>`;
  }).join('');
}

function saveProject(){
  const data = {
    projectName: $('#projectName').value,
    projectCode: $('#projectCode').value,
    lossRate: $('#lossRate').value,
    extraSheets: $('#extraSheets').value,
    memo: $('#projectMemo').value,
    mode: currentMode(),
    values: {
      iFloorWidth: $('#iFloorWidth').value, iFloorHeight: $('#iFloorHeight').value, iFloorSheet: $('#iFloorSheet').value,
      iWallWidth: $('#iWallWidth').value, iWallHeight: $('#iWallHeight').value, iWallSheet: $('#iWallSheet').value,
      iCmpWidth: $('#iCmpWidth').value, iCmpHeight: $('#iCmpHeight').value, iCmpA: $('#iCmpA').value, iCmpB: $('#iCmpB').value,
      iCutSheet: $('#iCutSheet').value, kerf: $('#kerf').value,
      pieces: $$('#internalPieces .cut-row').map(r=>({w:r.querySelector('.piece-w').value,h:r.querySelector('.piece-h').value,qty:r.querySelector('.piece-q').value}))
    }
  };
  localStorage.setItem('nw_internal_project', JSON.stringify(data));
  alert('프로젝트를 브라우저에 저장했습니다.');
}
function loadProject(){
  const raw = localStorage.getItem('nw_internal_project'); if(!raw){ alert('저장된 프로젝트가 없습니다.'); return; }
  const data = JSON.parse(raw);
  $('#projectName').value=data.projectName||''; $('#projectCode').value=data.projectCode||''; $('#lossRate').value=data.lossRate||'5'; $('#extraSheets').value=data.extraSheets||'1'; $('#projectMemo').value=data.memo||'';
  Object.entries(data.values||{}).forEach(([k,v])=>{ if(k==='pieces') return; const el=$('#'+k); if(el) el.value=v; });
  $('#internalPieces').innerHTML=''; (data.values?.pieces||[]).forEach(p=>addPiece({w:p.w,h:p.h,qty:p.qty}));
  setMode(data.mode||'floor');
  alert('저장된 프로젝트를 불러왔습니다.');
}
function saveTxt(){ const d=calc(); const lines=[`프로젝트명: ${$('#projectName').value}`,`코드: ${$('#projectCode').value}`,`모드: ${d.mode}`,`총 면적: ${areaToM2(d.totalArea)} ㎡`,`예상 원장 수: ${d.sheetCount} 장`,'',...d.summary.map(([k,v])=>`${k}: ${v}`),'','사이즈별 집계',...Object.entries(d.grouped).map(([k,v])=>`${k} = ${v}`),'','메모', $('#projectMemo').value]; const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${($('#projectName').value||'project')}_summary.txt`; a.click(); URL.revokeObjectURL(a.href); }
function run(){ const d=calc(); renderSummary(d); renderGroups(d); renderSheets(d); }

function init(){ addPiece({w:600,h:300,qty:4}); addPiece({w:1200,h:600,qty:2}); $$('#internalTabs .tab').forEach(t=>t.onclick=()=>setMode(t.dataset.mode)); $('#addInternalPiece').onclick=()=>addPiece(); $('#runInternalBtn').onclick=run; $('#saveInternalBtn').onclick=saveProject; $('#loadInternalBtn').onclick=loadProject; $('#saveTxtBtn').onclick=saveTxt; }

document.addEventListener('DOMContentLoaded', init);
