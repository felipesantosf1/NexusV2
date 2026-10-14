
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/cronogramas", tags=["Cronogramas"])


class CronogramaCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)

class CronogramaAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)

class VinculoCronograma(BaseModel):
    matriz_id: UUID | None = None


@router.get("/")
def listar_cronogramas(dados=Depends(get_db), usuario=Depends(get_current_user)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        SELECT
            c.id,
            c.usuario_id,
            c.matriz_id,
            COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao,
            COALESCE(m.nome, c.nome) AS nome,
            c.created_at
        FROM cronogramas AS c
        LEFT JOIN matrizes AS m
            ON m.id = c.matriz_id
            AND m.usuario_id = c.usuario_id
        WHERE c.usuario_id = %s
        ORDER BY c.created_at;
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

# ALTERADO: permite renomear um gráfico Gantt independente.
@router.put("/{cronograma_id}")
def atualizar_cronograma(
    cronograma_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome do cronograma.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        UPDATE cronogramas
        SET nome = %s
        WHERE id = %s AND usuario_id = %s
        RETURNING id, usuario_id, matriz_id, nome, created_at;
        """,
        [nome, str(cronograma_id), str(usuario["id"])],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado.")

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
        SELECT
            c.id,
            COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao
        FROM cronogramas AS c
        LEFT JOIN matrizes AS m
            ON m.id = c.matriz_id
            AND m.usuario_id = c.usuario_id
        WHERE c.id = %s AND c.usuario_id = %s;
        """,
        [str(cronograma_id), usuario_id],
    )
    cronograma_atual = cursor.fetchone()

    if not cronograma_atual:
        cursor.close()
        raise HTTPException(404, "Cronograma não encontrado.")

    if entrada.matriz_id is None and cronograma_atual["matriz_is_padrao"]:
        cursor.close()
        raise HTTPException(
            400,
            "O gráfico padrão não pode ser desvinculado da matriz padrão."
        )



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


@router.delete("/{cronograma_id}", status_code=204)
def excluir_cronograma(
    cronograma_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user)
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    # #ALTERADO: identifica se o gráfico está vinculado à matriz padrão.
    cursor.execute(
        """
        SELECT COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao
        FROM cronogramas AS c
        LEFT JOIN matrizes AS m
            ON m.id = c.matriz_id
            AND m.usuario_id = c.usuario_id
        WHERE c.id = %s AND c.usuario_id = %s;
        """,
        [str(cronograma_id), str(usuario["id"])]
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado.")

    # #ALTERADO: proteção no servidor contra exclusão do Gantt padrão.
    if cronograma["matriz_is_padrao"]:
        cursor.close()
        raise HTTPException(
            400,
            "O gráfico padrão não pode ser excluído."
        )

    cursor.execute(
        """
        DELETE FROM cronogramas
        WHERE id = %s AND usuario_id = %s
        RETURNING id;
        """,
        [str(cronograma_id), str(usuario["id"])]
    )

    cronograma_excluido = cursor.fetchone()

    if not cronograma_excluido:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado.")

    dados.commit()
    cursor.close()

    return None

