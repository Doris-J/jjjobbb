"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { projectsApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Message {
  id?: number;
  role: "interviewer" | "user";
  content: string;
}

interface Report {
  score: number;
  grade: string;
  highlights: string[];
  improvements: string[];
  next_focus: string[];
}

export default function InterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = Number(params.id);
  const sessionId = Number(searchParams.get("session"));

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [ending, setEnding] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    // 加载历史消息
    projectsApi.getMessages(sessionId).then((msgs: Message[]) => {
      setMessages(msgs);
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const token = getToken();
    const wsUrl = `ws://localhost:8000/api/projects/sessions/${sessionId}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setMessages((prev) => [...prev, data]);
    };

    return () => ws.close();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    if (!input.trim() || !connected || ended) return;
    const content = input.trim();
    setMessages((prev) => [...prev, { role: "user", content }]);
    wsRef.current?.send(JSON.stringify({ content }));
    setInput("");
  }

  async function handleEnd() {
    setEnding(true);
    try {
      wsRef.current?.close();
      const rep = await projectsApi.endSession(sessionId);
      setReport(rep);
      setEnded(true);
    } catch {
      toast.error("生成报告失败");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* 顶栏 */}
      <div className="border-b px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← 返回</button>
          <h1 className="font-bold">🎤 模拟面试</h1>
          <Badge className={connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
            {connected ? "已连接" : "未连接"}
          </Badge>
        </div>
        {!ended && (
          <Button variant="outline" size="sm" onClick={handleEnd} disabled={ending}>
            {ending ? "生成中..." : "📊 结束并评估"}
          </Button>
        )}
      </div>

      {/* 评估报告 */}
      {report && (
        <div className="p-6 bg-blue-50 border-b">
          <h2 className="font-bold text-lg mb-3">📋 面试评估报告 — {report.grade}（{report.score}分）</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-green-200 bg-white">
              <CardHeader className="pb-1"><CardTitle className="text-sm text-green-600">⭐ 表现亮点</CardTitle></CardHeader>
              <CardContent><ul className="text-xs space-y-1">{report.highlights.map((h, i) => <li key={i}>• {h}</li>)}</ul></CardContent>
            </Card>
            <Card className="border-yellow-200 bg-white">
              <CardHeader className="pb-1"><CardTitle className="text-sm text-yellow-600">⚠️ 待改进</CardTitle></CardHeader>
              <CardContent><ul className="text-xs space-y-1">{report.improvements.map((h, i) => <li key={i}>• {h}</li>)}</ul></CardContent>
            </Card>
            <Card className="border-blue-200 bg-white">
              <CardHeader className="pb-1"><CardTitle className="text-sm text-blue-600">🎯 下次重点</CardTitle></CardHeader>
              <CardContent><ul className="text-xs space-y-1">{report.next_focus.map((h, i) => <li key={i}>• {h}</li>)}</ul></CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-white border text-gray-800"
            }`}>
              {msg.role === "interviewer" && <p className="text-xs text-gray-400 mb-1">🎤 面试官</p>}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      {!ended && (
        <div className="border-t p-4 bg-white flex gap-3">
          <Textarea
            className="resize-none"
            rows={2}
            placeholder="输入你的回答... (Enter 发送，Shift+Enter 换行)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button onClick={sendMessage} disabled={!connected || !input.trim()}>发送</Button>
        </div>
      )}
    </div>
  );
}
