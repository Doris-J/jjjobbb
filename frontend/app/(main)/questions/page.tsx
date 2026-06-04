"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { questionsApi, questionSetsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

// ── Types ──────────────────────────────────────────────────────────────────

interface QuestionSet {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  total_count: number;
  mastered_count: number;
  is_active: boolean;
}

interface Question {
  id: number;
  category: string;
  subcategory: string;
  question: string;
  answer: string | null;
  type: string;
  difficulty: string;
  options: { key: string; text: string }[] | null;
  correct_option: string | null;
}

interface Feedback {
  score: number;
  correct_points: string[];
  missing_points: string[];
  reference_answer: string;
  next_follow_up_id: number | null;
}

type Mastery = "mastered" | "fuzzy" | "unknown";
type MasteryMap = Record<string, Mastery>;
type View = "list" | "detail" | "editor" | "practice";

// ── Constants ─────────────────────────────────────────────────────────────

const MASTERY_OPTIONS = [
  { value: "mastered" as Mastery, label: "✅ 已掌握", cls: "bg-green-100 text-green-700 border-green-300" },
  { value: "fuzzy" as Mastery, label: "🤔 模糊", cls: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "unknown" as Mastery, label: "❌ 不会", cls: "bg-red-100 text-red-700 border-red-300" },
];

const masteryDot: Record<Mastery, string> = {
  mastered: "bg-green-500",
  fuzzy: "bg-yellow-400",
  unknown: "bg-red-400",
};

const diffColor: Record<string, string> = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
};

const FORMAT_TIP = `### Q1：题目标题？
（简答题，中等难度）

答案内容写在这里...

### Q2：另一道题？ [hard]
（简答题，难度 hard）

答案内容...

### Q3：选择题示例？ [choice|easy]
- A. 选项一
- B. 选项二 ✓
- C. 选项三

答案说明...`;

// ── Shared mastery row ─────────────────────────────────────────────────────

