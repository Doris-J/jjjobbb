"""
Mock AI Service - 所有方法返回结构化 mock 数据。
接入 DeepSeek 时只需替换各方法实现，接口不变。
"""
import random
from typing import List


class AIService:

    def analyze_project(self, project: dict) -> dict:
        """分析项目，返回亮点/风险/追问题清单"""
        tech_stack = project.get("tech_stack", []) or []
        name = project.get("name", "该项目")
        return {
            "highlights": [
                f"{name}采用了{', '.join(tech_stack[:2]) if tech_stack else '多种技术'}，具有技术深度",
                "项目有明确的业务价值和量化成果",
                "技术选型合理，能体现候选人的技术判断力",
                "项目难点处理展现了解决问题的能力",
                "团队协作和个人贡献表述清晰",
            ],
            "risks": [
                {"point": "性能数据缺乏压测依据", "suggestion": "补充压测工具和具体数值"},
                {"point": "技术选型理由未说明", "suggestion": "解释为什么选择该技术而非其他方案"},
                {"point": "个人贡献边界模糊", "suggestion": "明确说明哪些是你独立完成的"},
            ],
            "tech_deep_dives": [
                f"为什么在{name}中选择{tech_stack[0] if tech_stack else 'Redis'}？有没有考虑过其他方案？",
                "系统的瓶颈在哪里？你是如何发现并解决的？",
                "如果系统规模扩大10倍，当前架构能支撑吗？需要做哪些改变？",
                "项目中遇到的最大技术挑战是什么？如何解决的？",
                "数据一致性是如何保障的？",
            ],
            "high_freq_questions": [
                "介绍一下这个项目的整体架构",
                "你在项目中承担了哪些具体工作？",
                "项目的QPS大概是多少？如何做到的？",
                f"为什么使用{tech_stack[0] if tech_stack else 'Redis'}？",
                "项目上线后遇到过什么生产问题？怎么排查的？",
                "如果让你重新设计这个系统，你会做哪些改进？",
                "项目的监控和告警是怎么做的？",
                "数据库的表结构是怎么设计的？",
            ],
        }

    def interview_reply(self, history: List[dict], project: dict) -> str:
        """根据对话历史生成面试官追问"""
        round_num = len([m for m in history if m["role"] == "interviewer"])
        questions = [
            "好的，能详细说说你们的技术架构吗？用了哪些中间件？",
            "你提到了性能优化，能说说具体的优化思路和效果吗？",
            "在这个项目中，你遇到的最大技术挑战是什么？最后是怎么解决的？",
            "你们的数据库是怎么设计的？有没有遇到过慢查询问题？",
            "如果系统的并发量突然增加10倍，你会怎么应对？",
            "项目有没有做监控？用的什么工具？遇到过生产故障吗？",
            "这个项目中，你认为自己做得最好的地方是什么？",
            "如果让你重新设计这个系统，你会有哪些不同的选择？",
        ]
        idx = min(round_num, len(questions) - 1)
        return questions[idx]

    def generate_interview_report(self, history: List[dict], project: dict) -> dict:
        """生成面试评估报告"""
        user_msgs = [m for m in history if m["role"] == "user"]
        score = random.randint(65, 88)
        grade = "A" if score >= 85 else "B+" if score >= 78 else "B" if score >= 70 else "C+"
        return {
            "score": score,
            "grade": grade,
            "highlights": [
                "技术细节回答有深度",
                "能主动延伸相关知识点",
                f"对{project.get('name', '项目')}的业务理解清晰",
            ],
            "improvements": [
                "部分技术选型缺乏横向对比",
                "数据支撑还可以更具体（加入压测数据）",
                "未主动提及监控和降级方案",
            ],
            "high_risk_answers": [
                {
                    "round": 3,
                    "issue": "回答中提到'性能提升很多'，表述模糊",
                    "suggestion": "用具体数字量化，例如'P99延迟从500ms降到50ms'",
                }
            ],
            "next_focus": [
                "补充压测数据和工具",
                "准备技术选型对比（为什么选A不选B）",
                "梳理监控/降级/限流方案",
            ],
        }

    def grade_answer(self, question: str, answer: str, reference: str) -> dict:
        """评分简答题"""
        words = len(answer)
        if words < 20:
            score = random.uniform(20, 40)
        elif words < 80:
            score = random.uniform(50, 70)
        else:
            score = random.uniform(70, 90)

        return {
            "score": round(score, 1),
            "correct_points": ["基本概念正确", "举例说明到位"],
            "missing_points": ["未提及边界条件", "缺少性能分析", "没有对比其他方案"],
            "reference_answer": reference,
        }

    def generate_follow_up(self, question: str, answer: str) -> str:
        """生成连环追问"""
        follow_ups = [
            f"你提到了这个概念，能说说它的底层实现原理吗？",
            f"在高并发场景下，这个方案还适用吗？会有什么问题？",
            f"有没有遇到过相关的生产问题？是怎么排查的？",
            f"和其他类似方案相比，这个方案的优缺点是什么？",
            f"如果要对现有方案做优化，你会从哪里入手？",
        ]
        return random.choice(follow_ups)

    def generate_study_plan(self, user_profile: dict, weak_tags: List[str]) -> dict:
        """生成今日学习计划"""
        return {
            "algorithm": [
                {"title": "两数之和", "leetcode_id": 1, "reason": "题单主线推进"},
                {"title": "最长递增子序列", "leetcode_id": 300, "reason": f"薄弱标签: {weak_tags[0] if weak_tags else '动态规划'}"},
            ],
            "questions": [
                {"category": "Redis", "topic": "缓存穿透/击穿/雪崩", "reason": "近期错题"},
                {"category": "MySQL", "topic": "索引优化", "reason": "今日新知识"},
                {"category": "JVM", "topic": "GC机制", "reason": "薄弱点"},
            ],
            "project": [
                {"action": "演练项目模拟面试第2轮", "reason": "上次评分75分，需继续练习"},
            ],
            "estimated_hours": 2.5,
        }


    def generate_plan_items_from_resume(self, resume_text: str) -> list:
        """根据简历文本生成学习计划条目（mock）"""
        return [
            {"title": "Java 并发与线程池", "description": "简历中提到多线程场景，需强化 AQS / Executor 原理", "item_type": "custom"},
            {"title": "MySQL 索引优化", "description": "涉及大数据量查询，需掌握 EXPLAIN 和索引设计", "item_type": "custom"},
            {"title": "Redis 缓存设计", "description": "缓存穿透/击穿/雪崩三大问题", "item_type": "custom"},
            {"title": "JVM 调优", "description": "GC 原理与参数调优实践", "item_type": "custom"},
            {"title": "系统设计：高可用架构", "description": "结合简历项目梳理限流/熔断/降级方案", "item_type": "custom"},
        ]


ai_service = AIService()
