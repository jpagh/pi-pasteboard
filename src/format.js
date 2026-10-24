import { DEFAULT_INLINE_FORMAT } from "./constants.js";

export const INLINE_FORMATS = ["stock", "spaced", "fenced"];

/**
 * Human-readable byte size, mirroring Pi's own formatSize() so a reference
 * reads the same way as a read-truncation notice.
 */
export function formatPasteSize(bytes) {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Compact size description for a paste reference: "812 lines, 45.6KB".
 *
 * Deliberately terse — it rides along in every captured submission, and its
 * only job is to let the model decide between `grep` and a full `read`.  No
 * thousands separators: they cost tokens and add nothing here.
 */
export function describePaste(bytes, lines) {
	return `${lines} ${lines === 1 ? "line" : "lines"}, ${formatPasteSize(bytes)}`;
}

/**
 * A fence longer than the longest backtick run in the content, so pasted
 * markdown cannot terminate its own fence.
 */
function fenceFor(content) {
	let longest = 0;
	for (const match of content.matchAll(/`+/g)) {
		longest = Math.max(longest, match[0].length);
	}
	return "`".repeat(Math.max(3, longest + 1));
}

/** Render one paste as a self-contained block (no surrounding blank lines). */
function renderBlock(content, format) {
	const body = String(content ?? "").replace(/\n+$/, "");
	if (format === "fenced") {
		const fence = fenceFor(body);
		return `${fence}\n${body}\n${fence}`;
	}
	return body;
}

/** Newlines needed before a block so it starts after a blank line. */
function gapBefore(result) {
	if (result === "") return "";
	if (result.endsWith("\n\n")) return "";
	if (result.endsWith("\n")) return "\n";
	return "\n\n";
}

/** Newlines needed before typed text that follows a paste block. */
function gapAfterPaste(text) {
	if (text === "") return "\n\n";
	if (text.startsWith("\n\n")) return "";
	if (text.startsWith("\n")) return "\n";
	return "\n\n";
}

/**
 * Expand paste markers into their content, formatted as separate blocks.
 *
 * Pi's own expansion substitutes content in place, so a paste glued to typed
 * text on either side reads as one run-on paragraph.  This keeps each paste on
 * its own block, separated by a blank line, and (for "fenced") delimited so the
 * model can tell where the paste starts and stops.
 *
 * Typed text is preserved verbatim apart from horizontal whitespace directly
 * after a paste, where the indentation is an artifact of the marker position.
 *
 * @param {Array<{kind:string, text:string}>} segments  From parseSegments().
 * @param {"spaced"|"fenced"} format
 * @returns {string}
 */
export function expandInlinePastes(segments, format = DEFAULT_INLINE_FORMAT) {
	if (format !== "spaced" && format !== "fenced") {
		throw new Error(`expandInlinePastes: unsupported format "${format}"`);
	}

	let result = "";
	let afterPaste = false;

	for (const segment of segments) {
		if (segment.kind === "paste") {
			const block = renderBlock(segment.text, format);
			// An empty paste contributes no content, but it was still a boundary
			// between typed text: keep the separation, drop the stray blank line.
			if (block !== "") {
				result += gapBefore(result) + block;
				afterPaste = true;
			} else if (result !== "") {
				afterPaste = true;
			}
			continue;
		}

		let text = String(segment.text ?? "");
		if (afterPaste) text = text.replace(/^[ \t]+/, "");
		result += (afterPaste ? gapAfterPaste(text) : "") + text;
		afterPaste = false;
	}

	return result;
}
