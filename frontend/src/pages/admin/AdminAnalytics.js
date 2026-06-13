import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    adminApi.get("/admin/dashboard")
      .then(r => setData(r.data))
      .catch(e => setErr(e?.response?.data?.detail || e?.message || "Failed to load"));
  }, []);
  if (err) return <div className="text-red-400" data-testid="admin-analytics-error">Error: {err}</div>;
  if (!data) return <div className="text-[#A0B4C8]" data-testid="admin-analytics-loading">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <div className="bg-[#162035] border border-[#1E2A42] rounded p-5 h-72">
        <div className="text-sm text-[#FFFFFF] mb-3">Visits trend (30d)</div>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={data.daily_visits}>
            <CartesianGrid stroke="#1E2A42" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#A0B4C8" tick={{fontSize:10}} tickFormatter={(d) => d?.slice(5)} />
            <YAxis stroke="#A0B4C8" tick={{fontSize:10}} />
            <Tooltip contentStyle={{ background:"#0A1220", border:"1px solid #1E2A42" }} />
            <Line type="monotone" dataKey="count" stroke="#2B7FE8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#162035] border border-[#1E2A42] rounded p-5">
        <div className="text-sm text-[#FFFFFF] mb-3">Top pages</div>
        <table className="w-full text-sm">
          <tbody>
            {data.top_pages.map((p, i) => (
              <tr key={i} className="border-t border-[#1E2A42]">
                <td className="py-2 text-[#FFFFFF]">{p.path}</td>
                <td className="py-2 text-right text-[#2B7FE8]">{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <a href={`${process.env.REACT_APP_BACKEND_URL}/api/admin/dashboard`} className="text-xs text-[#2B7FE8] hover:underline">Raw data JSON</a>
    </div>
  );
}
