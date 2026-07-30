
const TALK_URL = 'https://talk.naver.com/ct/w79ej21?frm=psf';
const STORE_URL = 'https://smartstore.naver.com/neowoodsolution';
const PHONE_URL = 'tel:01023274592';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let latestCalculation = null;
let toastTimer = null;

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
      ['빠른 예상 물량', `${fmt(sheets)} 장`],
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
      ['빠른 예상 물량', `${fmt(sheets)} 장`],
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
      ['빠른 예상 원장 수', `${fmt(sheets)} 장`],
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

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getModeLabel(mode){
  return ({floor:'바닥 물량', wall:'벽면 물량', cutlist:'재단 물량', compare:'규격 비교'})[mode] || '합판 물량';
}

function buildCalculationLines(data){
  const input = data?.payload?.input || {};
  const result = data?.payload?.result || {};

  if(data.mode === 'floor' || data.mode === 'wall'){
    return [
      `계산 유형: ${getModeLabel(data.mode)}`,
      `입력 크기: ${fmt(input.width)} × ${fmt(input.height)}mm`,
      `원장 규격: ${input.sheet}`,
      `빠른 예상 물량: ${fmt(result.sheets)}장`,
      `여유분: ${fmt(input.extra)}장`
    ];
  }

  if(data.mode === 'cutlist'){
    const pieceSummary = (input.pieces || [])
      .map(p => `${fmt(p.w)} × ${fmt(p.h)}mm ${fmt(p.qty)}개`)
      .join(' / ');
    return [
      `계산 유형: ${getModeLabel(data.mode)}`,
      `재단 규격: ${pieceSummary || '입력 내용 확인 필요'}`,
      `원장 규격: ${input.sheet}`,
      `빠른 예상 원장 수: ${fmt(result.sheets)}장`,
      `여유분: ${fmt(input.extra)}장`
    ];
  }

  if(data.mode === 'compare'){
    return [
      `계산 유형: ${getModeLabel(data.mode)}`,
      `입력 크기: ${fmt(input.width)} × ${fmt(input.height)}mm`,
      `${input.a}: ${fmt(result.sheetsA)}장`,
      `${input.b}: ${fmt(result.sheetsB)}장`,
      `우선 검토 규격: ${result.better}`
    ];
  }

  return [`계산 유형: ${getModeLabel(data.mode)}`];
}

function getSelectedReviewItems(){
  return $$('.review-check:checked').map(el => el.value);
}

function buildConsultationMessage(){
  if(!latestCalculation) return '';

  const lines = [
    '[네오우드솔루션 물량 검토 요청]',
    '',
    '■ 빠른 계산 결과',
    ...buildCalculationLines(latestCalculation),
    '',
    '■ 요청사항'
  ];

  const selected = getSelectedReviewItems();
  if(selected.length){
    selected.forEach(item => lines.push(`- ${item}`));
  }else{
    lines.push('- 선택한 요청사항 없음');
  }

  const shippingChecked = Boolean($('#reviewShipping')?.checked);
  if(shippingChecked){
    const address = ($('#shippingAddress')?.value || '').trim();
    lines.push('', '■ 배송지 상세주소', address || '[상세주소를 입력해주세요]');
  }

  lines.push('', '위 계산 결과를 기준으로 상담을 요청드립니다.');
  return lines.join('\n');
}

function updateConsultationPreview(){
  const preview = $('#consultationPreview');
  if(preview) preview.value = buildConsultationMessage();
}

function toggleShippingAddress(){
  const checked = Boolean($('#reviewShipping')?.checked);
  const wrap = $('#shippingAddressWrap');
  if(!wrap) return;
  wrap.hidden = !checked;
  if(!checked){
    const input = $('#shippingAddress');
    if(input) input.value = '';
  }
  updateConsultationPreview();
}

