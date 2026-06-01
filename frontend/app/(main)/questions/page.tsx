"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { questionsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

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

export default function QuestionsPage() {
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [selectedCat, setSelectedCat] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"choice" | "essay" | "follow_up">("essay");

  useEffect(() => {
    questionsApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCat) return;
    questionsApi.list({ category: selectedCat, type: mode, limit: 20 }).then((qs: Question[]) => {
      setQuestions(qs);
      setCurrentIdx(0);
      setFeedback(null);
      setUserAnswer("");
      setSelectedOption("");
    });
  }, [selectedCat, mode]);

  const current = questions[currentIdx];

  async function submitAnswer() {
    if (!current) return;
    const answer = mode === "choice" ? selectedOption : userAnswer;
    if (!answer) return;
    setLoading(true);
    try {
      const result = await questionsApi.submitAnswer(current.id, answer);
      setFeedback(result);
    } catch {
      toast.error("提交失败");
    } finally {
      setLoading(false);
    }
  }

  function nextQuestion() {
    setFeedback(null);
    setUserAnswer("");
    setSelectedOption("");
    setCurrentIdx((i) => Math.min(i + 1, questions.length - 1));
  }

  const diffColor = { easy: "bg-green-100 text-green-700", medium: "bg-yellow-100 text-yellow-700", hard: "bg-red-100 text-red-700" };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📖 八股文抽查</h1>
        <p className="text-gray-500 text-sm mt-1">三种模式全面检验知识掌握程度</p>
      </div>

      <div className="flex gap-3 mb-6">
        <Select onValueChange={(v: string | null) => setSelectedCat(v ?? "")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="选择分类" />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(categories).map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCat && (
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList className="mb-4">
            <TabsTrigger value="choice">选择题</TabsTrigger>
            <TabsTrigger value="essay">简答题</TabsTrigger>
            <TabsTrigger value="follow_up">连环追问</TabsTrigger>
          </TabsList>

          <TabsContent value={mode}>
            {questions.length === 0 ? (
              <p className="text-gray-400">该分类暂无题目</p>
            ) : !current ? null : (
              <div className="space-y-4">
                {/* 进度 */}
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{currentIdx + 1} / {questions.length}</span>
                  <Progress value={((currentIdx + 1) / questions.length) * 100} className="flex-1 h-1.5" />
                  <Badge className={diffColor[current.difficulty as keyof typeof diffColor] || ""}>
                    {current.difficulty}
                  </Badge>
                </div>

                {/* 题目 */}
                <Card>
                  <CardHeader className="pb-2">
                    <p className="text-xs text-gray-400">{current.category} · {current.subcategory}</p>
                    <CardTitle className="text-base font-medium">{current.question}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* 选择题选项 */}
                    {current.type === "choice" && current.options && !feedback && (
                      <div className="space-y-2">
                        {current.options.map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() => setSelectedOption(opt.key)}
                            className={`w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors ${
                              selectedOption === opt.key ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <span className="font-medium">{opt.key}.</span> {opt.text}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 简答题输入 */}
                    {current.type !== "choice" && !feedback && (
                      <Textarea
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="输入你的回答..."
                        rows={5}
                      />
                    )}

                    {/* 反馈 */}
                    {feedback && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{feedback.score.toFixed(0)}分</span>
                          <Progress value={feedback.score} className="flex-1 h-2" />
                        </div>
                        {feedback.correct_points.length > 0 && (
                          <div className="bg-green-50 rounded-lg p-3">
                            <p className="text-xs font-medium text-green-600 mb-1">✅ 答对的</p>
                            <ul className="text-sm space-y-0.5">{feedback.correct_points.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                          </div>
                        )}
                        {feedback.missing_points.length > 0 && (
                          <div className="bg-red-50 rounded-lg p-3">
                            <p className="text-xs font-medium text-red-600 mb-1">❌ 遗漏的</p>
                            <ul className="text-sm space-y-0.5">{feedback.missing_points.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                          </div>
                        )}
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">📖 参考答案</p>
                          <p className="text-sm whitespace-pre-wrap">{feedback.reference_answer}</p>
                        </div>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                      {!feedback ? (
                        <Button onClick={submitAnswer} disabled={loading || (!selectedOption && !userAnswer.trim())}>
                          {loading ? "评分中..." : "提交"}
                        </Button>
                      ) : (
                        <Button onClick={nextQuestion} disabled={currentIdx >= questions.length - 1}>
                          {currentIdx >= questions.length - 1 ? "已完成" : "下一题 →"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
