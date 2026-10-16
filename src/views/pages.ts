import { EXPERIMENT_STATUS, EXPERIMENT_LIMITS } from '../config/domain';
import { JUDGEMENT_LABEL, NOT_COMPARABLE_LABEL } from '../config/messages';
import { ROUTE } from '../config/http';
import { SITE, UI_TEXT } from '../config/ui';
import type { ResultsSummary } from '../core/results';
import type { ExperimentDto } from '../http/dto';
import { escapeHtml } from './html';
import { renderLayout } from './layout';

const MESSAGES = {
  saved: UI_TEXT.client.saved,
  started: UI_TEXT.client.started,
  simulated: UI_TEXT.client.simulated,
  failed: UI_TEXT.client.failed,
  copied: UI_TEXT.client.copied,
};

export interface IndexView {
  readonly experiments: readonly ExperimentDto[];
  readonly limitReached: boolean;
  readonly ga4MeasurementId: string;
  readonly nonce: string;
}

export function renderIndexPage(view: IndexView): string {
  const rows = view.experiments
    .map(
      (experiment) =>
        `<tr><td>${escapeHtml(experiment.name)}</td>` +
        `<td><span class="badge">${escapeHtml(UI_TEXT.experiment.statusNames[experiment.status])}</span></td>` +
        `<td>${experiment.variants.length}</td><td>${experiment.eventCount}</td>` +
        `<td><a class="button" href="${ROUTE.EXPERIMENT_PAGE.replace(':id', experiment.id)}">${escapeHtml(UI_TEXT.index.openLabel)}</a></td></tr>`,
    )
    .join('');
  const table =
    view.experiments.length === 0
      ? `<p>${escapeHtml(UI_TEXT.index.empty)}</p>`
      : `<table><thead><tr><th>${escapeHtml(UI_TEXT.index.columns.name)}</th><th>${escapeHtml(UI_TEXT.index.columns.status)}</th>` +
        `<th>${escapeHtml(UI_TEXT.index.columns.variants)}</th><th>${escapeHtml(UI_TEXT.index.columns.events)}</th>` +
        `<th>${escapeHtml(UI_TEXT.index.columns.action)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  const createForm = view.limitReached
    ? `<p class="notice">${escapeHtml(UI_TEXT.index.limitReached)}</p>`
    : renderExperimentForm({ mode: 'create' });
  const body = [
    `<h1>${escapeHtml(UI_TEXT.index.title)}</h1>`,
    `<p>${escapeHtml(UI_TEXT.index.description)}</p>`,
    `<p class="notice">${escapeHtml(UI_TEXT.index.limitNotice)}</p>`,
    `<section class="card">${table}</section>`,
    `<section class="card"><h2>${escapeHtml(UI_TEXT.index.createHeading)}</h2>${createForm}</section>`,
    '<div id="feedback" class="feedback" role="status"></div>',
  ].join('');
  return renderLayout({
    title: UI_TEXT.index.title,
    ga4MeasurementId: view.ga4MeasurementId,
    nonce: view.nonce,
    body,
    messages: MESSAGES,
    withClient: true,
  });
}

export interface ExperimentView {
  readonly experiment: ExperimentDto;
  readonly results: ResultsSummary;
  /** バリアント ID → 表示名。結果表に出す。 */
  readonly labels: Readonly<Record<string, string>>;
  readonly origin: string;
  readonly ga4MeasurementId: string;
  readonly nonce: string;
}

export function renderExperimentPage(view: ExperimentView): string {
  const { experiment } = view;
  const statusLabel = UI_TEXT.experiment.statusNames[experiment.status];
  const limitNotice =
    experiment.eventCount >= EXPERIMENT_LIMITS.EVENT_LIMIT
      ? `<p class="notice">${escapeHtml(UI_TEXT.experiment.limitReached)}</p>`
      : '';
  const snippet = renderSnippet(view.origin, experiment.publicKey);
  const body = [
    `<p><a href="${ROUTE.INDEX}">${escapeHtml(UI_TEXT.experiment.backToList)}</a></p>`,
    `<h1>${escapeHtml(experiment.name)} <span class="badge">${escapeHtml(statusLabel)}</span></h1>`,
    limitNotice,
    '<section class="card">',
    `<h2>${escapeHtml(UI_TEXT.experiment.basicHeading)}</h2>`,
    `<p>${escapeHtml(UI_TEXT.experiment.goalName)}: <code>${escapeHtml(experiment.goalName)}</code> / `,
    `${escapeHtml(UI_TEXT.experiment.minSample)}: ${experiment.minSample} / ${experiment.eventCount} / ${EXPERIMENT_LIMITS.EVENT_LIMIT}</p>`,
    renderStatusActions(experiment),
    '</section>',
    `<section class="card"><h2>${escapeHtml(UI_TEXT.experiment.editHeading)}</h2>${renderExperimentForm({ mode: 'edit', experiment })}</section>`,
    `<section class="card"><h2>${escapeHtml(UI_TEXT.experiment.resultsHeading)}</h2>${renderResults(view.results, view.labels)}</section>`,
    `<section class="card"><h2>${escapeHtml(UI_TEXT.experiment.snippetHeading)}</h2>`,
    `<p>${escapeHtml(UI_TEXT.experiment.snippetDescription)}</p>${snippet}</section>`,
    `<section class="card"><h2>${escapeHtml(UI_TEXT.experiment.simulateHeading)}</h2>`,
    `<p>${escapeHtml(UI_TEXT.experiment.simulateDescription)}</p>${renderSimulationForm(experiment)}</section>`,
    '<div id="feedback" class="feedback" role="status"></div>',
  ].join('');
  return renderLayout({
    title: experiment.name,
    ga4MeasurementId: view.ga4MeasurementId,
    nonce: view.nonce,
    body,
    messages: MESSAGES,
    withClient: true,
  });
}

export function renderLegalPage(ga4MeasurementId: string, nonce: string): string {
  const body = [
    '<section class="card legal">',
    `<h1>${escapeHtml(UI_TEXT.legal.heading)}</h1>`,
    `<p>${escapeHtml(UI_TEXT.legal.lead)}</p>`,
    `<p>${escapeHtml(UI_TEXT.legal.operatorLabel)}: ${escapeHtml(SITE.OPERATOR_NAME)}</p>`,
    `<p>${escapeHtml(UI_TEXT.legal.contactLabel)}: <a href="${UI_TEXT.consult.href}">${escapeHtml(SITE.CONTACT_EMAIL)}</a></p>`,
    `<h2>${escapeHtml(UI_TEXT.legal.privacyHeading)}</h2>`,
    `<p>${escapeHtml(UI_TEXT.legal.privacyBody)}</p>`,
    `<p>${escapeHtml(UI_TEXT.legal.dataBody)}</p>`,
    '</section>',
  ].join('');
  return renderLayout({ title: UI_TEXT.legal.title, ga4MeasurementId, nonce, body });
}

export function renderNotFoundPage(ga4MeasurementId: string, nonce: string): string {
  const body = [
    '<section class="card">',
    `<h1>${escapeHtml(UI_TEXT.errors.notFoundHeading)}</h1>`,
    `<p>${escapeHtml(UI_TEXT.errors.notFoundBody)}</p>`,
    `<p><a class="button" href="${ROUTE.INDEX}">${escapeHtml(UI_TEXT.backLink.label)}</a></p>`,
    '</section>',
  ].join('');
  return renderLayout({ title: UI_TEXT.errors.notFoundTitle, ga4MeasurementId, nonce, body });
}

function renderStatusActions(experiment: ExperimentDto): string {
  const url = `/api/experiments/${experiment.id}/status`;
  const button = (to: string, label: string, secondary: boolean): string =>
    `<button type="button" class="${secondary ? 'secondary' : ''}" data-post-url="${escapeHtml(url)}" ` +
    `data-post-body="${escapeHtml(JSON.stringify({ to }))}">${escapeHtml(label)}</button>`;
  const actions: string[] = [];
  if (experiment.status === EXPERIMENT_STATUS.DRAFT) {
    actions.push(button('running', UI_TEXT.experiment.statusStart, false));
  }
  if (experiment.status === EXPERIMENT_STATUS.RUNNING || experiment.status === EXPERIMENT_STATUS.CAPPED) {
    actions.push(button('paused', UI_TEXT.experiment.statusPause, true));
  }
  if (experiment.status === EXPERIMENT_STATUS.PAUSED) {
    actions.push(button('running', UI_TEXT.experiment.statusResume, false));
  }
  return `<div class="actions">${actions.join('')}</div>`;
}

interface FormOptions {
  readonly mode: 'create' | 'edit';
  readonly experiment?: ExperimentDto;
}

function renderExperimentForm(options: FormOptions): string {
  const experiment = options.experiment;
  const isCreate = options.mode === 'create';
  const api = isCreate ? 'POST /api/experiments' : `PUT /api/experiments/${experiment?.id ?? ''}`;
  const isDraft = experiment === undefined || experiment.status === EXPERIMENT_STATUS.DRAFT;
  const variantCount = isCreate ? 2 : experiment?.variants.length ?? 2;
  const variants = Array.from({ length: variantCount }, (_unused, index) => {
    const existing = experiment?.variants[index];
    const defaults = index === 0 ? UI_TEXT.experiment.defaultVariants.control : UI_TEXT.experiment.defaultVariants.variant;
    return renderVariantFields(index, {
      key: existing?.key ?? defaults.key,
      label: existing?.label ?? defaults.label,
      weight: existing?.weight ?? 1,
      selector: existing?.payload.selector ?? '',
      text: existing?.payload.text ?? '',
      color: existing?.payload.color ?? '',
      keyEditable: isCreate || isDraft,
    });
  }).join('');
  const honeypot = isCreate
    ? '<div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>'
    : '';
  const submit = isCreate ? UI_TEXT.index.createSubmit : UI_TEXT.experiment.editSubmit;
  const redirect = isCreate ? ' data-redirect="experiment"' : '';
  return [
    `<form data-api="${escapeHtml(api)}"${redirect}>`,
    '<div class="form-grid">',
    `<label>${escapeHtml(UI_TEXT.experiment.name)}<input name="name" required maxlength="50" value="${escapeHtml(experiment?.name ?? '')}"></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.goalName)}<input name="goalName" required maxlength="40" value="${escapeHtml(experiment?.goalName ?? 'purchase')}"></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.minSample)}<input name="minSample" type="number" min="1" required value="${experiment?.minSample ?? 30}"></label>`,
    '</div>',
    `<h3>${escapeHtml(UI_TEXT.experiment.variantsHeading)}</h3>`,
    variants,
    honeypot,
    `<div class="actions"><button type="submit">${escapeHtml(submit)}</button></div>`,
    '</form>',
  ].join('');
}

interface VariantFieldValues {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly selector: string;
  readonly text: string;
  readonly color: string;
  readonly keyEditable: boolean;
}

function renderVariantFields(index: number, values: VariantFieldValues): string {
  const prefix = `v${index}`;
  const keyAttributes = values.keyEditable ? '' : ' readonly';
  return [
    '<div class="form-grid">',
    `<label>${escapeHtml(UI_TEXT.experiment.variantKey)}<input name="${prefix}.key" required maxlength="20" value="${escapeHtml(values.key)}"${keyAttributes}></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.variantLabel)}<input name="${prefix}.label" required maxlength="30" value="${escapeHtml(values.label)}"></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.variantWeight)}<input name="${prefix}.weight" type="number" min="0" max="100" required value="${values.weight}"></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.variantSelector)}<input name="${prefix}.selector" maxlength="200" value="${escapeHtml(values.selector)}"></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.variantText)}<input name="${prefix}.text" maxlength="200" value="${escapeHtml(values.text)}"></label>`,
    `<label>${escapeHtml(UI_TEXT.experiment.variantColor)}<input name="${prefix}.color" maxlength="7" value="${escapeHtml(values.color)}"></label>`,
    '</div>',
  ].join('');
}

function renderResults(results: ResultsSummary, labels: Readonly<Record<string, string>>): string {
  if (results.variants.length === 0) {
    return `<p>${escapeHtml(UI_TEXT.experiment.resultsEmpty)}</p>`;
  }
  const note = results.comparable ? '' : `<p class="notice">${escapeHtml(UI_TEXT.experiment.resultsNotComparable)}</p>`;
  const rows = results.variants
    .map((variant) => {
      const rate = variant.rate === null ? '-' : `${(variant.rate * 100).toFixed(2)}%`;
      const lift = variant.lift === null ? '-' : `${(variant.lift * 100).toFixed(1)}%`;
      const pValue = variant.pValue === null ? '-' : variant.pValue.toFixed(4);
      const judgement = results.comparable ? JUDGEMENT_LABEL[variant.judgement] : NOT_COMPARABLE_LABEL;
      return (
        `<tr><td>${escapeHtml(labels[variant.id] ?? variant.id)}</td><td>${variant.exposures}</td><td>${variant.conversions}</td>` +
        `<td>${rate}</td><td>${lift}</td><td>${pValue}</td><td>${escapeHtml(judgement)}</td></tr>`
      );
    })
    .join('');
  const header = UI_TEXT.experiment.resultColumns;
  return (
    note +
    `<table><thead><tr><th>${escapeHtml(header.variant)}</th><th>${escapeHtml(header.exposures)}</th>` +
    `<th>${escapeHtml(header.conversions)}</th><th>${escapeHtml(header.rate)}</th><th>${escapeHtml(header.lift)}</th>` +
    `<th>${escapeHtml(header.pValue)}</th><th>${escapeHtml(header.judgement)}</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function renderSnippet(origin: string, publicKey: string): string {
  const src = `${origin}${ROUTE.SNIPPET}`;
  const code =
    `<script src="${src}" data-key="${publicKey}" data-goal-selector="${UI_TEXT.experiment.snippetGoalSelectorExample}" async></script>`;
  return (
    `<pre id="snippet-code">${escapeHtml(code)}</pre>` +
    '<div class="actions"><button type="button" class="secondary" data-copy-target="snippet-code">' +
    `<i class="fa-solid fa-copy" aria-hidden="true"></i> ${escapeHtml(UI_TEXT.client.copy)}</button></div>`
  );
}

function renderSimulationForm(experiment: ExperimentDto): string {
  const rates = experiment.variants
    .map(
      (variant) =>
        `<label>${escapeHtml(variant.label)} (${escapeHtml(UI_TEXT.experiment.simulateRate)})` +
        `<input name="rate-${escapeHtml(variant.id)}" type="number" min="0" max="1" step="0.01" required value="0.1"></label>`,
    )
    .join('');
  return [
    `<form data-api="POST /api/experiments/${escapeHtml(experiment.id)}/simulate" data-collect="simulation">`,
    '<div class="form-grid">',
    `<label>${escapeHtml(UI_TEXT.experiment.simulateVisitors)}<input name="visitorCount" type="number" min="1" max="1000" required value="100"></label>`,
    rates,
    '</div>',
    `<div class="actions"><button type="submit">${escapeHtml(UI_TEXT.experiment.simulateSubmit)}</button></div>`,
    '</form>',
  ].join('');
}

