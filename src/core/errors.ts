/** Domain Core が投げる例外。メッセージに入力の文脈を含める。 */
export class DomainCoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainCoreError';
  }
}

/** 入力値が書式または範囲に合わない場合の例外。HTTP 層は 400 に写す。 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
