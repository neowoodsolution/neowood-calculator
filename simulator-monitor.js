(() => {
  'use strict';

  if (window.__NEOWOOD_SIMULATOR_MONITOR__) return;
  window.__NEOWOOD_SIMULATOR_MONITOR__ = true;

  const VERSION = '1.0.0';
  const MODE = 'simulator';
  const SHAPE_LABELS = {
    rectangle: '직사각형',
    circle: '원형',
    triangle: '직각삼각형',
    trapezoid: '사다리꼴',
    lshape: 'ㄱ자형',
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let started = false;
  let debounceTimer = null;
  let lastSignature = '';
  let runNumber = Number(sessionStorage.getItem('nw_simulator_run_count') || '0');

  function uuid(prefix) {
    const random = globalThis.crypto?.randomUUID?.().slice(0, 8)
      || Math.random().toString(36).slice(2, 10);
    return `${prefix}_${random}`;
  }

  function getAnonId() {
    let id = localStorage.getItem('nw_anon_id');
    if (!id) {
      id = uuid('anon');
      localStorage.setItem('nw_anon_id', id);
    }
    return id;
  }

  function getSessionId() {
    let id = sessionStorage.getItem('nw_session_id');
    if (!id) {
      id = uuid('sess');
      sessionStorage.setItem('nw_session_id', id);
    }
    return id;
  }

  function numberValue(id, fallback = 0) {
    const value = Number($(`#${id}`)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function textValue(id, fallback = '') {
    return String($(`#${id}`)?.value ?? fallback).trim();
  }

  function activeShape() {
    return $('.shape-choice-live.active')?.dataset.shape
      || $('.shape-choice-live[aria-pressed="true"]')?.dataset.shape
      || 'rectangle';
  }

  function sheetDimensions(sheet) {
    const match = String(sheet || '').match(/(\d+)x(\d+)/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  function shapeDimensions(shape) {
    if (shape === 'circle') {
      const diameter = numberValue('circleDiameter');
      return {
        width: diameter,
        height: diameter,
        values: { diameter },
        summary: `지름 ${diameter.toLocaleString('ko-KR')}mm`,
      };
    }
    if (shape === 'triangle') {
      const base = numberValue('triangleBase');
      const height = numberValue('triangleHeight');
      return {
        width: base,
        height,
        values: { base, height, direction: textValue('triangleDirection') },
        summary: `${base.toLocaleString('ko-KR')} × ${height.toLocaleString('ko-KR')}mm`,
      };
    }
    if (shape === 'trapezoid') {
      const top = numberValue('trapTop');
      const bottom = numberValue('trapBottom');
      const height = numberValue('trapHeight');
      return {
        width: Math.max(top, bottom),
        height,
        values: { top, bottom, height, align: textValue('trapAlign') },
        summary: `윗변 ${top.toLocaleString('ko-KR')} / 아랫변 ${bottom.toLocaleString('ko-KR')} / 높이 ${height.toLocaleString('ko-KR')}mm`,
      };
    }
    if (shape === 'lshape') {
      const outerWidth = numberValue('lOuterWidth');
      const outerHeight = numberValue('lOuterHeight');
      const notchWidth = numberValue('lNotchWidth');
      const notchHeight = numberValue('lNotchHeight');
      return {
        width: outerWidth,
        height: outerHeight,
        values: {
          outer_width: outerWidth,
          outer_height: outerHeight,
          notch_width: notchWidth,
          notch_height: notchHeight,
          notch_position: textValue('lNotchPosition'),
        },
        summary: `전체 ${outerWidth.toLocaleString('ko-KR')} × ${outerHeight.toLocaleString('ko-KR')}mm · 파임 ${notchWidth.toLocaleString('ko-KR')} × ${notchHeight.toLocaleString('ko-KR')}mm`,
      };
    }

    const width = numberValue('rectWidth');
    const height = numberValue('rectHeight');
    return {
      width,
      height,
      values: { width, height },
      summary: `${width.toLocaleString('ko-KR')} × ${height.toLocaleString('ko-KR')}mm`,
    };
  }

  function buildSnapshot() {
    const shape = activeShape();
    const dimensions = shapeDimensions(shape);
    const sheet = textValue('sheetSize', 'none');
    const sheetSize = sheetDimensions(sheet);
    let sheetFit = null;

    if (sheetSize && dimensions.width > 0 && dimensions.height > 0) {
      sheetFit = (
        (dimensions.width <= sheetSize.width && dimensions.height <= sheetSize.height)
        || (dimensions.width <= sheetSize.height && dimensions.height <= sheetSize.width)
      );
    }

    const quantity = Math.max(1, Math.round(numberValue('quantity', 1)));
    return {
      shape,
      shape_label: SHAPE_LABELS[shape] || shape,
      quantity,
      sheet,
      sheet_label: sheet === 'none' ? '비교하지 않음' : sheet.replace('x', ' × ') + 'mm',
      sheet_fit: sheetFit,
      fit_label: sheetFit == null ? '비교 안 함' : (sheetFit ? '원장 내 적합' : '원장 초과'),
      dimensions: dimensions.values,
      dimensions_summary: dimensions.summary,
      outer_width: dimensions.width,
      outer_height: dimensions.height,
      complex_shape: ['circle', 'triangle', 'trapezoid', 'lshape'].includes(shape),
    };
  }

  function meta() {
    return {
      estimator_type: 'shape_simulator',
      estimator_version: VERSION,
      engine_name: 'neowood-shape-simulator',
      page_path: location.pathname,
      simulator_run_number: runNumber,
    };
  }

  function send(eventType, payload = {}) {
    const body = JSON.stringify({
      anon_id: getAnonId(),
      session_id: getSessionId(),
      event_type: eventType,
      mode: MODE,
      payload: { ...payload, meta: meta() },
      referrer: document.referrer || null,
    });

    fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch((error) => console.warn('simulator analytics failed', error));
  }

  function ensureStarted(trigger = 'input') {
    if (started) return;
    started = true;
    send('simulator_start', { trigger, snapshot: buildSnapshot() });
  }

  function recordRun(trigger = 'input') {
    ensureStarted(trigger);
    const snapshot = buildSnapshot();
    const signature = JSON.stringify(snapshot);
    if (signature === lastSignature) return;
    lastSignature = signature;
    runNumber += 1;
    sessionStorage.setItem('nw_simulator_run_count', String(runNumber));
    send('simulator_run', { trigger, input: snapshot });
  }

  function scheduleRun(trigger = 'input') {
    ensureStarted(trigger);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => recordRun(trigger), 900);
  }

  function bind() {
    send('page_view', { page_kind: 'shape_simulator' });

    $$('.shape-choice-live[data-shape]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureStarted('shape_select');
        setTimeout(() => {
          const snapshot = buildSnapshot();
          send('simulator_shape_select', {
            shape: snapshot.shape,
            shape_label: snapshot.shape_label,
          });
          scheduleRun('shape_select');
        }, 0);
      });
    });

    $$('input, select').forEach((field) => {
      field.addEventListener('change', () => scheduleRun('change'));
      field.addEventListener('input', () => scheduleRun('input'));
    });

    $('#downloadPngBtn')?.addEventListener('click', () => {
      recordRun('png_download');
      send('simulator_download_png', { input: buildSnapshot() });
    });

    $('#copyTalkBtn')?.addEventListener('click', () => {
      recordRun('talk_click');
      send('simulator_click_talk', { input: buildSnapshot(), target: 'naver_talk' });
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href*="index.html#calculator"], a[href="#calculator"]');
      if (!link) return;
      recordRun('return_calculator');
      send('simulator_return_calculator', { input: buildSnapshot(), target: 'calculator' });
    });

    // 초기값만 본 방문은 실행으로 잡지 않고, 실제 조작부터 기록합니다.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
