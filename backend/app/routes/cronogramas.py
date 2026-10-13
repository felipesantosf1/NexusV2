
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/cronogramas", tags=["Cronogramas"])


class CronogramaCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


class VinculoCronograma(BaseModel):
    matriz_id: UUID | None = None


@router.get("/")
def listar_cronogramas(
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        SELECT id, usuario_id, matriz_id, nome, created_at
        FROM cronogramas
        WHERE usuario_id = %s
        ORDER BY created_at;
        """,
        [str(usuario["id"])],
    )
    resultado = cursor.fetchall()
    cursor.close()
    return resultado


@router.post("/", status_code=201)
def criar_cronograma(
    entrada: CronogramaCriacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do cronograma.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        INSERT INTO cronogramas (usuario_id, matriz_id, nome)
        VALUES (%s, NULL, %s)
        RETURNING id, usuario_id, matriz_id, nome, created_at;
        """,
        [str(usuario["id"]), nome],
    )
    cronograma = cursor.fetchone()
    dados.commit()
    cursor.close()
    return cronograma


@router.put("/{cronograma_id}/vinculo")
def atualizar_vinculo(
    cronograma_id: UUID,
    entrada: VinculoCronograma,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    usuario_id = str(usuario["id"])

    cursor.execute(
        """
        SELECT id FROM cronogramas
        WHERE id = %s AND usuario_id = %s;
        """,
        [str(cronograma_id), usuario_id],
    )
    if not cursor.fetchone():
        cursor.close()
        raise HTTPException(404, "Cronograma não encontrado.")

    if entrada.matriz_id is not None:
        cursor.execute(
            """
            SELECT id FROM matrizes
            WHERE id = %s AND usuario_id = %s;
            """,
            [str(entrada.matriz_id), usuario_id],
        )
        if not cursor.fetchone():
            cursor.close()
            raise HTTPException(404, "Matriz não encontrada.")

        # Cada matriz pode ter no máximo um Gantt vinculado.
        cursor.execute(
            """
            SELECT id FROM cronogramas
            WHERE matriz_id = %s
            AND usuario_id = %s
            AND id <> %s;
            """,
            [
                str(entrada.matriz_id),
                usuario_id,
                str(cronograma_id),
            ],
        )
        if cursor.fetchone():
            cursor.close()
            raise HTTPException(
                409,
                "Esta matriz já possui um cronograma vinculado.",
            )

    cursor.execute(
        """
        UPDATE cronogramas
        SET matriz_id = %s
        WHERE id = %s AND usuario_id = %s
        RETURNING id, usuario_id, matriz_id, nome, created_at;
        """,
        [
            str(entrada.matriz_id) if entrada.matriz_id else None,
            str(cronograma_id),
            usuario_id,
        ],
    )
    cronograma = cursor.fetchone()
    dados.commit()
    cursor.close()
    return cronograma
