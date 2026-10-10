from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg2.extras import RealDictCursor

# Ajuste o import do get_db conforme onde ele está no seu projeto atual
from app.database import get_db 
from app.schemas.matriz import MatrizCriacao, MatrizAtualizacao, MatrizResposta

router = APIRouter(prefix="/matrizes", tags=["Matrizes"])

@router.get("/", response_model=List[MatrizResposta])
def listar_matrizes(dados=Depends(get_db)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id, usuario_id, nome, created_at FROM matrizes ORDER BY created_at DESC;")
    matrizes = cursor.fetchall()
    cursor.close()
    return matrizes

@router.post("/", response_model=MatrizResposta, status_code=status.HTTP_201_CREATED)
def criar_matriz(matriz: MatrizCriacao, dados=Depends(get_db)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    
    # Nota: Se você já tiver o ID do usuário logado, substitua o UUID fixo ou passe via request
    cursor.execute(
        """
        INSERT INTO matrizes (nome) 
        VALUES (%s) 
        RETURNING id, usuario_id, nome, created_at;
        """,
        [matriz.nome]
    )
    nova_matriz = cursor.fetchone()
    dados.commit()
    cursor.close()
    return nova_matriz

@router.get("/{matriz_id}", response_model=MatrizResposta)
def buscar_matriz_por_id(matriz_id: UUID, dados=Depends(get_db)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        "SELECT id, usuario_id, nome, created_at FROM matrizes WHERE id = %s;",
        [str(matriz_id)]
    )
    matriz = cursor.fetchone()
    cursor.close()

    if not matriz:
        raise HTTPException(status_code=404, detail="Matriz não encontrada.")

    return matriz

@router.put("/{matriz_id}", response_model=MatrizResposta)
def atualizar_matriz(matriz_id: UUID, matriz_atualizada: MatrizAtualizacao, dados=Depends(get_db)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        UPDATE matrizes
        SET nome = COALESCE(%s, nome)
        WHERE id = %s
        RETURNING id, usuario_id, nome, created_at;
        """,
        [matriz_atualizada.nome, str(matriz_id)]
    )
    matriz_editada = cursor.fetchone()
    cursor.close()

    if not matriz_editada:
        raise HTTPException(status_code=404, detail="Matriz não encontrada.")

    dados.commit()
    return matriz_editada

@router.delete("/{matriz_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_matriz(matriz_id: UUID, dados=Depends(get_db)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        "DELETE FROM matrizes WHERE id = %s RETURNING id;",
        [str(matriz_id)]
    )
    matriz_deletada = cursor.fetchone()
    cursor.close()

    if not matriz_deletada:
        raise HTTPException(status_code=404, detail="Matriz não encontrada.")

    dados.commit()
    return None