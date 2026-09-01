import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface Props {
  data: { hour: number; revenue: number }[];
}

export default function HourlySalesChart({ data }: Props) {
  const chartData = data.map((d) => ({ ...d, label: `${d.hour}h` }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Ventes par heure</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value: number) => `${value.toLocaleString('fr-FR')} FCFA`} />
          <Bar dataKey="revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
