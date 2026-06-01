"use client";
import { useEffect, useState } from "react";
import { planApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Task {
  title?: string;
  topic?: string;
  action?: string;
  reason: string;
  category?: string;
  leetcode_id?: number;
}

interface PlanData {
  date: string;
  tasks: {
    algorithm: Task[];
    questions: Task[];
    project: Task[];
    estimated_hours: number;
  };
}

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanData | null>(null);

  useEffect(() => {
    planApi.today().then(setPlan).catch(() => {});
  }, []);

  if (!plan) return <div className="p-8 text-gray-400">加载中...</div>;

  const today = new Date(plan.date).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📅 今日学习计划</h1>
        <p className="text-gray-500 text-sm mt-1">{today} · 预计 {plan.tasks.estimated_hours} 小时</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">🧩 算法（{plan.tasks.algorithm.length} 题）</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {plan.tasks.algorithm.map((t, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                {t.leetcode_id && <p className="text-xs text-gray-400">LeetCode #{t.leetcode_id}</p>}
              </div>
              <Badge variant="outline" className="text-xs">{t.reason}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">📖 八股文（{plan.tasks.questions.length} 题）</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {plan.tasks.questions.map((t, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{t.topic}</p>
                {t.category && <p className="text-xs text-gray-400">{t.category}</p>}
              </div>
              <Badge variant="outline" className="text-xs">{t.reason}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">💼 项目演练（{plan.tasks.project.length} 项）</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {plan.tasks.project.map((t, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <p className="text-sm font-medium">{t.action}</p>
              <Badge variant="outline" className="text-xs">{t.reason}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
