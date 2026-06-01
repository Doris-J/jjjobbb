"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { projectsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Project {
  id: number;
  name: string;
  role: string | null;
  tech_stack: string[] | null;
  project_type: string | null;
  analysis: Record<string, unknown> | null;
  created_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", role: "", background: "", tech_arch: "", my_work: "", highlights: "", difficulties: "",
    tech_stack_str: "", project_type: "",
  });

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...form,
        tech_stack: form.tech_stack_str ? form.tech_stack_str.split(",").map((s) => s.trim()) : [],
        tech_stack_str: undefined,
      };
      const project = await projectsApi.create(data);
      setProjects([project, ...projects]);
      setOpen(false);
      toast.success("项目创建成功");
      setForm({ name: "", role: "", background: "", tech_arch: "", my_work: "", highlights: "", difficulties: "", tech_stack_str: "", project_type: "" });
    } catch {
      toast.error("创建失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">💼 项目深挖</h1>
          <p className="text-gray-500 text-sm mt-1">录入项目，让 AI 扮演面试官深挖你的项目</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2 hover:bg-primary/90">
            + 添加项目
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>录入项目经历</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <Field label="项目名称 *" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="电商商品详情页缓存优化" required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="项目角色">
                  <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="主导/参与/独立完成" />
                </Field>
                <Field label="项目类型">
                  <Input value={form.project_type} onChange={(e) => setForm({ ...form, project_type: e.target.value })} placeholder="高并发/大数据/算法" />
                </Field>
              </div>
              <Field label="技术栈（逗号分隔）">
                <Input value={form.tech_stack_str} onChange={(e) => setForm({ ...form, tech_stack_str: e.target.value })} placeholder="Java, Redis, MySQL, Kafka" />
              </Field>
              <Field label="业务背景 *" required>
                <Textarea value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} placeholder="项目解决什么业务问题..." rows={2} required />
              </Field>
              <Field label="技术架构 *" required>
                <Textarea value={form.tech_arch} onChange={(e) => setForm({ ...form, tech_arch: e.target.value })} placeholder="整体架构设计，用了哪些技术..." rows={2} required />
              </Field>
              <Field label="你的工作 *" required>
                <Textarea value={form.my_work} onChange={(e) => setForm({ ...form, my_work: e.target.value })} placeholder="你负责哪些模块，做了什么..." rows={2} required />
              </Field>
              <Field label="项目亮点">
                <Textarea value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} placeholder="量化的成果，如 QPS 从 1000 提升到 5000..." rows={2} />
              </Field>
              <Field label="遇到的难点">
                <Textarea value={form.difficulties} onChange={(e) => setForm({ ...form, difficulties: e.target.value })} placeholder="遇到什么问题，如何解决..." rows={2} />
              </Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "创建中..." : "创建项目"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">💼</p>
          <p>还没有项目，点击右上角添加你的第一个项目</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/projects/${p.id}`)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <CardDescription>{p.role || "未设置角色"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(p.tech_stack || []).slice(0, 5).map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  {p.analysis ? (
                    <Badge className="bg-green-100 text-green-700">已分析</Badge>
                  ) : (
                    <Badge variant="outline">待分析</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}
