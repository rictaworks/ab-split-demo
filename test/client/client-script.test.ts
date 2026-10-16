import { runClient, simulationForm } from '../support/client-harness';
import { UI_TEXT } from '../../src/config/ui';
import { PENDING_FEEDBACK_STORAGE_KEY } from '../../src/config/ui';

const MESSAGES: Record<string, string> = {
  saved: UI_TEXT.client.saved,
  started: UI_TEXT.client.started,
  simulated: UI_TEXT.client.simulated,
  simulatedSummary: UI_TEXT.client.simulatedSummary,
  simulatedStopped: UI_TEXT.client.simulatedStopped,
  failed: UI_TEXT.client.failed,
  copied: UI_TEXT.client.copied,
  variantMin: UI_TEXT.client.variantMin,
  variantMax: UI_TEXT.client.variantMax,
};

function submitEvent(target: unknown): { target: unknown; preventDefault: jest.Mock } {
  return { target, preventDefault: jest.fn() };
}

describe('クライアント処理: 模擬トラフィックの結果表示（要修正 5）', () => {
  it('成功時に処理件数と転換数を含むメッセージを保存し、再読み込みする（saved 固定にしない）', async () => {
    const harness = runClient({
      messages: MESSAGES,
      replies: [{ ok: true, json: { processedVisitors: 123, conversions: 17, stoppedByLimit: false } }],
    });
    harness.dispatch('submit', submitEvent(simulationForm(harness)));
    await harness.flush();
    const stored = harness.storage.get(PENDING_FEEDBACK_STORAGE_KEY) ?? '';
    expect(stored).toContain('123');
    expect(stored).toContain('17');
    expect(stored).not.toContain('{processed}');
    expect(stored).not.toBe(UI_TEXT.client.saved);
    expect(stored).not.toContain(UI_TEXT.client.simulatedStopped);
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it('上限で打ち切られたときは、その旨を追加で表示する', async () => {
    const harness = runClient({
      messages: MESSAGES,
      replies: [{ ok: true, json: { processedVisitors: 40, conversions: 3, stoppedByLimit: true } }],
    });
    harness.dispatch('submit', submitEvent(simulationForm(harness)));
    await harness.flush();
    const stored = harness.storage.get(PENDING_FEEDBACK_STORAGE_KEY) ?? '';
    expect(stored).toContain('40');
    expect(stored).toContain(UI_TEXT.client.simulatedStopped);
  });

  it('再読み込み後の画面で、保存したメッセージを表示して消す', () => {
    const storage = new Map([[PENDING_FEEDBACK_STORAGE_KEY, '処理件数 5 件']]);
    const harness = runClient({ messages: MESSAGES, storage });
    expect(harness.feedback.textContent).toBe('処理件数 5 件');
    expect(storage.has(PENDING_FEEDBACK_STORAGE_KEY)).toBe(false);
  });

  it('保存先が使えないときは、原因をログに残し、メッセージはその場で表示する（再読み込みしない）', async () => {
    const harness = runClient({
      messages: MESSAGES,
      storageBroken: true,
      replies: [{ ok: true, json: { processedVisitors: 9, conversions: 1, stoppedByLimit: false } }],
    });
    harness.dispatch('submit', submitEvent(simulationForm(harness)));
    await harness.flush();
    expect(harness.errors.length).toBeGreaterThan(0);
    expect(harness.feedback.textContent).toContain('9');
    expect(harness.reload).not.toHaveBeenCalled();
  });

  it('状態変更ボタンの成功時は「状態を変更しました」を保存して再読み込みする', async () => {
    const harness = runClient({ messages: MESSAGES, replies: [{ ok: true, json: { experiment: {} } }] });
    const button = harness.element({ 'data-post-url': '/api/experiments/e1/status', 'data-post-body': '{"to":"running"}' });
    harness.dispatch('click', { target: { closest: (selector: string) => (selector === '[data-post-url]' ? button : null) } });
    await harness.flush();
    expect(harness.storage.get(PENDING_FEEDBACK_STORAGE_KEY)).toBe(UI_TEXT.client.started);
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it('保存フォームの成功時は「保存しました」を保存する', async () => {
    const harness = runClient({ messages: MESSAGES, replies: [{ ok: true, json: { experiment: {} } }] });
    const form = harness.element(
      { 'data-api': 'PUT /api/experiments/e1' },
      { elements: [{ name: 'name', value: 'x' }] },
    );
    harness.dispatch('submit', submitEvent(form));
    await harness.flush();
    expect(harness.storage.get(PENDING_FEEDBACK_STORAGE_KEY)).toBe(UI_TEXT.client.saved);
  });
});

describe('クライアント処理: バリアントの追加と削除（要修正 2）', () => {
  function clickOn(attribute: string, node: unknown): { target: unknown } {
    return { target: { closest: (selector: string) => (selector === `[${attribute}]` ? node : null) } };
  }

  it('追加ボタンで入力欄を足し、連番を差し込む。上限（4 件）で止めて理由を表示する', () => {
    const harness = runClient({ messages: MESSAGES, initialRows: 3 });
    harness.dispatch('click', clickOn('data-variant-add', harness.element({})));
    expect(harness.variantRows).toHaveLength(4);
    expect(harness.variantRows[3]).toContain('v3.key');
    expect(harness.variantRows[3]).not.toContain('__INDEX__');

    harness.dispatch('click', clickOn('data-variant-add', harness.element({})));
    expect(harness.variantRows).toHaveLength(4);
    expect(harness.feedback.textContent).toBe(UI_TEXT.client.variantMax);
  });

  it('削除ボタンは下限（2 件）を下回る削除を拒否して理由を表示する', () => {
    const harness = runClient({ messages: MESSAGES, initialRows: 2 });
    const removed: unknown[] = [];
    const row = harness.element({}, { parentNode: { removeChild: (node: unknown) => removed.push(node) } });
    const button = harness.element({}, { closest: () => row });
    harness.dispatch('click', clickOn('data-variant-remove', button));
    expect(removed).toHaveLength(0);
    expect(harness.feedback.textContent).toBe(UI_TEXT.client.variantMin);
  });

  it('3 件あるときの削除は行を取り除く', () => {
    const harness = runClient({ messages: MESSAGES, initialRows: 3 });
    const removed: unknown[] = [];
    const row = harness.element({}, { parentNode: { removeChild: (node: unknown) => removed.push(node) } });
    const button = harness.element({}, { closest: () => row });
    harness.dispatch('click', clickOn('data-variant-remove', button));
    expect(removed).toEqual([row]);
  });
});

describe('クライアント処理: バリアント順は数値で並べる（低-3）', () => {
  it('v10 は v9 より後に送信される（文字列順にしない）', async () => {
    const harness = runClient({ messages: MESSAGES, replies: [{ ok: false, json: { error: { message: 'x' } } }] });
    const form = harness.element(
      { 'data-api': 'POST /api/experiments' },
      {
        elements: [
          { name: 'v10.key', value: 'ten' },
          { name: 'v2.key', value: 'two' },
          { name: 'v9.key', value: 'nine' },
          { name: 'v0.key', value: 'zero' },
        ],
      },
    );
    harness.dispatch('submit', submitEvent(form));
    await harness.flush();
    const init = harness.fetchMock.mock.calls[0][1] as { body: string };
    const keys = (JSON.parse(init.body) as { variants: Array<{ key: string }> }).variants.map((v) => v.key);
    expect(keys).toEqual(['zero', 'two', 'nine', 'ten']);
  });
});
