from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# MOLDE PARA CRIAR OU EDITAR NOMES
class NomeEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=150)


# MOLDE PARA ATUALIZAR O PLANEJAMENTO DE UMA TAREFA RACIS
class PlanejamentoTarefaEntrada(BaseModel):
    data_inicio: date | None = None
    data_fim: date | None = None
    status: Literal["pending", "in_progress", "done"] = "pending"


# MOLDE PARA DEFINIR A ATRIBUIÇÃO DE UM MEMBRO A UMA TAREFA
class AtribuicaoEntrada(BaseModel):
    tarefa_id: UUID
    membro_id: UUID
    papel: Literal["R", "A", "C", "I", "S"]