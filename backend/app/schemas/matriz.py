from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


# MOLDE PARA CRIAR UMA MATRIZ
class MatrizCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


# MOLDE PARA ATUALIZAR UMA MATRIZ
class MatrizAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


# MOLDE PARA DEVOLVER UMA MATRIZ AO FRONTEND
class MatrizResposta(BaseModel):
    id: UUID
    usuario_id: UUID
    nome: str
    created_at: datetime