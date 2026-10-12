
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg2.extras import RealDictCursor

from app.database import get_db
from app.auth import get_current_user
from app.schemas.matriz import (
    MatrizCriacao,
    MatrizAtualizacao,
    MatrizResposta,
)

router = APIRouter(prefix="/matrizes", tags=["Matrizes"])

# Lista somente as matrizes do usuário autenticado
@router.get("/", response_model=List[MatrizResposta])
def listar_matrizes(
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT id, usuario_id, nome, created_at
        FROM matrizes
        WHERE usuario_id = %s
        ORDER BY created_at DESC;
        """,
        [str(usuario["id"])],
    )

    matrizes = cursor.fetchall()

    # Se o usuário não tiver nenhuma matriz, cria a Matriz Padrão automaticamente
    if not matrizes:
        cursor.execute(
            """
            INSERT INTO matrizes (nome, usuario_id)
            VALUES (%s, %s)
            RETURNING id, usuario_id, nome, created_at;
            """,
            ["Matriz Padrão", str(usuario["id"])],
        )
        nova_matriz = cursor.fetchone()
        dados.commit()
        matrizes = [nova_matriz]

    cursor.close()

    return matrizes


# Cria uma matriz vinculada ao usuário autenticado
@router.post(
    "/",
    response_model=MatrizResposta,
    status_code=status.HTTP_201_CREATED,
)
def criar_matriz(
    matriz: MatrizCriacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        INSERT INTO matrizes (nome, usuario_id)
        VALUES (%s, %s)
        RETURNING id, usuario_id, nome, created_at;
        """,
        [matriz.nome, str(usuario["id"])],
    )

    nova_matriz = cursor.fetchone()
    dados.commit()
    cursor.close()

    return nova_matriz


# Busca uma matriz somente se ela pertencer ao usuário autenticado
@router.get("/{matriz_id}", response_model=MatrizResposta)
def buscar_matriz_por_id(
    matriz_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT id, usuario_id, nome, created_at
        FROM matrizes
        WHERE id = %s AND usuario_id = %s;
        """,
        [str(matriz_id), str(usuario["id"])],
    )

    matriz = cursor.fetchone()
    cursor.close()

    if not matriz:
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada.",
        )

    return matriz


# Atualiza somente uma matriz pertencente ao usuário autenticado
@router.put("/{matriz_id}", response_model=MatrizResposta)
def atualizar_matriz(
    matriz_id: UUID,
    matriz_atualizada: MatrizAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        UPDATE matrizes
        SET nome = COALESCE(%s, nome)
        WHERE id = %s AND usuario_id = %s
        RETURNING id, usuario_id, nome, created_at;
        """,
        [
            matriz_atualizada.nome,
            str(matriz_id),
            str(usuario["id"]),
        ],
    )

    matriz_editada = cursor.fetchone()
    dados.commit()
    cursor.close()

    if not matriz_editada:
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada.",
        )

    return matriz_editada


# Exclui somente uma matriz pertencente ao usuário autenticado
@router.delete(
    "/{matriz_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def excluir_matriz(
    matriz_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        DELETE FROM matrizes
        WHERE id = %s AND usuario_id = %s
        RETURNING id;
        """,
        [str(matriz_id), str(usuario["id"])],
    )

    matriz_deletada = cursor.fetchone()
    dados.commit()
    cursor.close()

    if not matriz_deletada:
        raise HTTPException(
            status_code=404,
            detail="Matriz não encontrada.",
        )

    return None
