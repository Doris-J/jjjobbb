"use client";
import { useEffect, useState } from "react";
import { dashboardApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface DashboardData {
  days_left: number | null;
  interview_date: string | null;
  algorithm: { list_name: string | null; done: number; total: number; pct: number };
  questions: { done: number };
  project: { sessions: number };
  streak: number;
  weak_categories: { category: string; count: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    dashboardApi.get().then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="p-8 text-gray-400">加载中...</div>;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
        {data.days_left !== null ? (
          <p className="text-gray-500 mt-1">🎯 距离面试还有 <span className="text-blue-600 font-bold">{data.days_left}</span> 天</p>
        ) : (
          <p className="text-gray-400 mt-1 text-sm">去个人资料设置面试日期 →</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="连续打卡" value={`${data.streak} 天`} icon="🔥" />
        <StatCard title="算法已刷" value={`${data.algorithm.done}/${data.algorithm.total}`} icon="🧩" />
        <StatCard title="八股已答" value={`${data.questions.done} 题`} icon="📖" />
        <StatCard title="项目演练" value={`${data.project.sessions} 轮`} icon="💼" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 模块进度 */}
        <Card>
          <CardHeader><CardTitle className="text-base">模块进度</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ProgressRow
              label={`🧩 算法${data.algorithm.list_name ? ` (${data.algorithm.list_name})` : ""}`}
              value={data.algorithm.done}
              total={data.algorithm.total || 1}
              pct={data.algorithm.pct}
            />
            <ProgressRow label="📖 八股文" value={data.questions.done} total={data.questions.done || 1} pct={Math.min(data.questions.done * 2, 100)} />
            <ProgressRow label="💼 项目演练" value={data.project.sessions} total={10} pct={Math.min(data.project.sessions * 10, 100)} />
          </CardContent>
        </Card>

        {/* 薄弱知识点 */}
        <Card>
          <CardHeader><CardTitle className="text-base">⚠️ 薄弱知识点</CardTitle></CardHeader>
          <CardContent>
            {data.weak_categories.length === 0 ? (
              <p className="text-gray-400 text-sm">暂无数据，开始答题后自动统计</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.weak_categories.map((w) => (
                  <Badge key={w.category} variant="destructive">
                    {w.category} ({w.count})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl">{icon}</div>
        <div className="mt-2">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-gray-500">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRow({ label, value, total, pct }: { label: string; value: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-gray-500">{value}/{total} ({pct}%)</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
