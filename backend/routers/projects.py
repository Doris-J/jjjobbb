import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.project import Project, InterviewSession, ProjectConversation
from schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, InterviewSessionOut, ConversationOut
from services.auth_service import get_current_user
from services.ai_service import ai_service

router = APIRouter(prefix="/api/projects", tags=["项目深挖"])


@router.get("", response_model=List[ProjectOut])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()


@router.post("", response_model=ProjectOut)
def create_project(data: ProjectCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = Project(**data.model_dump(), user_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    db.delete(project)
    db.commit()
    return {"ok": True}


@router.post("/{project_id}/analyze")
def analyze_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    analysis = ai_service.analyze_project({
        "name": project.name,
        "tech_stack": project.tech_stack,
        "highlights": project.highlights,
        "difficulties": project.difficulties,
    })
    project.analysis = analysis
    db.commit()
    return analysis


@router.post("/{project_id}/interview", response_model=InterviewSessionOut)
def create_interview_session(
    project_id: int,
    mock_company: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    session = InterviewSession(project_id=project_id, user_id=current_user.id, mock_company=mock_company)
    db.add(session)
    db.commit()
    db.refresh(session)
    # 添加开场白
    opener = ProjectConversation(
        session_id=session.id,
        role="interviewer",
        content=f"你好，请先介绍一下「{project.name}」这个项目的背景和你在其中的角色。",
    )
    db.add(opener)
    db.commit()
    return session


@router.get("/{project_id}/sessions", response_model=List[InterviewSessionOut])
def list_sessions(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(InterviewSession).filter(
        InterviewSession.project_id == project_id,
        InterviewSession.user_id == current_user.id,
    ).order_by(InterviewSession.created_at.desc()).all()


@router.get("/sessions/{session_id}/messages", response_model=List[ConversationOut])
def get_messages(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(
        InterviewSession.id == session_id, InterviewSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    return db.query(ProjectConversation).filter(
        ProjectConversation.session_id == session_id
    ).order_by(ProjectConversation.created_at).all()


@router.post("/sessions/{session_id}/end")
def end_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(
        InterviewSession.id == session_id, InterviewSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="面试会话不存在")
    project = db.query(Project).filter(Project.id == session.project_id).first()
    history = [
        {"role": c.role, "content": c.content}
        for c in db.query(ProjectConversation).filter(ProjectConversation.session_id == session_id).all()
    ]
    report = ai_service.generate_interview_report(history, {"name": project.name if project else ""})
    session.report = report
    session.score = report["score"]
    session.ended_at = datetime.utcnow()
    db.commit()
    return report


# WebSocket 面试对话
@router.websocket("/sessions/{session_id}/ws")
async def interview_websocket(
    websocket: WebSocket,
    session_id: int,
    token: str,
    db: Session = Depends(get_db),
):
    from services.auth_service import SECRET_KEY, ALGORITHM
    from jose import jwt, JWTError
    await websocket.accept()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        await websocket.send_json({"error": "认证失败"})
        await websocket.close()
        return

    session = db.query(InterviewSession).filter(
        InterviewSession.id == session_id, InterviewSession.user_id == user_id
    ).first()
    if not session:
        await websocket.send_json({"error": "会话不存在"})
        await websocket.close()
        return

    project = db.query(Project).filter(Project.id == session.project_id).first()

    try:
        while True:
            data = await websocket.receive_json()
            user_content = data.get("content", "")
            if not user_content:
                continue

            # 保存用户消息
            user_msg = ProjectConversation(session_id=session_id, role="user", content=user_content)
            db.add(user_msg)
            db.commit()

            # 获取历史消息
            history = [
                {"role": c.role, "content": c.content}
                for c in db.query(ProjectConversation).filter(
                    ProjectConversation.session_id == session_id
                ).order_by(ProjectConversation.created_at).all()
            ]

            # 生成 AI 回复
            reply = ai_service.interview_reply(history, {"name": project.name if project else ""})

            # 保存 AI 消息
            ai_msg = ProjectConversation(session_id=session_id, role="interviewer", content=reply)
            db.add(ai_msg)
            db.commit()
            db.refresh(ai_msg)

            await websocket.send_json({
                "id": ai_msg.id,
                "role": "interviewer",
                "content": reply,
            })
    except WebSocketDisconnect:
        pass
