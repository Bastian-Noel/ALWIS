/** One short-lived worker per archive; buffers transfer without cloning. */
export function zipTask(operation, value) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./zip-worker.mjs", import.meta.url), {
        type: "module",
        name: "project-zip",
      }),
      finish = (error, result) => {
        clearTimeout(timer);
        worker.terminate();
        error ? reject(error) : resolve(result);
      },
      timer = setTimeout(() => finish(Error("Opération ZIP expirée.")), 120000);
    worker.onmessage = ({ data }) =>
      finish(data.error ? Error(data.error) : null, data.result);
    worker.onerror = (e) => finish(Error(e.message));
    try {
      worker.postMessage(
        { operation, value },
        value instanceof Uint8Array
          ? [value.buffer]
          : Array.isArray(value)
            ? value.map((e) => e.bytes.buffer)
            : [],
      );
    } catch (error) {
      finish(error);
    }
  });
}
