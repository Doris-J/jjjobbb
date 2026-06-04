"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminApi, questionSetsApi, questionsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// ── Types ──────────────────────────────────────────────────────────────────

interface FileTree { [category: string]: string[]; }

interface QuestionSet {
  id: number;
  name: string;
  description: string | null;
  total_count: number;
}

interface SetQuestion {
  id: number;
  question: string;
  type: string;
  difficulty: string;
  category: string;
  subcategory: string;
  order: number;
}

// ── File Editor ───────────────────────────────────────────────────────────

function FileEditor() {
  const [fileTree, setFileTree] = useState<FileTree>({});
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.files().then(setFileTree).catch(() => toast.error("加载文件列表失败"));
  }, []);

  async function handleSelectFile(category: string, filename: string) {
    if (saving) return;
    setLoading(true);
    try {
      const data = await adminApi.getFile(category, filename);
      setSelectedCategory(category);
      setSelectedFile(filename);
      setContent(data.content);
      setOriginalContent(data.content);
    } catch {
      toast.error("加载文件失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedFile || saving) return;
    setSaving(true);
    try {
      const result = await adminApi.saveFile(selectedCategory, selectedFile, content);
      setOriginalContent(content);
      toast.success(`✅ 已导入 ${result.imported} 题`);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = content !== originalContent;

  return (
    <div className="flex h-full">
      {/* Left file tree */}
      <aside className="w-60 bg-white border-r overflow-y-auto shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm text-gray-700">题库文件</h2>
        </div>
        <div className="p-2">
          {Object.entries(fileTree).map(([category, files]) => (
            <div key={category} className="mb-3">
              <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">{category}</p>
              {files.map((filename) => {
                const active = selectedCategory === category && selectedFile === filename;
                return (
                  <button
                    key={filename}
                    onClick={() => handleSelectFile(category, filename)}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                      active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {filename}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Right editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between px-6 py-3 border-b bg-white">
              <div>
                <span className="text-sm text-gray-400">{selectedCategory}</span>
                <span className="text-sm text-gray-400 mx-1">/</span>
                <span className="text-sm font-medium text-gray-700">{selectedFile}</span>
                {isDirty && <span className="ml-2 text-xs text-orange-500">● 未保存</span>}
              </div>
              <Button onClick={handleSave} disabled={saving || !isDirty} size="sm">
                {saving ? "导入中..." : "保存并导入"}
              </Button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载中...</div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full resize-none border rounded-lg p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-200"
                  spellCheck={false}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            ← 从左侧选择文件开始编辑
          </div>
        )}
      </div>
    </div>
  );
}

// ── Question Set Manager ───────────────────────────────────────────────────

function SetManager() {
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null);
  const [setQuestions, setSetQuestions] = useState<SetQuestion[]>([]);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [filterCat, setFilterCat] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [browseQuestions, setBrowseQuestions] = useState<SetQuestion[]>([]);
  const [newSetName, setNewSetName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadSets();
    questionsApi.categories().then(setCategories).catch(() => {});
  }, []);

  async function loadSets() {
    try {
      const all = await questionSetsApi.list();
      setSets(all.filter((s: QuestionSet & { is_system: boolean }) => s.is_system));
    } catch {
      toast.error("加载题单失败");
    }
  }

  async function selectSet(set: QuestionSet) {
    setSelectedSet(set);
    try {
      const data = await questionSetsApi.get(set.id);
      setSetQuestions(data.questions ?? []);
    } catch {
      toast.error("加载题单详情失败");
    }
  }

  async function createSet() {
    if (!newSetName.trim()) return;
    setCreating(true);
    try {
      await questionSetsApi.adminCreate({ name: newSetName.trim(), question_ids: [] });
      setNewSetName("");
      await loadSets();
      toast.success("题单已创建");
    } catch {
      toast.error("创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function deleteSet(id: number) {
    try {
      await questionSetsApi.adminDelete(id);
      if (selectedSet?.id === id) { setSelectedSet(null); setSetQuestions([]); }
      await loadSets();
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  async function removeQuestion(questionId: number) {
    if (!selectedSet) return;
    try {
      await questionSetsApi.adminRemoveItem(selectedSet.id, questionId);
      setSetQuestions((prev) => prev.filter((q) => q.id !== questionId));
      setSets((prev) => prev.map((s) => s.id === selectedSet.id ? { ...s, total_count: s.total_count - 1 } : s));
    } catch {
      toast.error("移除失败");
    }
  }

  async function addQuestion(questionId: number) {
    if (!selectedSet) return;
    try {
      await questionSetsApi.adminAddItem(selectedSet.id, questionId);
      // reload questions for this set
      const data = await questionSetsApi.get(selectedSet.id);
      setSetQuestions(data.questions ?? []);
      setSets((prev) => prev.map((s) => s.id === selectedSet.id ? { ...s, total_count: s.total_count + 1 } : s));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (msg?.includes("已在题单")) toast.error("该题目已在题单中");
      else toast.error("添加失败");
    }
  }

  // Browse available questions filtered by category/subcategory
  useEffect(() => {
    if (!filterCat || !filterSub) { setBrowseQuestions([]); return; }
    questionsApi.list({ category: filterCat, subcategory: filterSub, reveal_answer: false, limit: 200 })
      .then(setBrowseQuestions)
      .catch(() => {});
  }, [filterCat, filterSub]);

  const setQIds = new Set(setQuestions.map((q) => q.id));

  return (
    <div className="flex h-full">
      {/* Left: set list */}
      <aside className="w-64 bg-white border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">系统题单</h2>
          <div className="flex gap-2">
            <input
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createSet()}
              placeholder="新题单名称..."
              className="flex-1 text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <Button size="sm" onClick={createSet} disabled={creating || !newSetName.trim()} className="text-xs px-2">
              新建
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sets.length === 0 && (
            <p className="text-xs text-gray-400 px-2 pt-2">暂无系统题单</p>
          )}
          {sets.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                selectedSet?.id === s.id ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"
              }`}
              onClick={() => selectSet(s)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-gray-400">{s.description && `${s.description} · `}{s.total_count} 题</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSet(s.id); }}
                className="text-gray-300 hover:text-red-400 text-xs ml-2 shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Right: set details */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedSet ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            ← 从左侧选择或创建题单
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div>
              <h3 className="font-semibold text-gray-800">{selectedSet.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">共 {setQuestions.length} 题</p>
            </div>

            {/* Current questions */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">题单内容</p>
              {setQuestions.length === 0 ? (
                <p className="text-xs text-gray-400">题单为空，在下方添加题目</p>
              ) : (
                <div className="space-y-1">
                  {setQuestions.map((q) => (
                    <div key={q.id} className="flex items-start gap-2 p-2 rounded border hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">{q.question}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{q.category} · {q.subcategory}</span>
                          <Badge className="text-xs px-1.5 py-0">{q.difficulty}</Badge>
                        </div>
                      </div>
                      <button
                        onClick={() => removeQuestion(q.id)}
                        className="text-gray-300 hover:text-red-400 text-xs shrink-0 mt-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add questions */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">添加题目</p>
              <div className="flex gap-2 mb-3">
                <select
                  value={filterCat}
                  onChange={(e) => { setFilterCat(e.target.value); setFilterSub(""); }}
                  className="border rounded px-2 py-1.5 text-sm focus:outline-none"
                >
                  <option value="">选择分类</option>
                  {Object.keys(categories).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  value={filterSub}
                  onChange={(e) => setFilterSub(e.target.value)}
                  disabled={!filterCat}
                  className="border rounded px-2 py-1.5 text-sm focus:outline-none disabled:opacity-40"
                >
                  <option value="">选择小节</option>
                  {(categories[filterCat] ?? []).map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
              {browseQuestions.length > 0 && (
                <div className="space-y-1 max-h-72 overflow-y-auto border rounded-lg p-2">
                  {browseQuestions.map((q) => {
                    const inSet = setQIds.has(q.id);
                    return (
                      <div key={q.id} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed line-clamp-2">{q.question}</p>
                          <Badge className="text-xs px-1.5 py-0 mt-1">{q.difficulty}</Badge>
                        </div>
                        <button
                          onClick={() => !inSet && addQuestion(q.id)}
                          disabled={inSet}
                          className={`text-xs shrink-0 mt-1 px-2 py-1 rounded transition-colors ${
                            inSet
                              ? "text-gray-300 cursor-default"
                              : "text-blue-600 hover:bg-blue-50"
                          }`}
                        >
                          {inSet ? "已添加" : "+ 添加"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Page ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="files" className="flex flex-col h-full">
        <div className="border-b bg-white px-4 pt-3 shrink-0">
          <TabsList className="mb-0">
            <TabsTrigger value="files">题库文件</TabsTrigger>
            <TabsTrigger value="sets">题单管理</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="files" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex flex-col">
          <FileEditor />
        </TabsContent>
        <TabsContent value="sets" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex flex-col">
          <SetManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
