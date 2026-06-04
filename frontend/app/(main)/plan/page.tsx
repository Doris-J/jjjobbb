"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { planApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────────────────

interface AlgoItem {
  leetcode_id: number;
  title: string;
  difficulty: string;
  tags: string[];
  url: string;
  reason: string;
}

interface QuestionItem {
  id: number;
  question: string;
  type: string;
  difficulty: string;
  mastery: string | null;
}

interface PlanItem {
  id: number;
  title: string;
  description: string | null;
  item_type: string;
}

interface TodayPlan {
  algo: { list_name: string | null; list_id: number | null; items: AlgoItem[] };
  questions: { set_name: string | null; set_id: number | null; items: QuestionItem[] };
  custom_items: PlanItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  Easy: "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Hard: "bg-red-100 text-red-700",
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
};

const MASTERY_DOT: Record<string, string> = {
  mastered: "bg-green-500",
  fuzzy: "bg-yellow-400",
  unknown: "bg-red-400",
};

// ── Main Page ─────────────────────────────────────────────────────────────

export default function PlanPage() {
  const router = useRouter();
  const [algoCount, setAlgoCount] = useState(3);
  const [questionsCount, setQuestionsCount] = useState(5);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [loading, setLoading] = useState(true);

  // Custom items state
  const [customItems, setCustomItems] = useState<PlanItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load plan on count change
  useEffect(() => {
    setLoading(true);
    planApi.today({ algo_count: algoCount, questions_count: questionsCount })
      .then((data) => {
        setPlan(data);
        setCustomItems(data.custom_items ?? []);
      })
      .catch(() => toast.error("加载计划失败"))
      .finally(() => setLoading(false));
  }, [algoCount, questionsCount]);

  async function addCustomItem() {
    if (!newTitle.trim()) return;
    try {
      const item = await planApi.create({ title: newTitle.trim() });
      setCustomItems((prev) => [...prev, item]);
      setNewTitle("");
    } catch {
      toast.error("添加失败");
    }
  }

  async function deleteCustomItem(id: number) {
    setCustomItems((prev) => prev.filter((i) => i.id !== id));
    try { await planApi.delete(id); } catch { toast.error("删除失败"); }
  }

  async function uploadResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await planApi.uploadResume(file);
      const newItems = await planApi.items();
      setCustomItems(newItems.filter((i: PlanItem & { is_done: boolean }) => !i.is_done));
      toast.success(`AI 已生成 ${result.generated} 个学习条目`);
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">📅 今日学习计划</h1>
          <p className="text-gray-400 text-sm mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".md,.pdf,.docx,.doc" className="hidden" onChange={uploadResume} />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "解析中..." : "📄 上传简历"}
          </Button>
        </div>
      </div>

      {/* Daily target config */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">每日目标配置</p>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 whitespace-nowrap">🧩 算法</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAlgoCount((c) => Math.max(1, c - 1))}
                  className="w-7 h-7 rounded border text-gray-500 hover:bg-gray-100 text-sm"
                >−</button>
                <span className="w-8 text-center text-sm font-medium">{algoCount}</span>
                <button
                  onClick={() => setAlgoCount((c) => Math.min(10, c + 1))}
                  className="w-7 h-7 rounded border text-gray-500 hover:bg-gray-100 text-sm"
                >+</button>
                <span className="text-xs text-gray-400 ml-1">题/天</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 whitespace-nowrap">📖 八股文</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setQuestionsCount((c) => Math.max(1, c - 1))}
                  className="w-7 h-7 rounded border text-gray-500 hover:bg-gray-100 text-sm"
                >−</button>
                <span className="w-8 text-center text-sm font-medium">{questionsCount}</span>
                <button
                  onClick={() => setQuestionsCount((c) => Math.min(20, c + 1))}
                  className="w-7 h-7 rounded border text-gray-500 hover:bg-gray-100 text-sm"
                >+</button>
                <span className="text-xs text-gray-400 ml-1">题/天</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-8">加载中...</div>
      ) : plan && (
        <>
          {/* Algorithm section */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">🧩 今日算法</CardTitle>
                {plan.algo.list_name ? (
                  <span className="text-xs text-gray-400">{plan.algo.list_name}</span>
                ) : (
                  <button
                    onClick={() => router.push("/algorithm")}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    → 去选择题单
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {plan.algo.items.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {plan.algo.list_name ? "全部完成！今日算法目标已达成 🎉" : "请先在算法追踪页选择题单"}
                </p>
              ) : plan.algo.items.map((item) => (
                <div key={item.leetcode_id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.leetcode_id}. {item.title}</span>
                      <Badge className={`text-xs ${DIFF_COLOR[item.difficulty] ?? ""}`}>{item.difficulty}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-xs text-gray-400">{t}</span>
                      ))}
                      <span className="text-xs text-gray-300">· {item.reason}</span>
                    </div>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3">
                    <Button size="sm" variant="outline" className="text-xs">去刷题 →</Button>
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Questions section */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">📖 今日八股文</CardTitle>
                {plan.questions.set_name ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{plan.questions.set_name}</span>
                    <button
                      onClick={() => router.push("/questions")}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      去练习 →
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => router.push("/questions")}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    → 去选择题单
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {plan.questions.items.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {plan.questions.set_name ? "全部掌握！今日八股目标已达成 🎉" : "请先在八股文页选择题单"}
                </p>
              ) : plan.questions.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push("/questions")}
                >
                  <span className="mt-1.5 shrink-0">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      item.mastery ? MASTERY_DOT[item.mastery] : "bg-gray-300"
                    }`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed line-clamp-2">{item.question}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={`text-xs ${DIFF_COLOR[item.difficulty] ?? ""}`}>{item.difficulty}</Badge>
                      {item.mastery && (
                        <span className="text-xs text-gray-400">
                          {item.mastery === "mastered" ? "已掌握" : item.mastery === "fuzzy" ? "模糊" : "不会"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {plan.questions.items.length > 0 && (
                <div className="pt-1">
                  <Button size="sm" onClick={() => router.push("/questions")} className="w-full">
                    开始练习这 {plan.questions.items.length} 道题 →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom items */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">📝 其他任务</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {customItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-2 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                  </div>
                  <button
                    onClick={() => deleteCustomItem(item.id)}
                    className="text-gray-300 hover:text-red-400 text-xs shrink-0 mt-0.5"
                  >✕</button>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
                  placeholder="添加其他任务..."
                  className="flex-1 text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
                <Button size="sm" onClick={addCustomItem} disabled={!newTitle.trim()}>添加</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
