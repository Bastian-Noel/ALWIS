import {
  readZip,
  makeCompressedZip,
  inspectZipFile,
  extractZipFile,
} from "./zip.mjs";
self.onmessage = async ({ data }) => {
  try {
    const result =
      data.operation === "inspect"
        ? await inspectZipFile(data.value)
        : data.operation === "extract"
          ? await extractZipFile(data.value.file, data.value.names)
          : data.operation === "read"
            ? await readZip(data.value)
            : await makeCompressedZip(data.value);
    const transfers =
      result instanceof Uint8Array
        ? [result.buffer]
        : result.flatMap((e) => (e.bytes ? [e.bytes.buffer] : []));
    self.postMessage({ result }, transfers);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
