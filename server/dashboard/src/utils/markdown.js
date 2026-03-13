/**
 * Tiny inline markdown renderer for AI chat responses.
 * Handles: bold, italic, inline code, code blocks, headers, bullet lists.
 * Returns an array of React-compatible elements via dangerouslySetInnerHTML on a wrapper.
 */
export function renderMarkdown(text) {
  if (!text) return "";

  // Escape HTML first
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = escape(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="bg-slate-900 text-green-400 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"><code>${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g,
    '<code class="bg-slate-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>'
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold text-slate-800 mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm,  '<h3 class="font-bold text-slate-900 mt-4 mb-1 text-base">$1</h3>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Bullet lists: convert consecutive "- item" lines into <ul>
  html = html.replace(/((?:^- .+$\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => `<li class="ml-4 list-disc">${line.replace(/^- /, "")}</li>`)
      .join("");
    return `<ul class="my-2 space-y-0.5">${items}</ul>`;
  });

  // Numbered lists
  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => `<li class="ml-4 list-decimal">${line.replace(/^\d+\. /, "")}</li>`)
      .join("");
    return `<ol class="my-2 space-y-0.5">${items}</ol>`;
  });

  // Paragraphs: double newlines → <p> tags, single newlines → <br>
  html = html
    .split(/\n{2,}/)
    .map((para) => {
      if (para.startsWith("<")) return para; // already HTML
      return `<p class="mb-2">${para.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  return html;
}
