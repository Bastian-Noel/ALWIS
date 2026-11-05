/** No payload read: Blob slices keep media on disk and preserve native backpressure. */
export function fileResponse(
  file,
  { headers = [], method = "GET" } = {},
  {
    type = file.type || "application/octet-stream",
    version = "",
    mtime = Date.now(),
  } = {},
) {
  const request = new Headers(headers),
    etag = '"' + version + '"',
    base = [
      ["Content-Type", type],
      ["Accept-Ranges", "bytes"],
      ["ETag", etag],
      ["Last-Modified", new Date(mtime).toUTCString()],
    ];
  if (version && request.get("if-none-match") === etag)
    return { status: 304, headers: base, file: null };
  let from = 0,
    to = file.size - 1,
    status = 200;
  const range = request.get("range");
  if (range && (!request.get("if-range") || request.get("if-range") === etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]) || !file.size)
      return {
        status: 416,
        headers: [
          ...base,
          ["Content-Range", "bytes */" + file.size],
          ["Content-Length", "0"],
        ],
        file: null,
      };
    if (!match[1]) {
      const suffix = Number(match[2]);
      from = Math.max(0, file.size - suffix);
      if (!suffix) from = file.size;
    } else {
      from = Number(match[1]);
      to = match[2] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1;
    }
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from >= file.size ||
      to < from
    )
      return {
        status: 416,
        headers: [
          ...base,
          ["Content-Range", "bytes */" + file.size],
          ["Content-Length", "0"],
        ],
        file: null,
      };
    status = 206;
    base.push(["Content-Range", `bytes ${from}-${to}/${file.size}`]);
  }
  const blob = file.slice(from, to + 1, type);
  base.push(["Content-Length", String(blob.size)]);
  return {
    status,
    headers: base,
    file: method === "HEAD" ? null : blob,
    size: blob.size,
  };
}
