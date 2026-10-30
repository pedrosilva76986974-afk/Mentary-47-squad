import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PDF_PAGES = 50;
const standardFontDataUrl = `${resolve(dirname(fileURLToPath(import.meta.url)), "../../node_modules/pdfjs-dist/standard_fonts").replaceAll("\\", "/")}/`;

export { MAX_PDF_PAGES, standardFontDataUrl };
