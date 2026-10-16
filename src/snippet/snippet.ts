import { SNIPPET } from '../config/http';

/**
 * 埋め込みスニペット（/snippet.js）の本体。
 * 訪問者 ID はブラウザ内で生成した乱数を localStorage に保持する（Cookie は使わない）。
 * 割当に従い、payload の selector 要素の文言と背景色を差し替える。goal-selector のクリックで転換を送る。
 * 設定値（保存キー・ID のバイト数）はここで差し込む。
 */
const SNIPPET_TEMPLATE = `
(function () {
  var script = document.currentScript;
  if (!script) {
    console.error('[ab-split] document.currentScript is not available');
    return;
  }
  var publicKey = script.getAttribute('data-key');
  var goalSelector = script.getAttribute('data-goal-selector');
  var endpoint = new URL(script.src).origin;
  var storageKey = '__VISITOR_STORAGE_KEY__';
  var idBytes = __VISITOR_ID_BYTES__;
  var goalName = null;

  function randomHex() {
    var bytes = new Uint8Array(idBytes);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) {
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }

  function visitorId() {
    try {
      var saved = window.localStorage.getItem(storageKey);
      if (saved) { return saved; }
      var fresh = randomHex();
      window.localStorage.setItem(storageKey, fresh);
      return fresh;
    } catch (error) {
      console.error('[ab-split] localStorage is not available; the experiment is skipped', error);
      return null;
    }
  }

  function applyVariant(variant) {
    var payload = variant.payload || {};
    if (!payload.selector) { return; }
    var element = document.querySelector(payload.selector);
    if (!element) {
      console.error('[ab-split] target element was not found', payload.selector);
      return;
    }
    if (payload.text !== undefined) { element.textContent = payload.text; }
    if (payload.color !== undefined) { element.style.backgroundColor = payload.color; }
  }

  function bindGoal(id) {
    if (!goalSelector) { return; }
    document.addEventListener('click', function (event) {
      if (!goalName || !(event.target instanceof Element)) { return; }
      if (!event.target.closest(goalSelector)) { return; }
      fetch(endpoint + '/t/' + publicKey + '/convert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: id, goalName: goalName }),
        keepalive: true
      }).catch(function (error) {
        console.error('[ab-split] convert request failed', error);
      });
    });
  }

  function run() {
    var id = visitorId();
    if (id === null) { return; }
    fetch(endpoint + '/t/' + publicKey + '/assign?visitor_id=' + encodeURIComponent(id))
      .then(function (response) {
        if (!response.ok) { throw new Error('assign responded with ' + response.status); }
        return response.json();
      })
      .then(function (body) {
        goalName = body.goalName;
        if (body.variant) { applyVariant(body.variant); }
        bindGoal(id);
      })
      .catch(function (error) {
        console.error('[ab-split] assign request failed', error);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
`;

/** 配信するスニペットの本文を返す。 */
export function buildSnippetSource(): string {
  return SNIPPET_TEMPLATE.replace('__VISITOR_STORAGE_KEY__', SNIPPET.VISITOR_STORAGE_KEY).replace(
    '__VISITOR_ID_BYTES__',
    String(SNIPPET.VISITOR_ID_BYTES),
  );
}
