/**
 * 画面のクライアント処理（フォーム送信と状態変更）。
 * 文言は data-messages（config/ui.ts 由来）から読む。ダイアログは使わず、画面内に結果を表示する。
 * テンプレート文字列の中で ${ を使わないこと（ハードコード検査と誤補間の防止）。
 */
export const CLIENT_SCRIPT = `
(function () {
  var messages = {};
  try {
    messages = JSON.parse(document.body.getAttribute('data-messages') || '{}');
  } catch (error) {
    console.error('[ab-split] failed to parse data-messages', error);
  }

  function showFeedback(text, isError) {
    var box = document.getElementById('feedback');
    if (!box) { return; }
    box.textContent = text;
    box.className = 'feedback' + (isError ? ' is-error' : '');
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
    Object.keys(variants).sort().forEach(function (key) { body.variants.push(variants[key]); });
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
      if (form.getAttribute('data-redirect') === 'experiment') {
        window.location.assign('/experiments/' + result.json.experiment.id);
        return;
      }
      showFeedback(messages.saved || '', false);
      window.location.reload();
    }).catch(function (error) {
      console.error('[ab-split] submit failed', error);
      showFeedback(messages.failed || '', true);
    });
  });

  document.addEventListener('click', function (event) {
    var target = event.target.closest ? event.target.closest('[data-post-url]') : null;
    if (target) {
      send('POST', target.getAttribute('data-post-url'), JSON.parse(target.getAttribute('data-post-body') || '{}'))
        .then(function (result) {
          if (!result.ok) { showFeedback(errorText(result), true); return; }
          window.location.reload();
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
})();
`;
