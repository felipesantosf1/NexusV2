
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg2.extras import RealDictCursor

from app.database import get_db
from app.auth import get_current_user
from app.schemas.matriz import ( MatrizCriacao, MatrizAtualizacao, MatrizResposta)

router = APIRouter(prefix="/matrizes", tags=["Matrizes"])

# Lista somente as matrizes do usuário autenticado
@router.get("/", response_model=List[MatrizResposta])
def listar_matrizes(
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    # Busca as matrizes que já existem para o usuário.
    cursor.execute(
        """
        SELECT id, usuario_id, nome, created_at, is_padrao
        FROM matrizes
        WHERE usuario_id = %s
        ORDER BY created_at ASC;
        """,
        [str(usuario["id"])],
    )

    matrizes = cursor.fetchall()

    # Cria a matriz padrão somente se o usuário ainda não tiver nenhuma.
    if not matrizes:
        cursor.execute(
            """
            INSERT INTO matrizes (nome, usuario_id, is_padrao)
            VALUES (%s, %s, TRUE)
            RETURNING id, usuario_id, nome, created_at, is_padrao;
            """,
            ["Matriz Padrão", str(usuario["id"])],
        )

        nova_matriz = cursor.fetchone()

        # Confirma a gravação no banco.
        dados.commit()
        matrizes = [nova_matriz]

    cursor.close()
    return matrizes



# Cria uma matriz vinculada ao usuário autenticado
@router.post("/", response_model=MatrizResposta, status_code=status.HTTP_201_CREATED)
def criar_matriz( matriz: MatrizCriacao, dados=Depends(get_db), usuario=Depends(get_current_user)):
    nome = matriz.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome da matriz.")
    
    cursor = dados.cursor(cursor_factory=RealDictCursor)


    cursor.execute(
        """
        INSERT INTO matrizes (nome, usuario_id, is_padrao)
        VALUES (%s, %s, FALSE)
        RETURNING id, usuario_id, nome, created_at, is_padrao;
        """,
        [nome, str(usuario["id"])],
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
        SELECT id, usuario_id, nome, created_at, is_padrao
        FROM matrizes
        WHERE id = %s AND usuario_id = %s;
        """,
        [str(matriz_id), str(usuario["id"])],
    )

    matriz = cursor.fetchone()
    cursor.close()

    if not matriz:
        raise HTTPException(404, "Matriz não encontrada.")
    return matriz


# Atualiza somente uma matriz pertencente ao usuário autenticado
@router.put("/{matriz_id}", response_model=MatrizResposta)
def atualizar_matriz( matriz_id: UUID, matriz_atualizada: MatrizAtualizacao, dados=Depends(get_db), usuario=Depends(get_current_user)):

    nome = matriz_atualizada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome da matriz.")
    
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        UPDATE matrizes
        SET nome = %s
        WHERE id = %s AND usuario_id = %s
        RETURNING id, usuario_id, nome, created_at, is_padrao;
        """,
        [nome, str(matriz_id), str(usuario["id"])],
    )

    matriz_editada = cursor.fetchone()
    cursor.close()
    if not matriz_editada:
        raise HTTPException(404, "Matriz não encontrada.")
    dados.commit()
    return matriz_editada


# Exclui somente uma matriz pertencente ao usuário autenticado

@router.delete("/{matriz_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_matriz( matriz_id: UUID, dados=Depends(get_db), usuario=Depends(get_current_user)):
    
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        SELECT is_padrao
        FROM matrizes
        WHERE id = %s AND usuario_id = %s;
        """,
        [str(matriz_id), str(usuario["id"])],
    )
    matriz = cursor.fetchone()
    if not matriz:
        cursor.close()
        raise HTTPException(404, "Matriz não encontrada.")

    # ALTERADO: proteção obrigatória no backend, não só na interface.
    if matriz["is_padrao"]:
        cursor.close()
        raise HTTPException(400, "A matriz padrão não pode ser excluída.")

    # NOVO: mantém os cronogramas, tornando-os independentes da matriz excluída.
    cursor.execute(
        """
        UPDATE cronogramas
        SET matriz_id = NULL
        WHERE matriz_id = %s AND usuario_id = %s;
        """,
        [str(matriz_id), str(usuario["id"])],
    )

    cursor.execute(
        "DELETE FROM atribuicoes_raci WHERE matriz_id = %s;",
        [str(matriz_id)],
    )
    cursor.execute(
        "DELETE FROM tarefas_raci WHERE matriz_id = %s;",
        [str(matriz_id)],
    )
    cursor.execute(
        "DELETE FROM membros WHERE matriz_id = %s;",
        [str(matriz_id)],
    )
    cursor.execute(
        "DELETE FROM matrizes WHERE id = %s AND usuario_id = %s;",
        [str(matriz_id), str(usuario["id"])],
    )
    dados.commit()
    cursor.close()
    return None