export class QueueError extends Error {
  constructor(code) { super(code); this.name = 'QueueError'; this.code = code; }
}

/** One PHP request at a time. Bounds queued count and all admitted body bytes.
 * deadline applies to waiting only; running work must finish before the next
 * starts, even if its caller aborts. Native execution cancellation is separate.
 */
export class RequestQueue {
  #waiting = [];
  #running = false;
  #bytes = 0;
  constructor({maxPending = 32, maxBytes = 8 * 1024 * 1024} = {}) {
    for (const x of [maxPending, maxBytes]) {
      if (!Number.isSafeInteger(x) || x < 0) throw new RangeError('Invalid queue limit');
    }
    this.maxPending = maxPending; this.maxBytes = maxBytes;
  }
  get stats() { return {pending:this.#waiting.length, running:this.#running, bytes:this.#bytes}; }
  run(task, {bytes = 0, signal, deadline = Infinity} = {}) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('task'));
    if (!Number.isSafeInteger(bytes) || bytes < 0 ||
        !(deadline === Infinity || Number.isFinite(deadline))) {
      return Promise.reject(new RangeError('Invalid request budget'));
    }
    if (signal?.aborted) return Promise.reject(new QueueError('ABORTED'));
    if (deadline <= Date.now()) return Promise.reject(new QueueError('EXPIRED'));
    if ((this.#running && this.#waiting.length >= this.maxPending) ||
        this.#bytes + bytes > this.maxBytes) return Promise.reject(new QueueError('OVERLOADED'));
    return new Promise((resolve, reject) => {
      const item = {task, bytes, resolve, reject, signal, timer:undefined};
      item.abort = () => this.#remove(item, 'ABORTED');
      signal?.addEventListener('abort', item.abort, {once:true});
      this.#bytes += bytes;
      this.#waiting.push(item);
      if (deadline !== Infinity) {
        const arm = () => {
          const remaining = deadline - Date.now();
          if (remaining <= 0) this.#remove(item, 'EXPIRED');
          else item.timer = setTimeout(arm, Math.min(2147483647, remaining));
        };
        arm();
      }
      this.#pump();
    });
  }
  #detach(item) {
    clearTimeout(item.timer);
    item.signal?.removeEventListener('abort', item.abort);
  }
  #remove(item, code) {
    const index = this.#waiting.indexOf(item);
    if (index === -1) return;
    this.#waiting.splice(index, 1);
    this.#bytes -= item.bytes;
    this.#detach(item);
    item.reject(new QueueError(code));
  }
  #pump() {
    if (this.#running || !this.#waiting.length) return;
    const item = this.#waiting.shift();
    this.#running = true;
    this.#detach(item);
    const finish = () => {
      this.#bytes -= item.bytes;
      this.#running = false;
      this.#pump();
    };
    // Handle both branches; do not leave a rejected finally() promise behind.
    Promise.resolve().then(() => item.task(item.signal)).then(
      value => { finish(); item.resolve(value); },
      error => { finish(); item.reject(error); },
    );
  }
}
