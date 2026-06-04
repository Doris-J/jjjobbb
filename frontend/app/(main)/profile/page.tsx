"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authApi, planApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UserProfile {
  id: number;
  email: string;
  username: string | null;
  target_job: string | null;
  tech_stack: string[] | null;
  target_companies: string[] | null;
  interview_date: string | null;
  level: string | null;
  is_admin: boolean;
}

const LEVELS = ["入门", "中级", "高级"];

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const resumeRef = useRef<HTMLInputElement>(null);

  // Editable fields
  const [username, setUsername] = useState("");
  const [targetJob, setTargetJob] = useState("");
  const [level, setLevel] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [techInput, setTechInput] = useState("");
  const [techStack, setTechStack] = useState<string[]>([]);
  const [companyInput, setCompanyInput] = useState("");
  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);

  useEffect(() => {
    authApi.me().then((data: UserProfile) => {
      setProfile(data);
      setUsername(data.username ?? "");
      setTargetJob(data.target_job ?? "");
      setLevel(data.level ?? "");
      setInterviewDate(data.interview_date ?? "");
      setTechStack(data.tech_stack ?? []);
      setTargetCompanies(data.target_companies ?? []);
    }).catch(() => toast.error("加载用户信息失败"));
  }, []);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await authApi.updateProfile({
        username: username.trim() || undefined,
        target_job: targetJob.trim() || undefined,
        level: level || undefined,
        interview_date: interviewDate || undefined,
        tech_stack: techStack.length ? techStack : undefined,
        target_companies: targetCompanies.length ? targetCompanies : undefined,
      });
      setProfile(updated);
      toast.success("已保存");
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  }

  function addTag(
    input: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void,
  ) {
    const val = input.trim();
    if (!val || list.includes(val)) return;
    setList([...list, val]);
    setInput("");
  }

  function removeTag(val: string, list: string[], setList: (v: string[]) => void) {
    setList(list.filter((t) => t !== val));
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await planApi.uploadResume(file);
      toast.success(`✅ 简历解析完成，已生成 ${result.generated} 条学习计划`);
    } catch { toast.error("上传失败，支持 .md / .pdf / .docx"); }
    finally { setUploading(false); if (resumeRef.current) resumeRef.current.value = ""; }
  }

  if (!profile) {
    return <div className="p-8 text-gray-400">加载中...</div>;
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <input ref={resumeRef} type="file" accept=".md,.pdf,.docx" className="hidden" onChange={handleResumeUpload} />

      <div>
        <h1 className="text-2xl font-bold">👤 个人信息</h1>
        <p className="text-gray-500 text-sm mt-1">管理你的求职目标与个人信息</p>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">邮箱</label>
            <p className="text-sm text-gray-600 px-3 py-2 bg-gray-50 rounded-lg">{profile.email}</p>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="设置你的昵称..."
              className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          {profile.is_admin && (
            <Badge className="bg-purple-100 text-purple-700 text-xs">管理员</Badge>
          )}
        </CardContent>
      </Card>

      {/* Job Target */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">求职目标</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">目标岗位</label>
              <input
                value={targetJob}
                onChange={(e) => setTargetJob(e.target.value)}
                placeholder="例：Java后端、前端、算法..."
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">经验水平</label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(level === l ? "" : l)}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                      level === l ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "hover:border-gray-300"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">求职截止日期（DDL）</label>
            <input
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">技术栈</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {techStack.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">
                  {t}
                  <button onClick={() => removeTag(t, techStack, setTechStack)} className="hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(techInput, techStack, setTechStack, setTechInput); }
                }}
                placeholder="输入技术名回车添加，如 Java、Redis..."
                className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <Button size="sm" variant="outline" onClick={() => addTag(techInput, techStack, setTechStack, setTechInput)}>添加</Button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">目标公司</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {targetCompanies.map((c) => (
                <span key={c} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs">
                  {c}
                  <button onClick={() => removeTag(c, targetCompanies, setTargetCompanies)} className="hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(companyInput, targetCompanies, setTargetCompanies, setCompanyInput); }
                }}
                placeholder="输入公司名回车添加，如 字节、阿里..."
                className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <Button size="sm" variant="outline" onClick={() => addTag(companyInput, targetCompanies, setTargetCompanies, setCompanyInput)}>添加</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resume */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📄 简历管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">上传简历后，AI 将自动解析并生成个性化学习计划条目（支持 .md / .pdf / .docx）</p>
          <Button
            variant="outline"
            onClick={() => resumeRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "解析中..." : "↑ 上传简历"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存信息"}
        </Button>
      </div>
    </div>
  );
}
