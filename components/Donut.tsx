"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { fmtPct, fmtUSD } from "@/lib/format";

const PALETTE = [
  "#CDA434",
  "#6E8BB0",
  "#5FA37E",
  "#D98C5F",
  "#9C7BB0",
  "#7A8FA6",
  "#C75D5D",
  "#86A6CC",
  "#B08A3E",
  "#4A515C",
];

export interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

export default function Donut({ title, data }: { title: string; data: DonutDatum[] }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const ds = data.map((d, i) => ({ ...d, color: d.color ?? PALETTE[i % PALETTE.length] ?? "#4A515C" }));

  return (
    <div className="card">
      <div className="sectit">{title}</div>
      <div className="donutwrap">
        <div className="donut-ring">
          <ResponsiveContainer>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={ds}
                dataKey="value"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {ds.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="center">
            <div className="ct">{fmtUSD(total)}</div>
          </div>
        </div>
        <div className="donutleg">
          {ds.map((s, i) => (
            <div className="dlrow" key={i}>
              <span className="dot" style={{ background: s.color }} />
              <span className="nm">{s.label}</span>
              <span className="pc">{fmtPct((s.value / total) * 100)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
