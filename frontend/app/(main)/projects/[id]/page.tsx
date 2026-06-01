"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { projectsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Analysis {
  highlights: string[];
  risks: { point: string; suggestion: string }[];
  tech_deep_dives: string[];
  high_freq_questions: string[];
}

interface Project {
  id: number;
  name: string;
  role: string | null;
  background: string | null;
  tech_arch: string | null;
  my_work: string | null;
  highlights: string | null;
  difficulties: string | null;
  tech_stack: string[] | null;
  project_type: string | null;
  analysis: Analysis | null;
}

interface Session {
  id: number;
  mock_company: string | null;
  score: number | null;
  created_at: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [project, setProject] = useState<Project | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    projectsApi.get(id).then(setProject).catch(() => toast.error("项目不存在"));
    projectsApi.getSessions(id).then(setSessions).catch(() => {});
  }, [id]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const analysis = await projectsApi.analyze(id);
      setProject((prev) => prev ? { ...prev, analysis } : prev);
      toast.success("AI 分析完成");
    } catch {
      toast.error("分析失败，请重试");
    } finally {
      setAnalyzing(false);
    }
  }

  async function startInterview() {
    try {
      const session = await projectsApi.createSession(id);
      router.push(`/projects/${id}/interview?session=${session.id}`);
    } catch {
      toast.error("启动面试失败");
    }
  }

  if (!project) return <div className="p-8 text-gray-400">加载中...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← 返回</button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="flex gap-2 mt-2">
            {project.role && <Badge variant="outline">{project.role}</Badge>}
            {project.project_type && <Badge variant="secondary">{project.project_type}</Badge>}
            {(project.tech_stack || []).slice(0, 4).map((t) => (
              <Badge key={t} className="bg-blue-50 text-blue-700">{t}</Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? "分析中..." : project.analysis ? "重新分析" : "🤖 AI 分析"}
          </Button>
          <Button onClick={startInterview}>🎤 开始模拟面试</Button>
        </div>
      </div>

      <div className="grid gap-4 mb-6">
        {project.background && <InfoCard title="业务背景" content={project.background} />}
        {project.tech_arch && <InfoCard title="技术架构" content={project.tech_arch} />}
        {project.my_work && <InfoCard title="我的工作" content={project.my_work} />}
        {project.highlights && <InfoCard title="项目亮点" content={project.highlights} />}
        {project.difficulties && <InfoCard title="遇到的难点" content={project.difficulties} />}
      </div>

      {project.analysis && (
        <div className="space-y-4 mb-6">
          <h2 className="text-lg font-bold">📊 AI 分析报告</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-700">✅ 项目亮点</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">{project.analysis.highlights.map((h, i) => <li key={i}>• {h}</li>)}</ul>
              </CardContent>
            </Card>
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-700">⚠️ 潜在风险</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2">{project.analysis.risks.map((r, i) => (
                  <li key={i}><p className="font-medium">{r.point}</p><p className="text-gray-500">{r.suggestion}</p></li>
                ))}</ul>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">🎯 高频追问题（{project.analysis.high_freq_questions.length} 个）</CardTitle></CardHeader>
            <CardContent>
              <ol className="text-sm space-y-1 list-decimal list-inside">{project.analysis.high_freq_questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
            </CardContent>
          </Card>
        </div>
      )}

      {sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">历史面试记录</h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div>
                  <span className="text-sm font-medium">{s.mock_company || "模拟面试"}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.score && <Badge>{s.score}分</Badge>}
                  <Button size="sm" variant="outline" onClick={() => router.push(`/projects/${id}/interview?session=${s.id}`)}>
                    查看
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-sm text-gray-500">{title}</CardTitle></CardHeader>
      <CardContent><p className="text-sm whitespace-pre-wrap">{content}</p></CardContent>
    </Card>
  );
}
