import { readZip, makeCompressedZip } from "./zip.mjs";
self.onmessage = async ({ data }) => {
  try {
    const result =
      data.operation === "read"
        ? await readZip(data.value)
        : await makeCompressedZip(data.value);
    const transfers =
      result instanceof Uint8Array
        ? [result.buffer]
        : result.map((e) => e.bytes.buffer);
    self.postMessage({ result }, transfers);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
