import { PENDING_FEEDBACK_STORAGE_KEY, VARIANT_INDEX_PLACEHOLDER } from '../config/ui';

/**
 * 画面のクライアント処理（フォーム送信と状態変更）。
 * 文言は data-messages（config/ui.ts 由来）から読む。ダイアログは使わず、画面内に結果を表示する。
 * テンプレート文字列の中で ${ を使わないこと（ハードコード検査と誤補間の防止）。
 */
export const CLIENT_SCRIPT = (`
(function () {
  var messages = {};
  try {
    messages = JSON.parse(document.body.getAttribute('data-messages') || '{}');
  } catch (error) {
    console.error('[ab-split] failed to parse data-messages', error);
  }

  var pendingKey = '__PENDING_KEY__';
  var indexPlaceholder = '__INDEX_PLACEHOLDER__';

  function showFeedback(text, isError) {
    var box = document.getElementById('feedback');
    if (!box) { return; }
    box.textContent = text;
    box.className = 'feedback' + (isError ? ' is-error' : '');
  }

  function fill(template, values) {
    return Object.keys(values).reduce(function (text, name) {
      return text.split('{' + name + '}').join(String(values[name]));
    }, template || '');
  }

  // 再読み込みの後でも成功メッセージが見えるよう、sessionStorage 経由で渡す。
  function showPendingFeedback() {
    try {
      var pending = window.sessionStorage.getItem(pendingKey);
      if (pending) {
        window.sessionStorage.removeItem(pendingKey);
        showFeedback(pending, false);
      }
    } catch (error) {
      console.error('[ab-split] pending feedback is not readable', error);
    }
  }

  function rememberAndGo(text, go) {
    try {
      window.sessionStorage.setItem(pendingKey, text);
    } catch (error) {
      // 保存できないときは、画面を切り替えずにその場で結果を示す。
      console.error('[ab-split] pending feedback could not be stored; showing it in place', error);
      showFeedback(text, false);
      return;
    }
    go();
  }

  function successText(api, json) {
    if (api.indexOf('/simulate') !== -1) {
      var text = fill(messages.simulatedSummary, {
        processed: json.processedVisitors,
        conversions: json.conversions,
      });
      return json.stoppedByLimit ? text + ' ' + (messages.simulatedStopped || '') : text;
    }
    return messages.saved || '';
  }

  function variantList() {
    return document.querySelector('[data-variant-list]');
  }

  function addVariant() {
    var list = variantList();
    var template = document.querySelector('[data-variant-template]');
    if (!list || !template) {
      console.error('[ab-split] variant list or template is missing');
      return;
    }
    var max = Number(list.getAttribute('data-max-variants'));
    if (list.querySelectorAll('[data-variant-row]').length >= max) {
      showFeedback(messages.variantMax || '', true);
      return;
    }
    var next = Number(list.getAttribute('data-next-index'));
    list.insertAdjacentHTML('beforeend', template.innerHTML.split(indexPlaceholder).join(String(next)));
    list.setAttribute('data-next-index', String(next + 1));
  }

  function removeVariant(button) {
    var list = variantList();
    var row = button.closest ? button.closest('[data-variant-row]') : null;
    if (!list || !row) {
      console.error('[ab-split] variant row was not found');
      return;
    }
    var min = Number(list.getAttribute('data-min-variants'));
    if (list.querySelectorAll('[data-variant-row]').length <= min) {
      showFeedback(messages.variantMin || '', true);
      return;
    }
    row.parentNode.removeChild(row);
  }

  function numeric(value) {
    return value.trim() === '' ? value : Number(value);
  }

  function collectExperiment(form) {
    var body = { variants: [] };
    var variants = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) { return; }
      var match = /^v(\\d+)\\.(\\w+)$/.exec(el.name);
      if (match) {
        var index = Number(match[1]);
        variants[index] = variants[index] || { payload: {} };
        var field = match[2];
        if (field === 'weight') {
          variants[index].weight = numeric(el.value);
        } else if (field === 'selector' || field === 'text' || field === 'color') {
          if (el.value !== '') { variants[index].payload[field] = el.value; }
        } else {
          variants[index][field] = el.value;
        }
        return;
      }
      if (el.name === 'minSample') {
        body.minSample = numeric(el.value);
        return;
      }
      body[el.name] = el.value;
    });
    Object.keys(variants).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (key) { body.variants.push(variants[key]); });
    return body;
  }

  function collectSimulation(form) {
    var body = { conversionRates: {} };
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name === 'visitorCount') {
        body.visitorCount = numeric(el.value);
      } else if (el.name.indexOf('rate-') === 0) {
        body.conversionRates[el.name.slice(5)] = numeric(el.value);
      }
    });
    return body;
  }

  function send(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (json) {
        return { ok: response.ok, json: json };
      });
    });
  }

  function errorText(result) {
    var message = result.json && result.json.error ? result.json.error.message : '';
    return (messages.failed || '') + (message ? ' ' + message : '');
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    var api = form.getAttribute('data-api');
    if (!api) { return; }
    event.preventDefault();
    var parts = api.split(' ');
    var body = form.getAttribute('data-collect') === 'simulation' ? collectSimulation(form) : collectExperiment(form);
    send(parts[0], parts[1], body).then(function (result) {
      if (!result.ok) { showFeedback(errorText(result), true); return; }
      var text = successText(api, result.json);
      if (form.getAttribute('data-redirect') === 'experiment') {
        rememberAndGo(text, function () {
          window.location.assign('/experiments/' + result.json.experiment.id);
        });
        return;
      }
      rememberAndGo(text, function () { window.location.reload(); });
    }).catch(function (error) {
      console.error('[ab-split] submit failed', error);
      showFeedback(messages.failed || '', true);
    });
  });

  document.addEventListener('click', function (event) {
    var add = event.target.closest ? event.target.closest('[data-variant-add]') : null;
    if (add) {
      addVariant();
      return;
    }
    var remove = event.target.closest ? event.target.closest('[data-variant-remove]') : null;
    if (remove) {
      removeVariant(remove);
      return;
    }
    var target = event.target.closest ? event.target.closest('[data-post-url]') : null;
    if (target) {
      send('POST', target.getAttribute('data-post-url'), JSON.parse(target.getAttribute('data-post-body') || '{}'))
        .then(function (result) {
          if (!result.ok) { showFeedback(errorText(result), true); return; }
          rememberAndGo(messages.started || '', function () { window.location.reload(); });
        })
        .catch(function (error) {
          console.error('[ab-split] status change failed', error);
          showFeedback(messages.failed || '', true);
        });
      return;
    }
    var copy = event.target.closest ? event.target.closest('[data-copy-target]') : null;
    if (copy) {
      var source = document.getElementById(copy.getAttribute('data-copy-target'));
      if (source && navigator.clipboard) {
        navigator.clipboard.writeText(source.textContent).then(function () {
          showFeedback(messages.copied || '', false);
        });
      }
    }
  });
  showPendingFeedback();
})();
`)
  .split('__PENDING_KEY__').join(PENDING_FEEDBACK_STORAGE_KEY)
  .split('__INDEX_PLACEHOLDER__').join(VARIANT_INDEX_PLACEHOLDER);
