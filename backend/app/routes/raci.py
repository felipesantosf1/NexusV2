
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user

from app.database import get_db
from datetime import date

router = APIRouter(tags=["Matriz RACIS"])


class NomeEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=150)


class PlanejamentoTarefaEntrada(BaseModel):
    data_inicio: date | None = None
    data_fim: date | None = None
    status: Literal["pending", "in_progress", "done"] = "pending"


class AtribuicaoEntrada(BaseModel):
    tarefa_id: UUID
    membro_id: UUID
    papel: Literal["R", "A", "C", "I", "S"]




def verificar_matriz(cursor, matriz_id, usuario_id):
    cursor.execute(
        """
        SELECT
            m.id,
            m.workspace_id
        FROM public.matrizes AS m
        INNER JOIN public.workspace_members AS wm
            ON wm.workspace_id = m.workspace_id
        WHERE m.id = %s
        AND wm.usuario_id = %s;
        """,
        [str(matriz_id), str(usuario_id)],
    )

    matriz = cursor.fetchone()

    if not matriz:
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada ou usuário sem acesso ao espaço.",
        )

    return matriz




def garantir_itens_padrao(cursor, matriz_id):
    # Cria uma tarefa padrão somente se ainda não existir.
    cursor.execute(
        """
        INSERT INTO tarefas_raci
            (matriz_id, nome, ordem, is_padrao)
        SELECT %s, 'Tarefa Padrão', 0, TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM tarefas_raci
            WHERE matriz_id = %s AND is_padrao = TRUE
        );
        """,
        [str(matriz_id), str(matriz_id)],
    )

    # Cria um membro padrão somente se ainda não existir.
    cursor.execute(
        """
        INSERT INTO membros
            (matriz_id, nome, ordem, is_padrao)
        SELECT %s, 'Membro Padrão', 0, TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM membros
            WHERE matriz_id = %s AND is_padrao = TRUE
        );
        """,
        [str(matriz_id), str(matriz_id)],
    )


