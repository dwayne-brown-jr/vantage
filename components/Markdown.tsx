import { Fragment, type ReactNode } from "react";

import { parseMarkdown, type MdBlock } from "@/lib/markdown";

/** Inline formatting: **bold**, *italic*, `code`, and [label](url) links. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${k++}`;

    if (tok.startsWith("`")) {
      nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else {
      const lm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
      nodes.push(
        lm ? (
          <a key={key} href={lm[2]} target="_blank" rel="noopener noreferrer">
            {lm[1]}
          </a>
        ) : (
          tok
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Block({ block, idx }: { block: MdBlock; idx: number }) {
  switch (block.type) {
    case "h": {
      const Tag = (`h${block.level}` as "h1" | "h2" | "h3");
      return <Tag className="md-h">{renderInline(block.text, `h${idx}`)}</Tag>;
    }
    case "p":
      // Soft newlines inside a paragraph collapse to spaces (markdown semantics).
      return <p className="md-p">{renderInline(block.text.replace(/\n/g, " "), `p${idx}`)}</p>;
    case "ul":
      return (
        <ul className="md-ul">
          {block.items.map((it, j) => (
            <li key={j}>{renderInline(it, `ul${idx}-${j}`)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="md-ol">
          {block.items.map((it, j) => (
            <li key={j}>{renderInline(it, `ol${idx}-${j}`)}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="md-tablewrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.header.map((c, j) => (
                  <th key={j} style={{ textAlign: block.align[j] ?? "left" }}>
                    {renderInline(c, `th${idx}-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, j) => (
                    <td key={j} style={{ textAlign: block.align[j] ?? "left" }}>
                      {renderInline(c, `td${idx}-${r}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="md-hr" />;
    case "code":
      return (
        <pre className="md-code">
          <code>{block.text}</code>
        </pre>
      );
  }
}

/** Render strategist markdown into themed elements. Tolerant of partial input. */
export default function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="md">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          <Block block={b} idx={i} />
        </Fragment>
      ))}
    </div>
  );
}