function MasteryRow({ qid, masteryMap, onSet }: {
  qid: number;
  masteryMap: MasteryMap;
  onSet: (id: number, m: Mastery) => void;
}) {
  const cur = masteryMap[String(qid)];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">掌握度：</span>
      {MASTERY_OPTIONS.map((m) => (
        <button
          key={m.value}
          onClick={() => onSet(qid, m.value)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${cur === m.value ? m.cls : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function QuestionsPage() {
  // ── Navigation ──
  const [view, setView] = useState<View>("list");
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [activeSetIds, setActiveSetIds] = useState<number[]>([]);

  // ── Create set ──
  const [showNewSet, setShowNewSet] = useState(false);
  const [newSetCategory, setNewSetCategory] = useState("");
  const [newSetName, setNewSetName] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Detail view ──
  const [detailSetId, setDetailSetId] = useState<number | null>(null);
  const [detailQs, setDetailQs] = useState<Question[]>([]);
  const [detailMastery, setDetailMastery] = useState<MasteryMap>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState<Set<number>>(new Set());

  // ── Editor (overlays detail) ──
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editSetName, setEditSetName] = useState("");
  const [editSetCategory, setEditSetCategory] = useState("");
  const [mdContent, setMdContent] = useState("");
  const [mdLoading, setMdLoading] = useState(false);
  const [mdImporting, setMdImporting] = useState(false);
  const [showFormatTip, setShowFormatTip] = useState(false);
  const [editSetTotalCount, setEditSetTotalCount] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null);

  // ── Practice - browse ──
  const [setQuestionsMap, setSetQuestionsMap] = useState<Record<number, Question[]>>({});
  const [browseFilterSetId, setBrowseFilterSetId] = useState<number | null>(null);
  const [masteryMap, setMasteryMap] = useState<MasteryMap>({});
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // ── Practice - quiz ──
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizMode, setQuizMode] = useState<"choice" | "essay" | "follow_up">("essay");
  const [showQuizAnswer, setShowQuizAnswer] = useState(false);

  const activeSets = sets.filter((s) => activeSetIds.includes(s.id));
  const detailSet = sets.find((s) => s.id === detailSetId) ?? null;
  const editingSet = sets.find((s) => s.id === editingSetId) ?? null;

  // ── Load sets ──────────────────────────────────────────────────────────

  const loadSets = useCallback(async () => {
    try {
      const data = await questionSetsApi.list();
      setSets(data);
      setActiveSetIds(data.filter((s: QuestionSet) => s.is_active).map((s: QuestionSet) => s.id));
    } catch { toast.error("加载题单失败"); }
  }, []);

  useEffect(() => { loadSets(); }, [loadSets]);

  // ── Toggle set active (checkbox) ──────────────────────────────────────

  async function handleToggleSet(e: React.MouseEvent, setId: number) {
    e.stopPropagation();
    try {
      const result = await questionSetsApi.select(setId);
      setSets((prev) => prev.map((s) => s.id === setId ? { ...s, is_active: result.active } : s));
      setActiveSetIds((prev) => result.active ? [...prev, setId] : prev.filter((id) => id !== setId));
    } catch { toast.error("操作失败"); }
  }

  // ── Open detail view ───────────────────────────────────────────────────

  async function openDetail(set: QuestionSet) {
    setDetailSetId(set.id);
    setView("detail");
    setDetailExpanded(new Set());
    setDetailLoading(true);
    try {
      const [qs, mmap] = await Promise.all([
        questionsApi.list({ set_id: set.id, reveal_answer: true, limit: 500 }),
        questionsApi.getMastery({ set_id: set.id }),
      ]);
      setDetailQs(qs);
      setDetailMastery(mmap ?? {});
    } catch { toast.error("加载失败"); }
    finally { setDetailLoading(false); }
  }

  // ── Detail mastery ─────────────────────────────────────────────────────

  async function handleDetailMastery(id: number, mastery: Mastery) {
    const cur = detailMastery[String(id)];
    if (cur === mastery) {
      setDetailMastery((prev) => { const n = { ...prev }; delete n[String(id)]; return n; });
      if (cur === "mastered") setSets((prev) => prev.map((s) => s.id === detailSetId ? { ...s, mastered_count: Math.max(0, s.mastered_count - 1) } : s));
      try { await questionsApi.resetMastery(id); } catch { toast.error("重置失败"); }
    } else {
      const wasMastered = cur === "mastered";
      setDetailMastery((prev) => ({ ...prev, [String(id)]: mastery }));
      if (!wasMastered && mastery === "mastered") setSets((prev) => prev.map((s) => s.id === detailSetId ? { ...s, mastered_count: s.mastered_count + 1 } : s));
      if (wasMastered && mastery !== "mastered") setSets((prev) => prev.map((s) => s.id === detailSetId ? { ...s, mastered_count: Math.max(0, s.mastered_count - 1) } : s));
      try { await questionsApi.setMastery(id, mastery); } catch { toast.error("保存失败"); }
    }
  }

  // ── Open editor ────────────────────────────────────────────────────────

  async function openEditor(set: QuestionSet) {
    setEditingSetId(set.id);
    setEditSetName(set.name);
    setEditSetCategory(set.description ?? "");
    setEditSetTotalCount(set.total_count);
    setShowFormatTip(false);
    setMdLoading(true);
    setView("editor");
    try {
      const data = await questionSetsApi.exportMd(set.id);
      setMdContent(data.content ?? "");
    } catch { setMdContent(""); }
    finally { setMdLoading(false); }
  }

  function closeEditor() {
    setEditingSetId(null);
    loadSets();
    // Return to detail if we came from it, else list
    if (detailSetId !== null) setView("detail");
    else setView("list");
  }

  async function saveEditName() {
    if (!editingSetId || !editSetName.trim()) return;
    try {
      await questionSetsApi.update(editingSetId, { name: editSetName.trim(), description: editSetCategory.trim() || undefined });
      setSets((prev) => prev.map((s) => s.id === editingSetId ? { ...s, name: editSetName.trim(), description: editSetCategory.trim() || s.description } : s));
    } catch { toast.error("保存失败"); }
  }

  async function handleImportMd() {
    if (!editingSetId || mdImporting) return;
    setMdImporting(true);
    try {
      const result = await questionSetsApi.importMd(editingSetId, mdContent);
      setEditSetTotalCount(result.imported);
      setSets((prev) => prev.map((s) => s.id === editingSetId ? { ...s, total_count: result.imported } : s));
      toast.success(`✅ 已导入 ${result.imported} 题`);
    } catch { toast.error("导入失败"); }
    finally { setMdImporting(false); }
  }

  async function handleUploadMd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingSetId) return;
    setMdImporting(true);
    try {
      const result = await questionSetsApi.uploadMd(editingSetId, file);
      const data = await questionSetsApi.exportMd(editingSetId);
      setMdContent(data.content ?? "");
      setEditSetTotalCount(result.imported);
      setSets((prev) => prev.map((s) => s.id === editingSetId ? { ...s, total_count: result.imported } : s));
      toast.success(`✅ 已导入 ${result.imported} 题`);
    } catch { toast.error("上传失败"); }
    finally { setMdImporting(false); if (uploadRef.current) uploadRef.current.value = ""; }
  }

  async function handleDeleteSet(id: number) {
    if (!confirm("确认删除该题单？题单内所有题目也将删除。")) return;
    try {
      await questionSetsApi.delete(id);
      setActiveSetIds((prev) => prev.filter((sid) => sid !== id));
      await loadSets();
      toast.success("已删除");
      setView("list");
      setDetailSetId(null);
      setEditingSetId(null);
    } catch { toast.error("删除失败"); }
  }

  // ── Create set ─────────────────────────────────────────────────────────

  async function handleCreateSet() {
    if (!newSetName.trim() || creating) return;
    setCreating(true);
    try {
      const created = await questionSetsApi.create({ name: newSetName.trim(), description: newSetCategory.trim() || undefined });
      setNewSetName(""); setNewSetCategory(""); setShowNewSet(false);
      await loadSets();
      // Jump to editor for new set
      openEditor({ id: created.id, name: created.name, description: created.description ?? "", is_system: false, total_count: 0, mastered_count: 0, is_active: false });
    } catch { toast.error("创建失败"); }
    finally { setCreating(false); }
  }

  // ── Enter practice ─────────────────────────────────────────────────────

  async function enterPractice() {
    setView("practice");
    setBrowseFilterSetId(null);
    setExpandedIds(new Set());
    setCurrentIdx(0); setFeedback(null); setUserAnswer(""); setSelectedOption(""); setShowQuizAnswer(false);
    const mapResult: Record<number, Question[]> = {};
    await Promise.all(activeSetIds.map(async (sid) => {
      const qs = await questionsApi.list({ set_id: sid, reveal_answer: true, limit: 500 });
      mapResult[sid] = qs;
    }));
    setSetQuestionsMap(mapResult);
    const mmap = await questionsApi.getMastery({ set_ids: activeSetIds });
    setMasteryMap(mmap ?? {});
    const qs = await questionsApi.list({ set_ids: activeSetIds, type: quizMode, reveal_answer: true, limit: 500 });
    setQuizQuestions(qs);
  }

  async function loadQuizQuestions(mode: "choice" | "essay" | "follow_up") {
    setQuizMode(mode);
    setCurrentIdx(0); setFeedback(null); setUserAnswer(""); setSelectedOption(""); setShowQuizAnswer(false);
    try {
      const qs = await questionsApi.list({ set_ids: activeSetIds, type: mode, reveal_answer: true, limit: 500 });
      setQuizQuestions(qs);
    } catch {}
  }

  // ── Browse mastery ─────────────────────────────────────────────────────

  async function handleBrowseMastery(id: number, mastery: Mastery) {
    const cur = masteryMap[String(id)];
    if (cur === mastery) {
      setMasteryMap((prev) => { const n = { ...prev }; delete n[String(id)]; return n; });
      if (cur === "mastered") setSets((prev) => prev.map((s) => activeSetIds.includes(s.id) ? { ...s, mastered_count: Math.max(0, s.mastered_count - 1) } : s));
      try { await questionsApi.resetMastery(id); } catch { toast.error("重置失败"); }
    } else {
      const wasMastered = cur === "mastered";
      setMasteryMap((prev) => ({ ...prev, [String(id)]: mastery }));
      if (!wasMastered && mastery === "mastered") setSets((prev) => prev.map((s) => activeSetIds.includes(s.id) ? { ...s, mastered_count: s.mastered_count + 1 } : s));
      if (wasMastered && mastery !== "mastered") setSets((prev) => prev.map((s) => activeSetIds.includes(s.id) ? { ...s, mastered_count: Math.max(0, s.mastered_count - 1) } : s));
      try { await questionsApi.setMastery(id, mastery); } catch { toast.error("保存失败"); }
    }
  }

  // ── Quiz helpers ───────────────────────────────────────────────────────

  const current = quizQuestions[currentIdx];

  async function submitAnswer() {
    if (!current) return;
    const answer = current.type === "choice" ? selectedOption : userAnswer;
    if (!answer) return;
    setQuizLoading(true);
    try {
      const result = await questionsApi.submitAnswer(current.id, answer);
      setFeedback(result);
      setShowQuizAnswer(false);
    } catch { toast.error("提交失败"); }
    finally { setQuizLoading(false); }
  }

  function nextQuestion() {
    setFeedback(null); setUserAnswer(""); setSelectedOption(""); setShowQuizAnswer(false);
    setCurrentIdx((i) => Math.min(i + 1, quizQuestions.length - 1));
  }

  const totalCount = activeSets.reduce((sum, s) => sum + s.total_count, 0);
  const masteredCount = activeSets.reduce((sum, s) => sum + s.mastered_count, 0);

  // ══════════════════════════════════════════════════════════════════════
  // View: Editor
  // ══════════════════════════════════════════════════════════════════════

  if (view === "editor") {
    return (
      <div className="p-8 max-w-4xl space-y-6">
        <input ref={uploadRef} type="file" accept=".md" className="hidden" onChange={handleUploadMd} />

        <div className="flex items-center gap-3">
          <button onClick={closeEditor} className="text-gray-400 hover:text-gray-600 text-sm">← 返回</button>
          <div>
            <h1 className="text-2xl font-bold">📝 编辑题单</h1>
            <p className="text-gray-500 text-sm mt-0.5">用 Markdown 写题目，格式与系统题库一致</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">题单名称</label>
                  <input value={editSetName} onChange={(e) => setEditSetName(e.target.value)} onBlur={saveEditName} onKeyDown={(e) => e.key === "Enter" && saveEditName()} className="w-full text-sm font-medium border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="题单名称" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">分类（可选）</label>
                  <input value={editSetCategory} onChange={(e) => setEditSetCategory(e.target.value)} onBlur={saveEditName} onKeyDown={(e) => e.key === "Enter" && saveEditName()} className="w-full text-sm text-gray-500 border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="例如：Python笔记、面经..." />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <Button size="sm"
                  onClick={(e) => editingSetId !== null && handleToggleSet(e, editingSetId)}
                  variant={editingSet?.is_active ? "outline" : "default"}
                >
                  {editingSet?.is_active ? "✓ 已加入计划" : "加入学习计划"}
                </Button>
                <button onClick={() => editingSetId !== null && handleDeleteSet(editingSetId)} className="text-xs text-red-400 hover:text-red-600 transition-colors">删除题单</button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">✏️ 题目内容</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">当前 {editSetTotalCount} 题{editSetTotalCount > 0 && "，导入将全量替换"}</span>
                <button onClick={() => uploadRef.current?.click()} disabled={mdImporting} className="text-xs text-gray-500 hover:text-blue-600 border rounded px-2 py-1 transition-colors">↑ 上传 .md 文件</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              {mdLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg z-10">
                  <span className="text-sm text-gray-400">加载中...</span>
                </div>
              )}
              <textarea value={mdContent} onChange={(e) => setMdContent(e.target.value)} placeholder={`### Q1：题目标题？\n\n答案内容...\n\n### Q2：另一道题？ [hard]\n\n答案内容...`} className="w-full h-80 resize-y border rounded-lg p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-200" spellCheck={false} />
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setShowFormatTip((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                {showFormatTip ? "▲ 收起格式说明" : "▼ 展开格式说明"}
              </button>
              <Button onClick={handleImportMd} disabled={mdImporting || !mdContent.trim()}>
                {mdImporting ? "导入中..." : "解析并导入"}
              </Button>
            </div>
            {showFormatTip && (
              <pre className="p-3 bg-gray-50 rounded-lg border text-xs text-gray-600 leading-relaxed overflow-auto">{FORMAT_TIP}</pre>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // View: Detail (questions of one set)
  // ══════════════════════════════════════════════════════════════════════

  if (view === "detail" && detailSet) {
    const isActive = activeSetIds.includes(detailSet.id);
    const detailTotal = detailQs.length;
    const detailMastered = Object.values(detailMastery).filter((m) => m === "mastered").length;

    return (
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-gray-400 hover:text-gray-600 text-sm shrink-0">← 所有题单</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{detailSet.name}</h1>
            {detailSet.description && <p className="text-gray-400 text-sm mt-0.5">{detailSet.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!detailSet.is_system && (
              <Button size="sm" variant="outline" onClick={() => openEditor(detailSet)}>✏️ 编辑内容</Button>
            )}
            <Button
              size="sm"
              variant={isActive ? "outline" : "default"}
              onClick={(e) => handleToggleSet(e, detailSet.id)}
            >
              {isActive ? "✓ 已加入计划" : "+ 加入学习计划"}
            </Button>
          </div>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-gray-500 text-xs">掌握进度</span>
                  <span className="text-gray-600 text-xs">{detailMastered}/{detailTotal}</span>
                </div>
                <Progress value={detailTotal > 0 ? (detailMastered / detailTotal) * 100 : 0} className="h-2" />
              </div>
              <div className="shrink-0 text-gray-400 text-xs">
                共 {detailTotal} 题 · {detailSet.is_system ? "系统题单" : "我的题单"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Question list */}
        {detailLoading ? (
          <p className="text-gray-400 text-sm">加载中...</p>
        ) : detailQs.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center text-gray-400 text-sm">
              {detailSet.is_system ? "暂无题目" : "还没有题目，点击「编辑内容」添加"}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {detailQs.map((q) => {
              const mastery = detailMastery[String(q.id)];
              const expanded = detailExpanded.has(q.id);
              return (
                <div key={q.id} className="rounded-lg border overflow-hidden bg-white">
                  <button
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                    onClick={() => setDetailExpanded((prev) => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                  >
                    <span className="mt-1.5 shrink-0">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${mastery ? masteryDot[mastery] : "bg-gray-300"}`} />
                    </span>
                    <span className="flex-1 text-sm font-medium leading-relaxed">{q.question}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`text-xs ${diffColor[q.difficulty] ?? ""}`}>{q.difficulty}</Badge>
                      {q.type === "choice" && <Badge className="text-xs bg-purple-100 text-purple-700">选择</Badge>}
                      <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t px-4 pt-4 pb-4 space-y-4 bg-gray-50/50">
                      <p className="text-xs text-gray-400">{q.category} · {q.subcategory}</p>
                      {q.type === "choice" && q.options && (
                        <div className="space-y-1.5">
                          {q.options.map((opt) => (
                            <div key={opt.key} className={`px-3 py-2 rounded-lg text-sm border ${opt.key === q.correct_option ? "border-green-400 bg-green-50 text-green-800" : "border-gray-200"}`}>
                              <span className="font-medium">{opt.key}.</span> {opt.text}
                              {opt.key === q.correct_option && <span className="ml-2 text-xs text-green-600">✓ 正确</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.answer && (
                        <div className="bg-white rounded-lg p-4 border">
                          <p className="text-xs font-medium text-gray-500 mb-2">📖 参考答案</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.answer}</p>
                        </div>
                      )}
                      <MasteryRow qid={q.id} masteryMap={detailMastery} onSet={handleDetailMastery} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // View: Practice
  // ══════════════════════════════════════════════════════════════════════

  if (view === "practice") {
    const displaySets = browseFilterSetId
      ? activeSets.filter((s) => s.id === browseFilterSetId)
      : activeSets;
    const totalBrowse = activeSets.reduce((sum, s) => sum + (setQuestionsMap[s.id]?.length ?? 0), 0);

    return (
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">📖 八股文练习</h1>
            <p className="text-gray-500 text-sm mt-1">{activeSets.map((s) => s.name).join("、")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView("list")}>← 管理题单</Button>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">总掌握进度（{activeSets.length} 个题单）</span>
                  <span className="text-xs text-gray-600">{masteredCount}/{totalCount}</span>
                </div>
                <Progress value={totalCount > 0 ? (masteredCount / totalCount) * 100 : 0} className="h-2" />
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">
                {totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Tabs defaultValue="browse" onValueChange={(v) => { if (v !== "browse") loadQuizQuestions(v as "choice" | "essay" | "follow_up"); }}>
              <TabsList className="mb-4">
                <TabsTrigger value="browse">浏览背诵</TabsTrigger>
                <TabsTrigger value="choice">选择题</TabsTrigger>
                <TabsTrigger value="essay">简答题</TabsTrigger>
                <TabsTrigger value="follow_up">连环追问</TabsTrigger>
              </TabsList>

              {/* ── Browse ── */}
              <TabsContent value="browse">
                {/* Set filter bar */}
                {activeSets.length > 1 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <button
                      onClick={() => setBrowseFilterSetId(null)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${!browseFilterSetId ? "bg-blue-50 border-blue-400 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-600"}`}
                    >
                      全部（{totalBrowse} 题）
                    </button>
                    {activeSets.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setBrowseFilterSetId(s.id === browseFilterSetId ? null : s.id)}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${browseFilterSetId === s.id ? "bg-blue-50 border-blue-400 text-blue-700 font-medium" : "hover:bg-gray-50 text-gray-600"}`}
                      >
                        {s.name}（{setQuestionsMap[s.id]?.length ?? 0} 题）
                      </button>
                    ))}
                  </div>
                )}

                {displaySets.length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无题目</p>
                ) : (
                  <div className="space-y-6">
                    {displaySets.map((set) => {
                      const qs = setQuestionsMap[set.id] ?? [];
                      return (
                        <div key={set.id}>
                          {activeSets.length > 1 && !browseFilterSetId && (
                            <div className="flex items-center gap-3 mb-3">
                              <span className="text-sm font-semibold text-gray-700 shrink-0">{set.name}</span>
                              <div className="flex-1 border-t border-gray-200" />
                              <span className="text-xs text-gray-400 shrink-0">{qs.length} 题</span>
                            </div>
                          )}
                          <div className="space-y-2">
                            {qs.map((q) => {
                              const mastery = masteryMap[String(q.id)];
                              const expanded = expandedIds.has(q.id);
                              return (
                                <div key={q.id} className="rounded-lg border overflow-hidden bg-white">
                                  <button
                                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                                    onClick={() => setExpandedIds((prev) => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                  >
                                    <span className="mt-1.5 shrink-0">
                                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${mastery ? masteryDot[mastery] : "bg-gray-300"}`} />
                                    </span>
                                    <span className="flex-1 text-sm font-medium leading-relaxed">{q.question}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge className={`text-xs ${diffColor[q.difficulty] ?? ""}`}>{q.difficulty}</Badge>
                                      <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
                                    </div>
                                  </button>
                                  {expanded && (
                                    <div className="border-t px-4 pt-4 pb-4 space-y-4 bg-gray-50/50">
                                      <p className="text-xs text-gray-400">{q.category} · {q.subcategory}</p>
                                      {q.type === "choice" && q.options && (
                                        <div className="space-y-1.5">
                                          {q.options.map((opt) => (
                                            <div key={opt.key} className={`px-3 py-2 rounded-lg text-sm border ${opt.key === q.correct_option ? "border-green-400 bg-green-50 text-green-800" : "border-gray-200"}`}>
                                              <span className="font-medium">{opt.key}.</span> {opt.text}
                                              {opt.key === q.correct_option && <span className="ml-2 text-xs text-green-600">✓ 正确</span>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {q.answer && (
                                        <div className="bg-white rounded-lg p-4 border">
                                          <p className="text-xs font-medium text-gray-500 mb-2">📖 参考答案</p>
                                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.answer}</p>
                                        </div>
                                      )}
                                      <MasteryRow qid={q.id} masteryMap={masteryMap} onSet={handleBrowseMastery} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── Quiz modes ── */}
              {(["choice", "essay", "follow_up"] as const).map((tabMode) => (
                <TabsContent key={tabMode} value={tabMode}>
                  {quizQuestions.length === 0 ? (
                    <p className="text-gray-400 text-sm">暂无{tabMode === "choice" ? "选择题" : tabMode === "essay" ? "简答题" : "追问题"}</p>
                  ) : !current ? null : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>{currentIdx + 1} / {quizQuestions.length}</span>
                        <Progress value={((currentIdx + 1) / quizQuestions.length) * 100} className="flex-1 h-1.5" />
                        <Badge className={diffColor[current.difficulty] || ""}>{current.difficulty}</Badge>
                      </div>

                      <div className="rounded-lg border p-5 space-y-4 bg-white">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">{current.category} · {current.subcategory}</p>
                          <p className="text-base font-medium leading-relaxed">{current.question}</p>
                        </div>

                        {/* Choice options */}
                        {current.type === "choice" && current.options && (
                          <div className="space-y-2">
                            {current.options.map((opt) => {
                              const isCorrect = opt.key === current.correct_option;
                              const isSelected = selectedOption === opt.key;
                              let cls = "border-gray-200 hover:bg-gray-50";
                              if (feedback) {
                                if (isCorrect) cls = "border-green-500 bg-green-50 text-green-800";
                                else if (isSelected) cls = "border-red-400 bg-red-50 text-red-800";
                                else cls = "border-gray-200 text-gray-400";
                              } else if (isSelected) cls = "border-blue-500 bg-blue-50";
                              return (
                                <button key={opt.key} onClick={() => !feedback && setSelectedOption(opt.key)} disabled={!!feedback} className={`w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors ${cls}`}>
                                  <span className="font-medium">{opt.key}.</span> {opt.text}
                                  {feedback && isCorrect && <span className="ml-2 text-xs text-green-600">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Essay input */}
                        {current.type !== "choice" && !feedback && (
                          <Textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} placeholder="输入你的回答..." rows={5} />
                        )}

                        {/* Peek answer (pre-submit) */}
                        {!feedback && current.answer && (
                          <button onClick={() => setShowQuizAnswer((v) => !v)} className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
                            {showQuizAnswer ? "▲ 收起参考答案" : "▼ 查看参考答案"}
                          </button>
                        )}
                        {showQuizAnswer && !feedback && current.answer && (
                          <div className="bg-gray-50 rounded-lg p-4 border">
                            <p className="text-xs font-medium text-gray-500 mb-2">📖 参考答案</p>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{current.answer}</p>
                          </div>
                        )}

                        {/* Feedback */}
                        {feedback && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{feedback.score.toFixed(0)} 分</span>
                              <Progress value={feedback.score} className="flex-1 h-2" />
                            </div>
                            {feedback.correct_points.length > 0 && (
                              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                <p className="text-xs font-medium text-green-600 mb-1">✅ 答对的</p>
                                <ul className="text-sm space-y-0.5">{feedback.correct_points.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                              </div>
                            )}
                            {feedback.missing_points.length > 0 && (
                              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                                <p className="text-xs font-medium text-red-600 mb-1">❌ 遗漏的</p>
                                <ul className="text-sm space-y-0.5">{feedback.missing_points.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                              </div>
                            )}
                            <div className="bg-gray-50 rounded-lg p-4 border">
                              <p className="text-xs font-medium text-gray-500 mb-2">📖 参考答案</p>
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{feedback.reference_answer}</p>
                            </div>
                          </div>
                        )}

                        {/* Mastery (always visible) */}
                        <div className="pt-2 border-t">
                          <MasteryRow qid={current.id} masteryMap={masteryMap} onSet={handleBrowseMastery} />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          {!feedback ? (
                            <Button onClick={submitAnswer} disabled={quizLoading || (!selectedOption && !userAnswer.trim())}>
                              {quizLoading ? "评分中..." : "提交"}
                            </Button>
                          ) : (
                            <Button onClick={nextQuestion} disabled={currentIdx >= quizQuestions.length - 1}>
                              {currentIdx >= quizQuestions.length - 1 ? "已完成 🎉" : "下一题 →"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // View: List (default — all sets with checkbox selection)
  // ══════════════════════════════════════════════════════════════════════

  const systemSets = sets.filter((s) => s.is_system);
  const userSets = sets.filter((s) => !s.is_system);
  const sysGroups: Record<string, QuestionSet[]> = {};
  for (const s of systemSets) {
    const key = s.description ?? "其他";
    if (!sysGroups[key]) sysGroups[key] = [];
    sysGroups[key].push(s);
  }
  const userGroups: Record<string, QuestionSet[]> = {};
  for (const s of userSets) {
    const key = s.description?.trim() || "未分类";
    if (!userGroups[key]) userGroups[key] = [];
    userGroups[key].push(s);
  }
  const existingCategories = Object.keys(userGroups).filter((k) => k !== "未分类");
  const pendingTotal = sets.filter((s) => activeSetIds.includes(s.id)).reduce((sum, s) => sum + s.total_count, 0);

  // Inline set card component
  function SetCard({ s }: { s: QuestionSet }) {
    const active = activeSetIds.includes(s.id);
    return (
      <div
        onClick={() => openDetail(s)}
        className="rounded-lg border bg-white hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer relative"
      >
        {/* Checkbox */}
        <button
          onClick={(e) => handleToggleSet(e, s.id)}
          title={active ? "取消选中" : "加入练习计划"}
          className={`absolute top-2.5 right-2.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10 ${active ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 bg-white hover:border-blue-400"}`}
        >
          {active && <span className="text-xs leading-none">✓</span>}
        </button>

        <div className="p-3 pr-9">
          <p className="font-medium text-sm leading-snug">{s.name}</p>
          {s.is_system ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <Progress value={s.total_count > 0 ? (s.mastered_count / s.total_count) * 100 : 0} className="flex-1 h-1" />
                <span className="text-xs text-gray-400 shrink-0">{s.mastered_count}/{s.total_count}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">{s.total_count} 题</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-6 pb-32">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">📖 八股文</h1>
          <p className="text-gray-500 text-sm mt-1">点击题单查看详情，☑ 勾选加入练习计划</p>
        </div>
      </div>

      {/* System sets */}
      {systemSets.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">📚 系统题单</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {Object.entries(sysGroups).map(([cat, groupSets]) => (
              <div key={cat}>
                <p className="text-xs text-gray-400 mb-2">{cat}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {groupSets.map((s) => <SetCard key={s.id} s={s} />)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* My sets */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">📝 我的题单</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {Object.entries(userGroups).map(([cat, groupSets]) => (
            <div key={cat}>
              <p className="text-xs text-gray-400 mb-2">{cat}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {groupSets.map((s) => <SetCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}

          {!showNewSet ? (
            <button onClick={() => setShowNewSet(true)} className="w-full p-3 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-sm">
              + 新建题单
            </button>
          ) : (
            <div className="p-4 rounded-lg border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">分类名称（可选）</label>
                  <input value={newSetCategory} onChange={(e) => setNewSetCategory(e.target.value)} placeholder="例如：Python笔记、面经..." list="cat-options" className="w-full text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <datalist id="cat-options">{existingCategories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">题单名称</label>
                  <input autoFocus value={newSetName} onChange={(e) => setNewSetName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateSet(); if (e.key === "Escape") setShowNewSet(false); }} placeholder="例如：基础语法、Spring MVC..." className="w-full text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setShowNewSet(false); setNewSetName(""); setNewSetCategory(""); }}>取消</Button>
                <Button size="sm" onClick={handleCreateSet} disabled={creating || !newSetName.trim()}>{creating ? "创建中..." : "创建并编辑"}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky bottom bar */}
      {activeSetIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-8 py-4 flex items-center justify-between z-50">
          <span className="text-sm text-gray-600">
            已选 <span className="font-semibold text-blue-600">{activeSetIds.length}</span> 个题单，共 <span className="font-semibold">{pendingTotal}</span> 题
          </span>
          <Button onClick={enterPractice}>开始练习 →</Button>
        </div>
      )}
    </div>
  );
}
