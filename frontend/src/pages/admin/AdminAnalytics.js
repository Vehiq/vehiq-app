import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.get("/admin/dashboard").then(r => setData(r.data)); }, []);
  if (!data) return <div className="text-[#6B7090]">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <div className="bg-[#161829] border border-[#222540] rounded p-5 h-72">
        <div className="text-sm text-[#F4F1EC] mb-3">Visits trend (30d)</div>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={data.daily_visits}>
            <CartesianGrid stroke="#222540" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#6B7090" tick={{fontSize:10}} tickFormatter={(d) => d?.slice(5)} />
            <YAxis stroke="#6B7090" tick={{fontSize:10}} />
            <Tooltip contentStyle={{ background:"#0F1120", border:"1px solid #222540" }} />
            <Line type="monotone" dataKey="count" stroke="#C9A84C" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#161829] border border-[#222540] rounded p-5">
        <div className="text-sm text-[#F4F1EC] mb-3">Top pages</div>
        <table className="w-full text-sm">
          <tbody>
            {data.top_pages.map((p, i) => (
              <tr key={i} className="border-t border-[#222540]">
                <td className="py-2 text-[#F4F1EC]">{p.path}</td>
                <td className="py-2 text-right text-[#C9A84C]">{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <a href={`${process.env.REACT_APP_BACKEND_URL}/api/admin/dashboard`} className="text-xs text-[#C9A84C] hover:underline">Raw data JSON</a>
    </div>
  );
}
