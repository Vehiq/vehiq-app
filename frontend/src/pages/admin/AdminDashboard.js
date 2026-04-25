import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const Card = ({ label, value, sub }) => (
  <div className="bg-[#161829] border border-[#222540] rounded p-5">
    <div className="text-xs uppercase tracking-widest text-[#6B7090]">{label}</div>
    <div className="text-3xl font-semibold text-[#F4F1EC] mt-2">{value}</div>
    {sub && <div className="text-xs text-[#C9A84C] mt-1">{sub}</div>}
  </div>
);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.get("/admin/dashboard").then(r => setData(r.data)); }, []);
  if (!data) return <div className="text-[#6B7090]">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Total users" value={data.users.total} sub={`+${data.users.month} (30d)`} />
        <Card label="Total vehicles" value={data.vehicles} />
        <Card label="Active listings" value={data.listings} />
        <Card label="Forum threads" value={data.forum.threads} sub={`${data.forum.posts} posts`} />
        <Card label="Visits all time" value={data.visits.total} />
        <Card label="Visits today" value={data.visits.today} />
        <Card label="Online (5m)" value={data.visits.online_now} />
        <Card label="AI chat sessions" value={data.ai_chats} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#161829] border border-[#222540] rounded p-5 h-72">
          <div className="text-sm text-[#F4F1EC] mb-3">Daily visits (30d)</div>
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
        <div className="bg-[#161829] border border-[#222540] rounded p-5 h-72">
          <div className="text-sm text-[#F4F1EC] mb-3">Daily signups (30d)</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={data.daily_signups}>
              <CartesianGrid stroke="#222540" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#6B7090" tick={{fontSize:10}} tickFormatter={(d) => d?.slice(5)} />
              <YAxis stroke="#6B7090" tick={{fontSize:10}} />
              <Tooltip contentStyle={{ background:"#0F1120", border:"1px solid #222540" }} />
              <Bar dataKey="count" fill="#C9A84C" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#161829] border border-[#222540] rounded p-5">
        <div className="text-sm text-[#F4F1EC] mb-3">Top pages</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6B7090] text-left text-xs uppercase tracking-widest"><th className="pb-2">Path</th><th className="pb-2 text-right">Visits</th></tr></thead>
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
    </div>
  );
}