# Retorna tarefas, membros e atribuições de uma matriz
@router.get("/matrizes/{matriz_id}/raci")
def listar_dados_raci(
    matriz_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_matriz(cursor, matriz_id, usuario["id"])
    garantir_itens_padrao(cursor, matriz_id)

    cursor.execute(
        """
        SELECT
            id, matriz_id, nome, ordem,
            data_inicio, data_fim, status,
            is_padrao, created_at
        FROM tarefas_raci
        WHERE matriz_id = %s
        ORDER BY ordem, created_at;
        """,
        [str(matriz_id)],
    )
    tarefas = cursor.fetchall()

    # Consulta os membros na tabela correta.
    cursor.execute(
        """
        SELECT
            id, matriz_id, nome, ordem, is_padrao, created_at
        FROM membros
        WHERE matriz_id = %s
        ORDER BY ordem, created_at;
        """,
        [str(matriz_id)],
    )
    membros = cursor.fetchall()

    # Consulta as atribuições na tabela correta.
    cursor.execute(
        """
        SELECT matriz_id, tarefa_id, membro_id, papel, created_at
        FROM atribuicoes_raci
        WHERE matriz_id = %s;
        """,
        [str(matriz_id)],
    )
    atribuicoes = cursor.fetchall()

    dados.commit()
    cursor.close()

    return {
        "tarefas": tarefas,
        "membros": membros,
        "atribuicoes": atribuicoes,
    }


# Criar tarefa
@router.post(
    "/matrizes/{matriz_id}/tarefas-raci",
    status_code=status.HTTP_201_CREATED,
)
def criar_tarefa_raci(
    matriz_id: UUID,
    entrada: NomeEntrada,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome da tarefa.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima
        FROM tarefas_raci WHERE matriz_id = %s;
        """,
        [str(matriz_id)],
    )
    ordem = cursor.fetchone()["proxima"]

    cursor.execute(
        """
        INSERT INTO tarefas_raci (matriz_id, nome, ordem, is_padrao)
        VALUES (%s, %s, %s, FALSE)
        RETURNING id, matriz_id, nome, ordem, is_padrao, created_at;
        """,
        [str(matriz_id), nome, ordem],
    )
    tarefa = cursor.fetchone()

    dados.commit()
    cursor.close()
    return tarefa


# Editar nome da tarefa, inclusive o nome do item padrão
@router.put("/matrizes/{matriz_id}/tarefas-raci/{tarefa_id}")
def editar_tarefa_raci(
    matriz_id: UUID,
    tarefa_id: UUID,
    entrada: NomeEntrada,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome da tarefa.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        UPDATE tarefas_raci SET nome = %s
        WHERE id = %s AND matriz_id = %s
        RETURNING id, matriz_id, nome, ordem, is_padrao, created_at;
        """,
        [nome, str(tarefa_id), str(matriz_id)],
    )
    tarefa = cursor.fetchone()

    if not tarefa:
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada.")

    dados.commit()
    cursor.close()
    return tarefa


# Atualiza prazo e status de uma tarefa RACIS.
@router.patch(
    "/matrizes/{matriz_id}/tarefas-raci/{tarefa_id}/planejamento"
)
def atualizar_planejamento_raci(
    matriz_id: UUID,
    tarefa_id: UUID,
    entrada: PlanejamentoTarefaEntrada,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    if (entrada.data_inicio is None) != (entrada.data_fim is None):
        raise HTTPException(
            400,
            "Preencha as duas datas ou deixe ambas vazias.",
        )

    if (
        entrada.data_inicio is not None
        and entrada.data_fim < entrada.data_inicio
    ):
        raise HTTPException(
            400,
            "A data final deve ser igual ou posterior à data inicial.",
        )

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        UPDATE tarefas_raci
        SET data_inicio = %s,
            data_fim = %s,
            status = %s
        WHERE id = %s AND matriz_id = %s
        RETURNING
            id, matriz_id, nome, ordem,
            data_inicio, data_fim, status,
            is_padrao, created_at;
        """,
        [
            entrada.data_inicio,
            entrada.data_fim,
            entrada.status,
            str(tarefa_id),
            str(matriz_id),
        ],
    )

    tarefa = cursor.fetchone()

    if not tarefa:
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada.")

    dados.commit()
    cursor.close()
    return tarefa

# Excluir tarefa, exceto se for padrão
@router.delete(
    "/matrizes/{matriz_id}/tarefas-raci/{tarefa_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def excluir_tarefa_raci(
    matriz_id: UUID,
    tarefa_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        SELECT is_padrao FROM tarefas_raci
        WHERE id = %s AND matriz_id = %s;
        """,
        [str(tarefa_id), str(matriz_id)],
    )
    tarefa = cursor.fetchone()

    if not tarefa:
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada.")

    if tarefa["is_padrao"]:
        cursor.close()
        raise HTTPException(400, "A tarefa padrão não pode ser excluída.")

    cursor.execute(
        """
        DELETE FROM atribuicoes_raci
        WHERE tarefa_id = %s AND matriz_id = %s;
        """,
        [str(tarefa_id), str(matriz_id)],
    )
    cursor.execute(
        """
        DELETE FROM tarefas_raci
        WHERE id = %s AND matriz_id = %s;
        """,
        [str(tarefa_id), str(matriz_id)],
    )

    dados.commit()
    cursor.close()
    return None


# Criar membro
@router.post(
    "/matrizes/{matriz_id}/membros",
    status_code=status.HTTP_201_CREATED,
)
def criar_membro(
    matriz_id: UUID,
    entrada: NomeEntrada,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do membro.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima
        FROM membros WHERE matriz_id = %s;
        """,
        [str(matriz_id)],
    )
    ordem = cursor.fetchone()["proxima"]

    cursor.execute(
        """
        INSERT INTO membros (matriz_id, nome, ordem, is_padrao)
        VALUES (%s, %s, %s, FALSE)
        RETURNING id, matriz_id, nome, ordem, is_padrao, created_at;
        """,
        [str(matriz_id), nome, ordem],
    )
    membro = cursor.fetchone()

    dados.commit()
    cursor.close()
    return membro


# Editar nome do membro, inclusive o nome do item padrão
@router.put("/matrizes/{matriz_id}/membros/{membro_id}")
def editar_membro(
    matriz_id: UUID,
    membro_id: UUID,
    entrada: NomeEntrada,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do membro.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        UPDATE membros SET nome = %s
        WHERE id = %s AND matriz_id = %s
        RETURNING id, matriz_id, nome, ordem, is_padrao, created_at;
        """,
        [nome, str(membro_id), str(matriz_id)],
    )
    membro = cursor.fetchone()

    if not membro:
        cursor.close()
        raise HTTPException(404, "Membro não encontrado.")

    dados.commit()
    cursor.close()
    return membro


# Excluir membro, exceto se for padrão
@router.delete(
    "/matrizes/{matriz_id}/membros/{membro_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def excluir_membro(
    matriz_id: UUID,
    membro_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        SELECT is_padrao FROM membros
        WHERE id = %s AND matriz_id = %s;
        """,
        [str(membro_id), str(matriz_id)],
    )
    membro = cursor.fetchone()

    if not membro:
        cursor.close()
        raise HTTPException(404, "Membro não encontrado.")

    if membro["is_padrao"]:
        cursor.close()
        raise HTTPException(400, "O membro padrão não pode ser excluído.")

    cursor.execute(
        """
        DELETE FROM atribuicoes_raci
        WHERE membro_id = %s AND matriz_id = %s;
        """,
        [str(membro_id), str(matriz_id)],
    )
    cursor.execute(
        """
        DELETE FROM membros
        WHERE id = %s AND matriz_id = %s;
        """,
        [str(membro_id), str(matriz_id)],
    )

    dados.commit()
    cursor.close()
    return None


# Criar ou atualizar um papel RACIS para uma tarefa e membro
@router.put("/matrizes/{matriz_id}/atribuicoes")
def salvar_atribuicao(
    matriz_id: UUID,
    entrada: AtribuicaoEntrada,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        SELECT id FROM tarefas_raci
        WHERE id = %s AND matriz_id = %s;
        """,
        [str(entrada.tarefa_id), str(matriz_id)],
    )
    if not cursor.fetchone():
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada nesta matriz.")

    cursor.execute(
        """
        SELECT id FROM membros
        WHERE id = %s AND matriz_id = %s;
        """,
        [str(entrada.membro_id), str(matriz_id)],
    )
    if not cursor.fetchone():
        cursor.close()
        raise HTTPException(404, "Membro não encontrado nesta matriz.")

    # Remove eventual papel anterior para essa combinação.
    cursor.execute(
        """
        DELETE FROM atribuicoes_raci
        WHERE matriz_id = %s AND tarefa_id = %s AND membro_id = %s;
        """,
        [
            str(matriz_id),
            str(entrada.tarefa_id),
            str(entrada.membro_id),
        ],
    )

    cursor.execute(
        """
        INSERT INTO atribuicoes_raci
            (matriz_id, tarefa_id, membro_id, papel)
        VALUES (%s, %s, %s, %s)
        RETURNING matriz_id, tarefa_id, membro_id, papel, created_at;
        """,
        [
            str(matriz_id),
            str(entrada.tarefa_id),
            str(entrada.membro_id),
            entrada.papel,
        ],
    )
    atribuicao = cursor.fetchone()

    dados.commit()
    cursor.close()
    return atribuicao


# Remover o papel de uma pessoa em uma tarefa
@router.delete(
    "/matrizes/{matriz_id}/atribuicoes/{tarefa_id}/{membro_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def excluir_atribuicao(
    matriz_id: UUID,
    tarefa_id: UUID,
    membro_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    verificar_matriz(cursor, matriz_id, usuario["id"])

    cursor.execute(
        """
        DELETE FROM atribuicoes_raci
        WHERE matriz_id = %s AND tarefa_id = %s AND membro_id = %s;
        """,
        [str(matriz_id), str(tarefa_id), str(membro_id)],
    )

    dados.commit()
    cursor.close()
    return None
