
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg2.extras import RealDictCursor

from app.database import get_db
from app.auth import get_current_user
from app.workspace_context import get_current_workspace, exigir_edicao
from app.schemas.matriz import (
    MatrizCriacao,
    MatrizAtualizacao,
    MatrizResposta,
)

router = APIRouter(prefix="/matrizes", tags=["Matrizes"])

# Lista somente as matrizes do espaço atual.
@router.get("/", response_model=List[MatrizResposta])
def listar_matrizes(
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT id, usuario_id, nome, created_at, is_padrao
        FROM public.matrizes
        WHERE workspace_id = %s
        ORDER BY created_at ASC;
        """,
        [str(workspace["id"])],
    )

    matrizes = cursor.fetchall()
    cursor.close()

    return matrizes


# Cria uma matriz no espaço atual.
@router.post("/", response_model=MatrizResposta, status_code=status.HTTP_201_CREATED)
def criar_matriz(
    matriz: MatrizCriacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
    workspace=Depends(get_current_workspace),
):

    exigir_edicao(workspace)
    
    nome = matriz.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome da matriz.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        INSERT INTO public.matrizes
            (nome, usuario_id, workspace_id, is_padrao)
        VALUES (%s, %s, %s, FALSE)
        RETURNING id, usuario_id, nome, created_at, is_padrao;
        """,
        [nome, str(usuario["id"]), str(workspace["id"])],
    )

    nova_matriz = cursor.fetchone()
    dados.commit()
    cursor.close()

    return nova_matriz


# Busca uma matriz somente no espaço atual.
@router.get("/{matriz_id}", response_model=MatrizResposta)
def buscar_matriz_por_id(
    matriz_id: UUID,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT id, usuario_id, nome, created_at, is_padrao
        FROM public.matrizes
        WHERE id = %s AND workspace_id = %s;
        """,
        [str(matriz_id), str(workspace["id"])],
    )

    matriz = cursor.fetchone()
    cursor.close()

    if not matriz:
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada neste espaço de trabalho.",
        )

    return matriz


# Atualiza uma matriz somente no espaço atual.
@router.put("/{matriz_id}", response_model=MatrizResposta)
def atualizar_matriz(
    matriz_id: UUID,
    matriz_atualizada: MatrizAtualizacao,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    exigir_edicao(workspace)

    nome = matriz_atualizada.nome.strip()

    if not nome:
        raise HTTPException(
            status_code=400,
            detail="Informe o nome da matriz.",
        )

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        UPDATE public.matrizes
        SET nome = %s
        WHERE id = %s AND workspace_id = %s
        RETURNING id, usuario_id, nome, created_at, is_padrao;
        """,
        [nome, str(matriz_id), str(workspace["id"])],
    )

    matriz_editada = cursor.fetchone()

    if not matriz_editada:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada neste espaço de trabalho.",
        )

    dados.commit()
    cursor.close()

    return matriz_editada


# Exclui uma matriz do espaço atual, exceto a matriz padrão.
@router.delete(
    "/{matriz_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def excluir_matriz(
    matriz_id: UUID,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):

    exigir_edicao(workspace)
    
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT is_padrao
        FROM public.matrizes
        WHERE id = %s AND workspace_id = %s;
        """,
        [str(matriz_id), str(workspace["id"])],
    )

    matriz = cursor.fetchone()

    if not matriz:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada neste espaço de trabalho.",
        )

    if matriz["is_padrao"]:
        cursor.close()
        raise HTTPException(
            status_code=400,
            detail="A matriz padrão não pode ser excluída.",
        )

    # Mantém o cronograma, removendo apenas o vínculo com a matriz.
    cursor.execute(
        """
        UPDATE public.cronogramas
        SET matriz_id = NULL
        WHERE matriz_id = %s AND workspace_id = %s;
        """,
        [str(matriz_id), str(workspace["id"])],
    )

    cursor.execute(
        """
        DELETE FROM public.atribuicoes_raci
        WHERE matriz_id = %s;
        """,
        [str(matriz_id)],
    )

    cursor.execute(
        """
        DELETE FROM public.tarefas_raci
        WHERE matriz_id = %s;
        """,
        [str(matriz_id)],
    )

    cursor.execute(
        """
        DELETE FROM public.membros
        WHERE matriz_id = %s;
        """,
        [str(matriz_id)],
    )

    cursor.execute(
        """
        DELETE FROM public.matrizes
        WHERE id = %s AND workspace_id = %s;
        """,
        [str(matriz_id), str(workspace["id"])],
    )

    dados.commit()
    cursor.close()

    return None
