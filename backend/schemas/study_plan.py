from pydantic import BaseModel
from typing import Any
from datetime import date


class StudyPlanOut(BaseModel):
    id: int
    date: date
    tasks: Any

    model_config = {"from_attributes": True}
