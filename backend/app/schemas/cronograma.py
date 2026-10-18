from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# MOLDE PARA CRIAR UM CRONOGRAMA
class CronogramaCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


# MOLDE PARA ATUALIZAR UM CRONOGRAMA
class CronogramaAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


# MOLDE PARA ATUALIZAR O PLANEJAMENTO DE UMA TAREFA
class PlanejamentoTarefaAtualizacao(BaseModel):
    data_inicio: date | None = None
    data_fim: date | None = None
    status: Literal["pending", "in_progress", "done"] = "pending"


# MOLDE PARA VINCULAR OU DESVINCULAR UM CRONOGRAMA
class VinculoCronograma(BaseModel):
    matriz_id: UUID | None = None