function showToast(message, isError=false){
  const toast = $('#copyToast');
  if(!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = setTimeout(()=> toast.classList.remove('show'), 4200);
}

async function copyText(text){
  if(navigator.clipboard && window.isSecureContext){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch(e){
      console.warn('clipboard api failed', e);
    }
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  helper.setSelectionRange(0, helper.value.length);
  let copied = false;
  try{ copied = document.execCommand('copy'); }catch(e){ console.warn('copy fallback failed', e); }
  helper.remove();
  return copied;
}

async function handleReviewTalk(){
  const selected = getSelectedReviewItems();
  if(!selected.length){
    showToast('상담받고 싶은 항목을 하나 이상 선택해주세요.', true);
    document.querySelector('.review-options')?.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }

  const shippingChecked = Boolean($('#reviewShipping')?.checked);
  const addressInput = $('#shippingAddress');
  if(shippingChecked && !addressInput?.value.trim()){
    showToast('정확한 배송료 안내를 위해 상세주소를 입력해주세요.', true);
    addressInput?.focus();
    return;
  }

  const preview = $('#consultationPreview');
  const message = (preview?.value || buildConsultationMessage()).trim();
  if(!message) return;

  const copyPromise = copyText(message);
  const talkWindow = window.open(TALK_URL, '_blank');
  if(talkWindow) talkWindow.opener = null;
  const copied = await copyPromise;

  if(copied){
    showToast('상담내용이 복사되었습니다. 톡톡 입력창에 붙여넣어 보내주세요.');
  }else{
    preview?.focus();
    preview?.select();
    showToast('자동 복사가 되지 않았습니다. 선택된 내용을 직접 복사해주세요.', true);
  }

  if(!talkWindow){
    window.location.href = TALK_URL;
  }

  await logEvent('click_review_talk', latestCalculation.mode, {
    review_items:selected,
    shipping_requested:shippingChecked,
    address_provided:shippingChecked && Boolean(addressInput?.value.trim())
  });
}

function bindReviewPanel(){
  $$('.review-check').forEach(el => el.addEventListener('change', ()=> {
    if(el.id === 'reviewShipping') toggleShippingAddress();
    else updateConsultationPreview();
  }));
  $('#shippingAddress')?.addEventListener('input', updateConsultationPreview);
  $('#copyTalkBtn')?.addEventListener('click', handleReviewTalk);
  updateConsultationPreview();
}

function renderResult(data){
  latestCalculation = data;

  const groupHtml = data.groups ? `
    <div class="result-card">
      <h3>재단 종류 요약</h3>
      <div class="group-list">
        ${Object.entries(data.groups).map(([k,v])=>`
          <div class="group-item">
            <strong>${escapeHtml(k)}</strong>
            <div class="small">총 ${fmt(v)}개</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  $('#resultArea').innerHTML = `
    <div class="result-card quick-result-card">
      <div class="result-title-row">
        <div>
          <span class="result-kicker">빠른 예상 물량</span>
          <h3>${escapeHtml(data.title)}</h3>
        </div>
        <span class="result-reference">면적 기준 참고값</span>
      </div>
      <div class="small">${escapeHtml(data.summary)}</div>
      <div class="result-grid">
        ${data.items.map(([k,v])=>`
          <div class="result-item">
            <span class="label">${escapeHtml(k)}</span>
            <span class="value">${escapeHtml(v)}</span>
          </div>
        `).join('')}
      </div>
      <div class="result-note">
        현재 결과는 입력 면적과 원장 규격을 기준으로 계산한 참고 수량입니다. 실제 필요 수량은 재단 규격, 배치 방향과 자투리 활용 여부에 따라 달라질 수 있습니다.
      </div>
      <div class="result-actions compact-actions">
        <button class="btn btn-line" id="resultPhoneBtn" type="button">전화 상담</button>
        <button class="btn btn-fill" id="resultStoreBtn" type="button">스토어 보기</button>
      </div>
    </div>
    ${groupHtml}
    <div class="review-card">
      <div class="review-head review-head-emphasis">
        <span class="review-eyebrow">전문가 상담 연결</span>
        <h3 class="review-main-title">정밀 물량 검토</h3>
        <p>빠른 계산 결과를 바탕으로 원장 배치와 자투리 활용 가능성을 확인하고, 실제 발주에 적합한 수량과 대안을 함께 검토합니다.</p>
      </div>

      <section class="review-step" aria-labelledby="reviewStep1Title">
        <div class="review-step-head">
          <span class="review-step-number">1단계</span>
          <h4 id="reviewStep1Title">이 물량, 더 경제적으로 검토해볼까요?</h4>
        </div>
        <p class="review-step-desc">필요한 검토 항목을 선택해주세요. 여러 항목을 함께 선택할 수 있습니다.</p>

        <div class="review-options" aria-label="정밀 검토 요청사항">
          <label class="review-option">
            <input class="review-check" type="checkbox" value="예상 수량이 적절한지 확인">
            <span>예상 수량이 적절한지 확인</span>
          </label>
          <label class="review-option">
            <input class="review-check" type="checkbox" value="자투리 활용 가능성 검토">
            <span>자투리 활용 가능성 검토</span>
          </label>
          <label class="review-option">
            <input class="review-check" type="checkbox" value="배치도·재단도 제공 가능 여부 확인">
            <span>배치도·재단도 제공 가능 여부</span>
          </label>
          <label class="review-option">
            <input class="review-check" type="checkbox" value="합판 종류·두께 상담">
            <span>합판 종류·두께 상담</span>
          </label>
          <label class="review-option">
            <input class="review-check" id="reviewShipping" type="checkbox" value="배송비 확인">
            <span>배송비 확인</span>
          </label>
        </div>

        <div class="shipping-address" id="shippingAddressWrap" hidden>
          <label for="shippingAddress">
            <span>배송지 상세주소</span>
            <input id="shippingAddress" type="text" autocomplete="street-address" placeholder="예: 서울 성동구 왕십리로 63, 하차 위치">
          </label>
          <p>정확한 차량 배송료 안내를 위해 도로명주소와 상세 위치를 입력해주세요.</p>
        </div>
      </section>

      <section class="review-step" aria-labelledby="reviewStep2Title">
        <div class="review-step-head">
          <span class="review-step-number">2단계</span>
          <h4 id="reviewStep2Title">상담내용 수정 및 최종 확인</h4>
        </div>
        <p class="review-step-desc">계산 결과와 선택 항목이 자동으로 작성됩니다. 필요한 내용을 자유롭게 수정해주세요.</p>
        <details class="message-preview" open>
          <summary>상담내용 확인·수정</summary>
          <textarea id="consultationPreview" rows="13" aria-label="네이버 톡톡에 복사될 상담 내용"></textarea>
        </details>
      </section>

      <section class="review-step review-step-final" aria-labelledby="reviewStep3Title">
        <div class="review-step-head">
          <span class="review-step-number">3단계</span>
          <h4 id="reviewStep3Title">상담내용을 복사하여 네이버 톡톡에 전달</h4>
        </div>
        <p class="review-step-desc">아래 버튼을 누른 뒤 열린 톡톡 입력창에 상담내용을 붙여넣어 보내주세요.</p>
        <button class="btn btn-fill review-submit" id="copyTalkBtn" type="button">상담내용 복사 후 네이버 톡톡 열기</button>
        <p class="review-help">PC는 Ctrl+V, 모바일은 입력창을 길게 눌러 ‘붙여넣기’를 선택하면 됩니다.</p>
      </section>

      <p class="review-disclaimer">현장 조건에 따라 수량이 줄거나 같을 수 있으며, 재단 손실 때문에 늘어날 수도 있습니다. 상세 배치도·재단도는 구매 조건과 프로젝트 규모에 따라 안내됩니다.</p>
    </div>
  `;

  $('#resultPhoneBtn').addEventListener('click', handlePhone);
  $('#resultStoreBtn').addEventListener('click', handleStore);
  bindReviewPanel();
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
