
const TALK_URL = 'https://talk.naver.com/ct/w79ej21?frm=psf';
const STORE_URL = 'https://smartstore.naver.com/neowoodsolution';
const PHONE_URL = 'tel:01023274592';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function parseSheet(v){
  const [w,h] = v.split('x').map(Number);
  return {w,h,area:w*h,label:`${w} × ${h}`};
}
function fmt(n){ return new Intl.NumberFormat('ko-KR').format(Math.round(Number(n) || 0)); }
function areaToM2(v){ return (Number(v||0) / 1_000_000).toFixed(2); }
function todayKey(){ return new Date().toISOString().slice(0,10); }

function getAnonId(){
  let id = localStorage.getItem('nw_anon_id');
  if(!id){
    id = 'anon_' + crypto.randomUUID().slice(0,8);
    localStorage.setItem('nw_anon_id', id);
  }
  return id;
}
function getSessionId(){
  let id = sessionStorage.getItem('nw_session_id');
  if(!id){
    id = 'sess_' + crypto.randomUUID().slice(0,8);
    sessionStorage.setItem('nw_session_id', id);
  }
  return id;
}
function getDailyCount(){ return Number(localStorage.getItem('nw_daily_'+todayKey()) || '0'); }
function incDailyCount(){
  const key='nw_daily_'+todayKey();
  const next = getDailyCount()+1;
  localStorage.setItem(key,String(next));
  return next;
}

function setMode(mode){
  $$('#modeTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.mode===mode));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.dataset.pane===mode));
  window.currentMode = mode;
}

async function logEvent(event_type, mode, payload={}){
  try{
    await fetch('/api/log', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        anon_id:getAnonId(),
        session_id:getSessionId(),
        event_type,
        mode,
        payload,
        referrer: document.referrer || null
      })
    });
  }catch(e){
    console.warn('log failed', e);
  }
}

function addCutRow(container, defaults={w:600,h:300,qty:2}){
  const row = document.createElement('div');
  row.className = 'cut-row';
  row.innerHTML = `
    <label class="cut-field">
      <span>재단 가로(mm)</span>
      <input type="number" class="piece-w" value="${defaults.w}" placeholder="예: 900" aria-label="재단 가로(mm)">
    </label>
    <label class="cut-field">
      <span>재단 세로(mm)</span>
      <input type="number" class="piece-h" value="${defaults.h}" placeholder="예: 1800" aria-label="재단 세로(mm)">
    </label>
    <label class="cut-field">
      <span>수량</span>
      <input type="number" class="piece-q" value="${defaults.qty}" placeholder="예: 20" aria-label="수량">
    </label>
    <button class="btn btn-soft remove-piece" type="button">삭제</button>`;
  row.querySelector('.remove-piece').addEventListener('click', ()=> row.remove());
  container.appendChild(row);
}

function calcFloor(){
  const w = Number($('#floorWidth').value||0);
  const h = Number($('#floorHeight').value||0);
  const extra = Number($('#floorExtra').value||0);
  const sheet = parseSheet($('#floorSheet').value);
  const area = w*h;
  const sheets = Math.ceil(area / sheet.area) + extra;
  return {
    title:'바닥 채움 결과',
    mode:'floor',
    summary:`${w} × ${h} 공간을 ${sheet.label} 기준으로 계산했습니다.`,
    items:[
      ['총 면적', `${areaToM2(area)} ㎡`],
      ['예상 필요 수량', `${fmt(sheets)} 장`],
      ['선택 규격', sheet.label],
      ['여유분 포함', `${extra} 장 추가`]
    ],
    payload:{input:{width:w,height:h,sheet:sheet.label,extra}, result:{area, sheets}}
  };
}

function calcWall(){
  const w = Number($('#wallWidth').value||0);
  const h = Number($('#wallHeight').value||0);
  const extra = Number($('#wallExtra').value||0);
  const sheet = parseSheet($('#wallSheet').value);
  const area = w*h;
  const sheets = Math.ceil(area / sheet.area) + extra;
  return {
    title:'벽면 계산 결과',
    mode:'wall',
    summary:`${w} × ${h} 벽면을 ${sheet.label} 기준으로 계산했습니다.`,
    items:[
      ['총 면적', `${areaToM2(area)} ㎡`],
      ['예상 필요 수량', `${fmt(sheets)} 장`],
      ['선택 규격', sheet.label],
      ['여유분 포함', `${extra} 장 추가`]
    ],
    payload:{input:{width:w,height:h,sheet:sheet.label,extra}, result:{area, sheets}}
  };
}

function calcCutlist(){
  const rows = $$('#cutPieces .cut-row');
  const pieces = rows.map(r=>({
    w:Number(r.querySelector('.piece-w').value||0),
    h:Number(r.querySelector('.piece-h').value||0),
    qty:Number(r.querySelector('.piece-q').value||0)
  })).filter(x=>x.w>0&&x.h>0&&x.qty>0);

  const sheet = parseSheet($('#cutSheet').value);
  const extra = Number($('#cutExtra').value||0);
  const totalArea = pieces.reduce((s,p)=> s + p.w*p.h*p.qty, 0);
  const sheets = Math.ceil(totalArea / sheet.area) + extra;
  const grouped = {};
  pieces.forEach(p => {
    const k = `${p.w} × ${p.h}`;
    grouped[k] = (grouped[k]||0) + p.qty;
  });
  return {
    title:'재단 수량 결과',
    mode:'cutlist',
    summary:`입력한 재단 물량을 ${sheet.label} 원장 기준으로 환산했습니다.`,
    items:[
      ['총 재단 면적', `${areaToM2(totalArea)} ㎡`],
      ['예상 원장 수', `${fmt(sheets)} 장`],
      ['선택 규격', sheet.label],
      ['재단 종류 수', `${Object.keys(grouped).length} 종류`]
    ],
    groups: grouped,
    payload:{input:{pieces,sheet:sheet.label,extra}, result:{totalArea, sheets, grouped}}
  };
}

