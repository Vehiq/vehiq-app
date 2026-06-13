import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const Card = ({ label, value, sub }) => (
  <div className="bg-[#162035] border border-[#1E2A42] rounded p-5">
    <div className="text-xs uppercase tracking-widest text-[#A0B4C8]">{label}</div>
    <div className="text-3xl font-semibold text-[#FFFFFF] mt-2">{value}</div>
    {sub && <div className="text-xs text-[#2B7FE8] mt-1">{sub}</div>}
  </div>
);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    adminApi.get("/admin/dashboard")
      .then(r => setData(r.data))
      .catch(e => setErr(e?.response?.data?.detail || e?.message || "Failed to load"));
  }, []);
  if (err) return <div className="text-red-400" data-testid="admin-dashboard-error">Error: {err}</div>;
  if (!data) return <div className="text-[#A0B4C8]" data-testid="admin-dashboard-loading">Loading...</div>;

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
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-5 h-72">
          <div className="text-sm text-[#FFFFFF] mb-3">Daily visits (30d)</div>
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
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-5 h-72">
          <div className="text-sm text-[#FFFFFF] mb-3">Daily signups (30d)</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={data.daily_signups}>
              <CartesianGrid stroke="#1E2A42" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#A0B4C8" tick={{fontSize:10}} tickFormatter={(d) => d?.slice(5)} />
              <YAxis stroke="#A0B4C8" tick={{fontSize:10}} />
              <Tooltip contentStyle={{ background:"#0A1220", border:"1px solid #1E2A42" }} />
              <Bar dataKey="count" fill="#2B7FE8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#162035] border border-[#1E2A42] rounded p-5">
        <div className="text-sm text-[#FFFFFF] mb-3">Top pages</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-widest"><th className="pb-2">Path</th><th className="pb-2 text-right">Visits</th></tr></thead>
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
    </div>
  );
}
