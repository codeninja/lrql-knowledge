// ============================================================================
// EDITOR · contenteditable LQL editor with live syntax highlighting.
// ============================================================================

import { highlight } from "./lql.js";

export function createEditor(el, { onRun }) {
  el.addEventListener("input", () => {
    const caret = saveCaret(el);
    el.innerHTML = highlight(el.innerText);
    restoreCaret(el, caret);
  });

  el.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onRun(el.innerText);
    }
    // Tab inserts spaces instead of leaving the editor
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
    }
  });

  return {
    setText(text) {
      el.innerText = text;
      el.dispatchEvent(new Event("input"));
      placeCaretAtEnd(el);
      el.focus();
    },
    getText() {
      return el.innerText;
    },
    focus() {
      el.focus();
      placeCaretAtEnd(el);
    },
  };
}

function saveCaret(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function restoreCaret(el, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent.length;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  // Fallback to end
  placeCaretAtEnd(el);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
