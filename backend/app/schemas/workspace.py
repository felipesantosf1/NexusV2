from typing import Literal

from pydantic import BaseModel, Field


# MOLDE PARA CRIAR UM ESPAÇO DE TRABALHO
class WorkspaceCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


# MOLDE PARA ATUALIZAR O NOME DE UM ESPAÇO DE TRABALHO
class WorkspaceAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


# MOLDE PARA ALTERAR A PERMISSÃO DE UM INTEGRANTE
class WorkspacePapelAtualizacao(BaseModel):
    papel: Literal["owner", "editor", "viewer"]