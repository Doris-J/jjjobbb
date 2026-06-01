"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { algorithmApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";

interface ProblemList { id: number; name: string; source: string; total_count: number; }
interface Recommendation { leetcode_id: number; title: string; difficulty: string; tags: string[]; url: string; reason: string; }
interface WeakTag { tag: string; count: number; }
interface ProgressData { selected: boolean; list_name?: string; total?: number; completed?: number; progress_pct?: number; }

const MASTERY_OPTIONS = [
  { value: "mastered", label: "✅ 掌握", cls: "bg-green-100 text-green-700 border-green-200" },
  { value: "fuzzy", label: "🤔 模糊", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "unknown", label: "❌ 不会", cls: "bg-red-100 text-red-700 border-red-200" },
];

const DIFF_COLOR: Record<string, string> = {
  Easy: "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Hard: "bg-red-100 text-red-700",
};

export default function AlgorithmPage() {
  const [lists, setLists] = useState<ProblemList[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [daily, setDaily] = useState<Recommendation[]>([]);
  const [weakness, setWeakness] = useState<WeakTag[]>([]);
  const [recordForm, setRecordForm] = useState({ leetcode_id: "", title: "", difficulty: "Medium", tags: "", mastery: "" });

  useEffect(() => {
    algorithmApi.getLists().then(setLists).catch(() => {});
    algorithmApi.getProgress().then(setProgress).catch(() => {});
    algorithmApi.daily().then(setDaily).catch(() => {});
    algorithmApi.weakness().then((d: { weak_tags: WeakTag[] }) => setWeakness(d.weak_tags)).catch(() => {});
  }, []);

  async function selectList(listId: number) {
    try {
      await algorithmApi.selectList(listId);
      const p = await algorithmApi.getProgress();
      setProgress(p);
      const d = await algorithmApi.daily();
      setDaily(d);
      toast.success("题单已选择");
    } catch {
      toast.error("选择失败");
    }
  }

  async function submitRecord() {
    if (!recordForm.leetcode_id || !recordForm.title || !recordForm.mastery) {
      toast.error("请填写题号、标题和掌握度");
      return;
    }
    try {
      await algorithmApi.record({
        leetcode_id: Number(recordForm.leetcode_id),
        title: recordForm.title,
        difficulty: recordForm.difficulty,
        tags: recordForm.tags ? recordForm.tags.split(",").map((t) => t.trim()) : [],
        mastery: recordForm.mastery,
      });
      toast.success("记录成功");
      setRecordForm({ leetcode_id: "", title: "", difficulty: "Medium", tags: "", mastery: "" });
      const d = await algorithmApi.daily();
      setDaily(d);
      const w = await algorithmApi.weakness();
      setWeakness((w as { weak_tags: WeakTag[] }).weak_tags);
      const p = await algorithmApi.getProgress();
      setProgress(p);
    } catch {
      toast.error("记录失败");
    }
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🧩 算法学习追踪</h1>
        <p className="text-gray-500 text-sm mt-1">记录刷题进度，AI 推荐今日题目</p>
      </div>

      {/* 题单选择 */}
      {(!progress?.selected) && (
        <Card>
          <CardHeader><CardTitle className="text-base">选择刷题题单</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => selectList(l.id)}
                className="text-left p-4 rounded-lg border hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-gray-400 mt-1">{l.source} · {l.total_count} 题</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 当前题单进度 */}
      {progress?.selected && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">📚 {progress.list_name}</CardTitle>
              <button onClick={() => setProgress({ selected: false })} className="text-xs text-gray-400 hover:text-gray-600">切换题单</button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-sm">
              <Progress value={progress.progress_pct || 0} className="flex-1 h-3" />
              <span className="text-gray-600 whitespace-nowrap">{progress.completed}/{progress.total} ({progress.progress_pct}%)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 今日推荐 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">📅 今日推荐</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {daily.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无推荐，请先选择题单</p>
          ) : daily.map((r) => (
            <div key={r.leetcode_id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{r.leetcode_id}. {r.title}</span>
                  <Badge className={DIFF_COLOR[r.difficulty] || ""}>{r.difficulty}</Badge>
                </div>
                <div className="flex gap-1 mt-1">
                  {r.tags.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  <span className="text-xs text-gray-400 ml-1">{r.reason}</span>
                </div>
              </div>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">去刷题 →</Button>
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 记录刷题 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">✏️ 记录刷题</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">题号</label>
              <Input
                type="number"
                placeholder="1"
                value={recordForm.leetcode_id}
                onChange={(e) => setRecordForm({ ...recordForm, leetcode_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">题目名称</label>
              <Input
                placeholder="两数之和"
                value={recordForm.title}
                onChange={(e) => setRecordForm({ ...recordForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">标签（逗号分隔）</label>
              <Input
                placeholder="数组, 哈希表"
                value={recordForm.tags}
                onChange={(e) => setRecordForm({ ...recordForm, tags: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">难度</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={recordForm.difficulty}
                onChange={(e) => setRecordForm({ ...recordForm, difficulty: e.target.value })}
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">掌握度</label>
            <div className="flex gap-2">
              {MASTERY_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setRecordForm({ ...recordForm, mastery: m.value })}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    recordForm.mastery === m.value ? m.cls : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={submitRecord}>记录</Button>
        </CardContent>
      </Card>

      {/* 薄弱标签 */}
      {weakness.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">📊 薄弱标签</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {weakness.map((w) => (
                <Badge key={w.tag} variant="destructive">{w.tag} ({w.count})</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
