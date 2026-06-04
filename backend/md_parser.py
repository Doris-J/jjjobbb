"""解析 data/ 目录下的 Markdown 八股文文件，提取题目数据。

目录结构约定：
  data/
    {category}/          ← 一级子目录名 = category
      {subcategory}.md   ← 文件名（不含 .md）= subcategory

Markdown 格式约定（文件内部）：
  # / ## 标题         → 组织章节，忽略
  ### Q1：题目？      → essay|medium（默认）
  ### Q1：题目？ [hard]           → essay|hard
  ### Q1：题目？ [choice|easy]    → 选择题|easy

选择题选项格式（紧跟问题标题后）：
  - A. 选项内容
  - B. 选项内容 ✓    ← ✓ 标记正确答案
  - C. 选项内容
  - D. 选项内容

之后的内容为答案说明。
"""
import re
from pathlib import Path

# 匹配标签：[choice|easy] / [hard] / [essay|medium] 等
_TAG_RE = re.compile(r'\[(?:(choice|essay)\|)?(easy|medium|hard)\]$')
# 匹配选项行：- A. text 或 - A. text ✓
_OPT_RE = re.compile(r'^-\s+([A-D])\.\s+(.*?)(\s+✓)?$')


def _parse_tag(heading: str) -> tuple[str, str, str]:
    """返回 (clean_question, type, difficulty)"""
    m = _TAG_RE.search(heading)
    if not m:
        return heading.strip(), 'essay', 'medium'
    qtype = m.group(1) or 'essay'
    difficulty = m.group(2)
    clean = heading[:m.start()].strip()
    return clean, qtype, difficulty


def _extract_question_text(heading: str) -> str:
    """去掉 Q\\d+ 编号前缀和标签后缀。"""
    text = re.sub(r'^Q\d+[：:]\s*', '', heading)
    text = _TAG_RE.sub('', text).strip()
    return text


def parse_md_file(md_path: Path, category: str, subcategory: str) -> list[dict]:
    """解析单个 Markdown 文件，返回题目列表。"""
    content = md_path.read_text(encoding='utf-8')
    questions = []

    current_question: str | None = None
    current_type: str = 'essay'
    current_difficulty: str = 'medium'
    current_options: list[dict] | None = None
    current_correct: str | None = None
    current_answer_lines: list[str] = []
    in_option_block = False  # 正在读取选项行

    def flush():
        if not current_question:
            return
        answer = '\n'.join(current_answer_lines).strip()
        answer = re.sub(r'\n---\s*$', '', answer).strip()
        questions.append({
            'category': category,
            'subcategory': subcategory,
            'question': current_question,
            'answer': answer,
            'type': current_type,
            'difficulty': current_difficulty,
            'options': current_options,
            'correct_option': current_correct,
            'follow_up_ids': [],
        })

    for line in content.splitlines():
        # # / ## 标题 → 跳过
        if re.match(r'^#{1,2} ', line):
            continue

        # ### Q... → 新题目开始
        if re.match(r'^### ', line):
            flush()
            current_answer_lines = []
            current_options = None
            current_correct = None
            in_option_block = False

            heading = line[4:].strip()
            q_text, qtype, difficulty = _parse_tag(heading)
            current_question = _extract_question_text(q_text) or None
            current_type = qtype
            current_difficulty = difficulty
            in_option_block = (qtype == 'choice')
            continue

        if current_question is None:
            continue

        # 选项行（- A. ... ✓）
        if in_option_block:
            if line.strip() == '':
                continue  # 跳过选项块前后的空行
            m = _OPT_RE.match(line)
            if m:
                key = m.group(1)
                text = m.group(2).strip()
                is_correct = bool(m.group(3))
                if current_options is None:
                    current_options = []
                current_options.append({'key': key, 'text': text})
                if is_correct:
                    current_correct = key
                continue
            else:
                # 选项块结束（遇到非选项/非空行）
                in_option_block = False

        # 其余行累积为答案
        current_answer_lines.append(line)

    flush()
    return questions


def parse_md_content(content: str, category: str, subcategory: str) -> list[dict]:
    """从字符串内容解析题目（与 parse_md_file 相同逻辑，不读文件）。"""
    import tempfile
    import os
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", encoding="utf-8", delete=False) as f:
        f.write(content)
        tmp = f.name
    try:
        return parse_md_file(Path(tmp), category, subcategory)
    finally:
        os.unlink(tmp)


def load_all_md_questions(data_dir: Path) -> list[dict]:
    """扫描 data_dir 下所有 {category}/{subcategory}.md，合并返回所有题目。"""
    all_questions = []
    for category_dir in sorted(data_dir.iterdir()):
        if not category_dir.is_dir():
            continue
        category = category_dir.name
        for md_file in sorted(category_dir.glob('*.md')):
            subcategory = md_file.stem
            qs = parse_md_file(md_file, category, subcategory)
            all_questions.extend(qs)
            print(f"  📄 {category}/{md_file.name}: {len(qs)} 题")
    return all_questions
