/*! ALWIS original adapter — Copyright (c) 2026 Bastian Noël. SPDX-License-Identifier: MIT. See licenses/ALWIS-MIT.txt. */
import { formatMixedHtml } from "./mixed-format.mjs";
import { htmlVoidStyle } from "./html-style.mjs";
// Loaded only by the explicit format command; the owner terminates this worker.
import { format } from "prettier/standalone";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as html from "prettier/plugins/html";
import * as postcss from "prettier/plugins/postcss";
import php from "@prettier/plugin-php/standalone";

self.onmessage = async ({ data }) => {
  try {
    const ext = data.path.split(".").pop().toLowerCase();
    const parser = {
      php: "php",
      phtml: "php",
      inc: "php",
      html: "html",
      htm: "html",
      js: "babel",
      mjs: "babel",
      cjs: "babel",
      jsx: "babel",
      json: "json",
      css: "css",
    }[ext];
    if (!parser)
      throw Error("Ce type de fichier n’a pas de formateur intégré.");
    if (data.text.length > 262144)
      throw Error(
        "Formatage limité à 256 K caractères pour préserver la réactivité.",
      );
    const options = {
      parser,
      plugins: [babel, estree, html, postcss, php],
      tabWidth: data.indent === "2" ? 2 : 4,
      useTabs: data.indent === "tabs",
      phpVersion: "8.4",
      printWidth: 100,
      endOfLine: "auto",
    };
    let text =
      parser === "php"
        ? await formatMixedHtml(data.text, format, options)
        : await format(data.text, options);
    if (parser === "html") text = htmlVoidStyle(text);
    self.postMessage({ text });
  } catch (error) {
    self.postMessage({ error: String(error.message).slice(0, 1500) });
  }
};