function calcCompare(){
  const w = Number($('#cmpWidth').value||0);
  const h = Number($('#cmpHeight').value||0);
  const a = parseSheet($('#cmpA').value);
  const b = parseSheet($('#cmpB').value);
  const area = w*h;
  const sheetsA = Math.ceil(area / a.area);
  const sheetsB = Math.ceil(area / b.area);
  const better = sheetsA < sheetsB ? a.label : sheetsB < sheetsA ? b.label : '동일';
  return {
    title:'규격 비교 결과',
    mode:'compare',
    summary:'같은 면적 기준으로 두 규격의 예상 장수를 비교했습니다.',
    items:[
      [`${a.label}`, `${fmt(sheetsA)} 장`],
      [`${b.label}`, `${fmt(sheetsB)} 장`],
      ['총 면적', `${areaToM2(area)} ㎡`],
      ['우선 검토 규격', better]
    ],
    payload:{input:{width:w,height:h,a:a.label,b:b.label}, result:{area, sheetsA, sheetsB, better}}
  };
}

function renderResult(data){
  const groupHtml = data.groups ? `
    <div class="result-card">
      <h3>재단 종류 요약</h3>
      <div class="group-list">
        ${Object.entries(data.groups).map(([k,v])=>`
          <div class="group-item">
            <strong>${k}</strong>
            <div class="small">총 ${fmt(v)}개</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  $('#resultArea').innerHTML = `
    <div class="result-card">
      <h3>${data.title}</h3>
      <div class="small">${data.summary}</div>
      <div class="result-grid">
        ${data.items.map(([k,v])=>`
          <div class="result-item">
            <span class="label">${k}</span>
            <span class="value">${v}</span>
          </div>
        `).join('')}
      </div>
      <div class="result-note">
        기본 계산은 참고용으로 활용하시고, 발주 전에는 재단 여부와 배송 조건을 함께 확인하시는 것을 권장드립니다.
      </div>
      <div class="result-actions">
        <button class="btn btn-line" id="resultConsultBtn" type="button">톡톡 상담</button>
        <button class="btn btn-line" id="resultPhoneBtn" type="button">전화 상담</button>
        <button class="btn btn-fill" id="resultStoreBtn" type="button">스토어 보기</button>
      </div>
    </div>
    ${groupHtml}
  `;

  $('#resultConsultBtn').addEventListener('click', handleConsult);
  $('#resultPhoneBtn').addEventListener('click', handlePhone);
  $('#resultStoreBtn').addEventListener('click', handleStore);
}

async function runCalc(){
  const mode = window.currentMode || 'floor';
  let result;
  if(mode==='floor') result = calcFloor();
  if(mode==='wall') result = calcWall();
  if(mode==='cutlist') result = calcCutlist();
  if(mode==='compare') result = calcCompare();

  renderResult(result);
  const count = incDailyCount();
  $('#todayCount').textContent = String(count);
  await logEvent('calculate', mode, result.payload);
}

async function handleConsult(){
  await logEvent('click_consult', window.currentMode || 'landing', {target:'naver_talk'});
  window.open(TALK_URL, '_blank', 'noopener');
}
async function handleStore(){
  await logEvent('click_store', window.currentMode || 'landing', {target:'smartstore'});
  window.open(STORE_URL, '_blank', 'noopener');
}
async function handlePhone(){
  await logEvent('click_phone', window.currentMode || 'landing', {target:'phone'});
  window.location.href = PHONE_URL;
}

function bindClick(id, handler){
  const el = document.getElementById(id);
  if(el) el.addEventListener('click', handler);
}

function init(){
  addCutRow($('#cutPieces'), {w:600,h:300,qty:4});
  addCutRow($('#cutPieces'), {w:1200,h:600,qty:2});

  $('#sessionShort').textContent = getAnonId();
  $('#todayCount').textContent = String(getDailyCount());

  $$('#modeTabs .tab').forEach(t => t.addEventListener('click', ()=> setMode(t.dataset.mode)));
  $$('.mode-btn').forEach(btn => btn.addEventListener('click', ()=> {
    setMode(btn.dataset.target);
    document.getElementById('calculator').scrollIntoView({behavior:'smooth', block:'start'});
  }));

  $('#addPieceBtn').addEventListener('click', ()=> addCutRow($('#cutPieces')));
  $('#runCalcBtn').addEventListener('click', runCalc);

  [
    'heroConsultBtn','heroConsultBtn2','consultBtn','premiumConsultBtn','footerConsultBtn'
  ].forEach(id => bindClick(id, handleConsult));

  [
    'heroStoreBtn','storeBtn','footerStoreBtn'
  ].forEach(id => bindClick(id, handleStore));

  [
    'heroPhoneBtn','heroPhoneBtn2','phoneBtn','premiumPhoneBtn','footerPhoneBtn'
  ].forEach(id => bindClick(id, handlePhone));

  logEvent('page_view', 'landing', {page:'index'});
}

document.addEventListener('DOMContentLoaded', init);
