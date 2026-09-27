'use client';

import React from 'react';

// 轻量 Markdown 渲染：针对 Agent 分析报告（标题/加粗/列表/引用/代码/表格/
// <font color> 语义色）解析为 React 节点，避免引入额外依赖与 XSS 风险。

const FONT_COLOR: Record<string, string> = {
  info: 'var(--success)', // 正常/合理
  warning: 'var(--danger)', // 异常/超限
  comment: 'var(--muted-foreground)', // 说明
};

const INLINE_RE =
  /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(<font color="(info|warning|comment)">([\s\S]*?)<\/font>)/g;

function renderInline(text: string, keyPrefix = ''): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {m[2]}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">
          {m[4]}
        </code>,
      );
    } else if (m[6] !== undefined) {
      nodes.push(
        <a key={key} href={m[7]} target="_blank" rel="noreferrer" className="text-info underline">
          {m[6]}
        </a>,
      );
    } else if (m[9] !== undefined) {
      nodes.push(
        <span key={key} style={{ color: FONT_COLOR[m[9]] || 'inherit', fontWeight: 600 }}>
          {m[10]}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

export function AnomalyMarkdown({ text }: { text: string }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-3 border-border" />);
      i++;
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level <= 2
          ? 'text-sm font-semibold text-foreground mt-3 mb-1.5'
          : level === 3
            ? 'text-[13px] font-semibold text-primary mt-3 mb-1'
            : 'text-xs font-semibold text-foreground mt-2 mb-1';
      blocks.push(
        React.createElement(
          `h${Math.min(level + 1, 6)}`,
          { key: key++, className: cls },
          renderInline(h[2], `h${key}`),
        ),
      );
      i++;
      continue;
    }

    // 表格
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className="text-left px-2 py-1 border-b border-border-strong text-muted-foreground font-medium">
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 border-b border-border align-top">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 引用块
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-2 pl-3 border-l-2 text-[12px] leading-relaxed"
          style={{ borderColor: 'var(--primary)', color: 'var(--muted-foreground)' }}
        >
          {renderInline(buf.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // 列表（有序 / 无序）
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        React.createElement(
          ListTag,
          {
            key: key++,
            className: ordered ? 'list-decimal pl-5 my-1.5 space-y-0.5' : 'list-disc pl-5 my-1.5 space-y-0.5',
          },
          items.map((it, ii) => (
            <li key={ii} className="text-[12px] leading-relaxed">
              {renderInline(it, `li${ii}`)}
            </li>
          )),
        ),
      );
      continue;
    }

    // 普通段落
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !/^\s*-{3,}\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="text-[12px] leading-relaxed my-1.5 text-foreground/90">
        {renderInline(buf.join(' '), `p${key}`)}
      </p>,
    );
  }

  return <div className="anomaly-markdown">{blocks}</div>;
}
