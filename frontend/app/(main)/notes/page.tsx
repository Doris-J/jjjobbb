"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import Markdown from "react-markdown";
import { notesApi } from "@/lib/api";

interface NoteNode {
  id: number;
  parent_id: number | null;
  title: string;
  order: number;
  children: NoteNode[];
}

interface NoteDetail {
  id: number;
  title: string;
  content: string;
  updated_at: string;
}

// ── 树节点组件 ─────────────────────────────────────────────────────────────────

interface TreeItemProps {
  node: NoteNode;
  depth: number;
  selectedId: number | null;
  expanded: Set<number>;
  onSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onDelete: (id: number, title: string) => void;
}

function NoteTreeItem({ node, depth, selectedId, expanded, onSelect, onToggleExpand, onAddChild, onDelete }: TreeItemProps) {
  const isSelected = selectedId === node.id;
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 14 + 4 }}
        className={`flex items-center gap-0.5 group py-0.5 pr-1 rounded-md cursor-pointer select-none ${
          isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100 text-gray-700"
        }`}
      >
        {/* 展开/折叠按钮 */}
        <button
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 text-xs"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(node.id); }}
        >
          {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
        </button>
        {/* 标题 */}
        <span
          className="flex-1 text-sm truncate py-1"
          onClick={() => onSelect(node.id)}
        >
          📄 {node.title || "未命名页面"}
        </span>
        {/* Hover 操作按钮 */}
        <button
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 text-sm shrink-0"
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          title="新建子页面"
        >+</button>
        <button
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 text-sm shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.title); }}
          title="删除"
        >×</button>
      </div>
      {/* 子节点 */}
      {isExpanded && node.children.map((child) => (
        <NoteTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expanded={expanded}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [tree, setTree] = useState<NoteNode[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [treeLoading, setTreeLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const noteRef = useRef<NoteDetail | null>(null);

  // 同步 dirty/note 到 ref（避免 Ctrl+S effect 闭包过期）
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { noteRef.current = note; }, [note]);

  // 加载树
  const loadTree = useCallback(async (silent = false) => {
    if (!silent) setTreeLoading(true);
    try {
      const data = await notesApi.tree();
      setTree(data);
    } catch {
      toast.error("加载笔记列表失败");
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  // 保存（用 ref 避免闭包问题）
  const handleSave = useCallback(async () => {
    const n = noteRef.current;
    if (!n || !dirtyRef.current) return;
    setSaving(true);
    try {
      await notesApi.update(n.id, { title: n.title, content: n.content });
      setDirty(false);
      toast.success("已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, []);

  // Ctrl+S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  // 选中笔记
  async function handleSelect(id: number) {
    if (dirtyRef.current && !window.confirm("有未保存的内容，确认切换？")) return;
    setSelectedId(id);
    setDirty(false);
    setContentLoading(true);
    try {
      const data = await notesApi.get(id);
      setNote(data);
    } catch {
      toast.error("加载笔记内容失败");
    } finally {
      setContentLoading(false);
    }
  }

  // 折叠/展开
  function handleToggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 新建根笔记
  async function handleAddRoot() {
    try {
      const created = await notesApi.create({ title: "未命名页面" });
      await loadTree(true);
      handleSelect(created.id);
    } catch {
      toast.error("创建失败");
    }
  }

  // 新建子页面
  async function handleAddChild(parentId: number) {
    try {
      const created = await notesApi.create({ title: "未命名页面", parent_id: parentId });
      setExpanded((prev) => new Set([...prev, parentId]));
      await loadTree(true);
      handleSelect(created.id);
    } catch {
      toast.error("创建子页面失败");
    }
  }

  // 删除笔记
  async function handleDelete(id: number, title: string) {
    if (!window.confirm(`删除「${title || "未命名页面"}」及其所有子页面？此操作不可恢复。`)) return;
    try {
      await notesApi.delete(id);
      if (selectedId === id) { setSelectedId(null); setNote(null); setDirty(false); }
      await loadTree(true);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  // 标题失焦自动保存
  async function handleTitleBlur() {
    if (dirtyRef.current) await handleSave();
  }

  return (
    <div className="flex h-full">
      {/* ── 左侧树 ── */}
      <aside className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b">
          <h2 className="font-semibold text-sm text-gray-700">学习笔记</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {treeLoading ? (
            <div className="px-3 py-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-4">还没有笔记</p>
          ) : (
            tree.map((node) => (
              <NoteTreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onSelect={handleSelect}
                onToggleExpand={handleToggleExpand}
                onAddChild={handleAddChild}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        <div className="p-2 border-t">
          <button
            onClick={handleAddRoot}
            className="w-full text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md px-2 py-1.5 text-left transition-colors"
          >
            + 新建页面
          </button>
        </div>
      </aside>

      {/* ── 右侧编辑区 ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {!note && !contentLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-5xl mb-4">📝</p>
              <p className="text-sm">选择左侧笔记开始阅读，或点击"+ 新建页面"</p>
            </div>
          </div>
        ) : contentLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : note && (
          <>
            {/* 标题栏 */}
            <div className="border-b px-10 py-5">
              <input
                className="w-full text-2xl font-bold outline-none text-gray-800 placeholder-gray-300 bg-transparent"
                value={note.title}
                placeholder="页面标题"
                onChange={(e) => {
                  setNote((n) => n ? { ...n, title: e.target.value } : n);
                  setDirty(true);
                }}
                onBlur={handleTitleBlur}
              />
            </div>

            {/* 工具栏 */}
            <div className="border-b px-10 py-2 flex items-center gap-2">
              <button
                onClick={() => setMode("edit")}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  mode === "edit" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                ✏️ 编辑
              </button>
              <button
                onClick={() => setMode("preview")}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  mode === "preview" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                👁 预览
              </button>

              <div className="flex-1" />

              {dirty && <span className="text-xs text-orange-400 font-medium">• 未保存</span>}

              <button
                onClick={() => handleAddChild(note.id)}
                className="text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-md transition-colors"
              >
                + 子页面
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="text-sm bg-blue-600 text-white px-4 py-1 rounded-md disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-10 py-6">
              {mode === "edit" ? (
                <textarea
                  className="w-full h-full min-h-[400px] font-mono text-sm outline-none resize-none text-gray-800 leading-relaxed bg-transparent"
                  placeholder={"用 Markdown 写点什么...\n\n## 示例\n\n- 支持列表\n- **粗体** 和 *斜体*\n- `代码` 块\n\n```java\nSystem.out.println(\"Hello\");\n```"}
                  value={note.content}
                  onChange={(e) => {
                    setNote((n) => n ? { ...n, content: e.target.value } : n);
                    setDirty(true);
                  }}
                />
              ) : (
                <div className="md-body text-gray-800">
                  {note.content ? (
                    <Markdown>{note.content}</Markdown>
                  ) : (
                    <p className="text-gray-400 text-sm">（暂无内容，切换到编辑模式开始写作）</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
